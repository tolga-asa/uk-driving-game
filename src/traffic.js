// AI traffic, part 1: route planning. Each car follows a polyline of lane points with "gates"
// (stop lines, crossings, obstructions) where it may have to wait.
const CAR_COLORS = ['#c8102e', '#1d4e89', '#f2f2ee', '#2b2b2b', '#6b7b8c', '#2f6b3a', '#d9a400', '#8a8f98', '#5a2d82', '#b5651d', '#0f7b8a', '#e8e1cf'];
const traffic = { cars: [], peds: [] };

// Turn from arriving on `arm` to leaving on `ex`: >0 right, <0 left (radians).
const turnOf = (arm, ex) => angDiff(ex.ang, arm.ang + Math.PI);
const rbSweep = (arm, ex) => { let sw = ((ex.ang - arm.ang) % TAU + TAU) % TAU; if (sw < 0.3) sw += TAU; return sw; };
const stopS = (n, arm) => sFrom(arm, n.r + 0.8);
const oppositeArm = (n, arm) => n.arms.reduce((b, a) => a !== arm && (!b || Math.abs(angDiff(a.ang, arm.ang + Math.PI)) < Math.abs(angDiff(b.ang, arm.ang + Math.PI))) ? a : b, null);

// Lane obstructions (parked cars, build-outs) per road and direction, merged into intervals.
function buildObstructions() {
  for (const e of world.edges) e.obst = { 1: [], '-1': [] };
  const byKey = new Map();
  for (const p of world.parked) { const k = p.e.id + ':' + p.dir; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(p.s); }
  for (const [k, list] of byKey) {
    const [id, dir] = k.split(':'), e = world.edges[+id];
    list.sort((a, b) => a - b);
    let lo = list[0], hi = list[0];
    for (const s of list.slice(1)) { if (s - hi < 14) hi = s; else { e.obst[dir].push([lo - 3, hi + 3]); lo = hi = s; } }
    e.obst[dir].push([lo - 3, hi + 3]);
  }
  for (const o of world.obstacles) o.e.obst[o.side > 0 ? 1 : -1].push([o.s - o.len / 2, o.s + o.len / 2]);
}
function bulgeAt(e, dir, lane, s) {
  if (lane !== 0) return 0;
  let w = 0;
  for (const [lo, hi] of e.obst[dir] || []) {
    const d = s < lo ? lo - s : s > hi ? s - hi : 0;
    w = Math.max(w, clamp(1 - d / 10, 0, 1));
  }
  if (!w) return 0;
  const toward = Math.sign(e.div - laneLat(e, dir, 0)) || -dir;
  return toward * w * e.laneW * (lanesOf(e, dir) > 1 ? 1 : 0.92);
}

function pushPt(car, x, y) {
  const last = car.pts[car.pts.length - 1];
  const d = last ? Math.hypot(x - last[0], y - last[1]) : 0;
  if (last && d < 0.05) return;
  car.pts.push([x, y]);
  car.cum.push((car.cum.length ? car.cum[car.cum.length - 1] : 0) + d);
}
const pathEnd = (car) => car.cum[car.cum.length - 1];

function chooseExit(car, n, arm) {
  let opts = n.arms.filter(a => a !== arm && canExit(a));
  if (!opts.length) opts = [arm];
  const ws = opts.map(a => {
    let w = 1 + a.e.rank * 0.6;
    if (Math.abs(turnOf(arm, a)) < 0.5) w += 1.6;
    if (a.e.kind === 'single') w *= car.kind === 'tractor' ? 3 : 0.25;
    if (car.kind === 'tractor' && (a.e.kind === 'city' || a.e.kind === 'town')) w *= 0.1;
    if (car.kind === 'bus' && (a.e.busF || a.e.busB)) w *= 3;
    if ((car.kind === 'taxi' || car.kind === 'bus') && a.e.district !== 'city') w *= 0.3;
    return w;
  });
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < opts.length; i++) if ((r -= ws[i]) <= 0) return opts[i];
  return opts[0];
}

function laneFor(car, e, dir, n, arm, ex) {
  const L = lanesOf(e, dir);
  if (L <= 1) return 0;
  const bus = isBusLane(e, dir, 0);
  if (bus && car.kind === 'bus') return 0;
  const right = n.type === 'rb' || n.type === 'mini' ? rbSweep(arm, ex) > 3.7 : turnOf(arm, ex) > 0.5;
  if (right) return L - 1;
  return bus ? 1 : (Math.random() < 0.25 ? Math.min(1, L - 1) : 0);
}

function gateType(n, arm, ex) {
  if (n.type === 'lights') return 'lights';
  if (n.type === 'rb' || n.type === 'mini') return 'rb';
  if (n.type === 'unmarked') return 'unmarked';
  if ((n.type === 'give' || n.type === 'stop') && !arm.major) return n.type;
  if ((n.type === 'give' || n.type === 'stop') && turnOf(arm, ex) > 0.5) return 'right';
  return null;
}

// Queue the drive along road `e` (direction `dir`) from edge position s0 up to the stop line at node `to`.
function queueEdge(car, e, dir, s0, lane, to, arm, ex) {
  const s1 = stopS(to, arm);
  const marks = [];
  for (const c of world.crossings) if (c.e === e && (c.s - s0) * dir > 4 && (s1 - c.s) * dir > 0) marks.push({ s: c.s - dir * 4.5, g: { type: c.kind, c } });
  for (const lx of world.levelX) if (lx.e === e && (lx.s - s0) * dir > 8 && (s1 - lx.s) * dir > 0) marks.push({ s: lx.s - dir * 9, g: { type: 'lx', lx } });
  for (const h of e.humps) if ((h - s0) * dir > 2 && (s1 - h) * dir > 0) marks.push({ s: h - dir * 8, g: { type: 'hump', s: h } });
  if (lane === 0 && lanesOf(e, dir) === 1 && lanesOf(e, -dir) > 0)
    for (const [lo, hi] of e.obst[dir] || []) {
      const start = dir > 0 ? lo : hi, end = dir > 0 ? hi : lo;
      if ((start - s0) * dir > 14 && (s1 - end) * dir > 0) {
        const a = pointAt(e, start), b = pointAt(e, end);
        marks.push({ s: start - dir * 12, g: { type: 'obst', ax: a.x, ay: a.y, bx: b.x, by: b.y, e, dir } });
      }
    }
  const ss = [];
  for (let s = s0; (s1 - s) * dir > 0; s += dir * 5) ss.push(s);
  ss.push(s1);
  for (const m of marks) ss.push(m.s);
  ss.sort((p, q) => (p - q) * dir);
  for (const s of ss) {
    const p = pointAt(e, s, laneLat(e, dir, lane) + bulgeAt(e, dir, lane, s));
    pushPt(car, p.x, p.y);
    for (const m of marks) if (m.s === s && !m.done) { m.done = true; car.gates.push({ ...m.g, s: pathEnd(car) }); }
  }
  const t = gateType(to, arm, ex);
  if (t) car.gates.push({ type: t, s: pathEnd(car), node: to, arm, ex, lane });
  car.next = { node: to, arm, ex, lane, e, dir };
}

function junctionPath(car, n, armIn, laneIn, armOut, laneOut) {
  const eI = armIn.e, dI = dirIn(armIn), eO = armOut.e, dO = -dirIn(armOut);
  const pin = pointAt(eI, stopS(n, armIn), laneLat(eI, dI, laneIn));
  const pout = pointAt(eO, stopS(n, armOut), laneLat(eO, dO, laneOut));
  if (n.type === 'rb' || n.type === 'mini') {
    const inner = n.ringLanes > 1 && lanesOf(eI, dI) > 1 && laneIn === lanesOf(eI, dI) - 1;
    const Ro = n.type === 'mini' ? Math.max(3.4, n.ringR * 0.62) : n.ringR - LANE_W * 0.55;
    const Ri = inner ? n.ringR - LANE_W * 1.5 : Ro;
    const a0 = Math.atan2(pin.y - n.y, pin.x - n.x);
    let a1 = Math.atan2(pout.y - n.y, pout.x - n.x);
    while (a1 < a0 + 0.3) a1 += TAU;
    const steps = Math.max(4, Math.ceil((a1 - a0) / 0.1));
    for (let k = 1; k < steps; k++) {
      const t = k / steps, a = a0 + (a1 - a0) * t;
      const r = Ri + (Ro - Ri) * clamp((t - 0.7) / 0.3, 0, 1);
      const ein = clamp(1 - k / 2, 0, 1), eout = clamp(1 - (steps - k) / 2, 0, 1);   // blend from the entry and into the exit
      let x = n.x + Math.cos(a) * r, y = n.y + Math.sin(a) * r;
      x += (pin.x - x) * ein * 0.4 + (pout.x - x) * eout * 0.4; y += (pin.y - y) * ein * 0.4 + (pout.y - y) * eout * 0.4;
      pushPt(car, x, y);
    }
    pushPt(car, pout.x, pout.y);
    return;
  }
  const hIn = dI > 0 ? pin.ang : pin.ang + Math.PI, hOut = dO > 0 ? pout.ang : pout.ang + Math.PI;
  const d = Math.hypot(pout.x - pin.x, pout.y - pin.y), k = d * 0.42;
  const c1 = [pin.x + Math.cos(hIn) * k, pin.y + Math.sin(hIn) * k], c2 = [pout.x - Math.cos(hOut) * k, pout.y - Math.sin(hOut) * k];
  const N = Math.max(2, Math.ceil(d / 2.5));
  for (let i = 1; i <= N; i++) {
    const t = i / N, u = 1 - t;
    pushPt(car, u * u * u * pin.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * pout.x,
      u * u * u * pin.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * pout.y);
  }
}

function planNext(car) {
  const { node: n, arm, ex, lane } = car.next;
  const e2 = ex.e, dir2 = -dirIn(ex);
  const to2 = dir2 > 0 ? e2.b : e2.a;
  const arm2 = to2.arms.find(a => a.e === e2 && a.end === (dir2 > 0 ? 'b' : 'a'));
  const ex2 = chooseExit(car, to2, arm2);
  const lane2 = laneFor(car, e2, dir2, to2, arm2, ex2);
  junctionPath(car, n, arm, lane, ex, lane2);
  queueEdge(car, e2, dir2, stopS(n, ex), lane2, to2, arm2, ex2);
  let cut = 0;                                   // drop path already driven
  while (cut < car.cum.length - 3 && car.cum[cut + 2] < car.s - 2) cut++;
  if (cut > 0) {
    const off = car.cum[cut];
    car.pts.splice(0, cut); car.cum.splice(0, cut);
    for (let k = 0; k < car.cum.length; k++) car.cum[k] -= off;
    car.s -= off;
    for (const g of car.gates) g.s -= off;
    car.gates = car.gates.filter(g => g.s > car.s - 3);
  }
}

function spawnCar(e, dir, s, kind, R) {
  const to = dir > 0 ? e.b : e.a, arm = to.arms.find(a => a.e === e && a.end === (dir > 0 ? 'b' : 'a'));
  const car = { pts: [], cum: [], gates: [], s: 0, speed: 0, wait: 0, stunned: 0, ai: true, ind: 0, kind,
    len: 4.3, wid: 1.8, color: CAR_COLORS[(R() * CAR_COLORS.length) | 0], eager: 0.88 + R() * 0.16, x: 0, y: 0, heading: 0 };
  if (kind === 'bus') { car.len = 10.5; car.wid = 2.55; car.color = '#c8102e'; car.eager = 0.8; car.maxV = 13; }
  if (kind === 'van') { car.len = 5.3; car.wid = 2; car.color = R() < 0.5 ? '#f2f2ee' : '#2d4f86'; }
  if (kind === 'taxi') { car.color = '#151515'; car.len = 4.6; }
  if (kind === 'tractor') { car.len = 4.8; car.wid = 2.3; car.color = '#3f7d2c'; car.maxV = 7; }
  const ex = chooseExit(car, to, arm), lane = laneFor(car, e, dir, to, arm, ex);
  queueEdge(car, e, dir, s, lane, to, arm, ex);
  car.x = car.pts[0][0]; car.y = car.pts[0][1];
  car.heading = car.pts[1] ? Math.atan2(car.pts[1][1] - car.pts[0][1], car.pts[1][0] - car.pts[0][0]) : 0;
  traffic.cars.push(car);
  return car;
}

function spawnTraffic(R, avoid) {
  traffic.cars.length = 0;
  const weighted = world.edges.map(e => ({ e, w: e.len * (e.lanesF + e.lanesB) * (e.district === 'city' ? 1.7 : e.kind === 'single' ? 0.3 : 1) }));
  const total = weighted.reduce((a, b) => a + b.w, 0);
  const pickEdge = () => { let r = R() * total; for (const x of weighted) if ((r -= x.w) <= 0) return x.e; return weighted[0].e; };
  let tries = 0;
  const add = (kind, filter) => {
    while (tries++ < 6000) {
      const e = pickEdge();
      if (filter && !filter(e)) continue;
      const dirs = [1, -1].filter(d => lanesOf(e, d));
      const dir = dirs[(R() * dirs.length) | 0];
      if (e.len - e.a.r - e.b.r < 40) continue;
      const s = e.a.r + 15 + R() * (e.len - e.a.r - e.b.r - 30);
      const p = pointAt(e, s);
      if (avoid && Math.hypot(p.x - avoid.x, p.y - avoid.y) < 45) continue;
      if (traffic.cars.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 12)) continue;
      if (world.levelX.some(l => Math.hypot(l.x - p.x, l.y - p.y) < 20)) continue;
      spawnCar(e, dir, s, kind, R);
      return;
    }
  };
  for (let k = 0; k < 7; k++) add('bus', e => e.district === 'city');
  for (let k = 0; k < 14; k++) add('taxi', e => e.district === 'city');
  for (let k = 0; k < 3; k++) add('tractor', e => e.kind === 'rural' || e.kind === 'single');
  for (let k = 0; k < 12; k++) add('van');
  for (let k = 0; k < 95; k++) add('car');
}
