// AI traffic (keeps left, goes clockwise round roundabouts, stops at red and for zebra crossings)
// and pedestrians (pavement walkers and zebra-crossing users).
const CAR_COLORS = ['#c8102e', '#1d4e89', '#f2f2ee', '#2b2b2b', '#6b7b8c', '#2f6b3a', '#d9a400', '#8a8f98', '#5a2d82', '#b5651d', '#0f7b8a', '#e8e1cf'];
const traffic = { cars: [], peds: [] };

const armAngle = (arm) => arm * Math.PI / 2;
function laneIn(n, arm, t) {           // point on arm `arm`, distance t from centre, for traffic heading INTO the node
  const d = DIRS[arm], l = leftOf([-d[0], -d[1]]);
  return [n.x + d[0] * t + l[0] * LANE, n.y + d[1] * t + l[1] * LANE];
}
function laneOut(n, arm, t) {          // same, for traffic heading OUT along that arm
  const d = DIRS[arm], l = leftOf(d);
  return [n.x + d[0] * t + l[0] * LANE, n.y + d[1] * t + l[1] * LANE];
}
const stopDist = (n) => n.type === 'rb' ? RB_OUT + 1.5 : n.r + 1.4;
const RB_DELTA = Math.asin(LANE / RB_LANE);
const rbEntryAngle = (arm) => armAngle(arm) + RB_DELTA;

function junctionPath(n, arm, ex) {
  const pts = [];
  if (n.type === 'rb') {
    const a0 = rbEntryAngle(arm);
    let a1 = armAngle(ex) - RB_DELTA;
    while (a1 < a0 + 0.35) a1 += Math.PI * 2;
    const steps = Math.max(3, Math.ceil((a1 - a0) / 0.2));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (a1 - a0) * k / steps;
      pts.push([n.x + Math.cos(a) * RB_LANE, n.y + Math.sin(a) * RB_LANE]);
    }
    return pts;
  }
  if (ex === (arm + 2) % 4) return pts;    // straight on: the lane lines meet directly
  const dIn = [-DIRS[arm][0], -DIRS[arm][1]], dOut = DIRS[ex];
  const lI = leftOf(dIn), lO = leftOf(dOut);
  const p0 = laneIn(n, arm, n.r), p2 = laneOut(n, ex, n.r);
  const c = [n.x + (lI[0] + lO[0]) * LANE, n.y + (lI[1] + lO[1]) * LANE];
  for (let k = 1; k < 8; k++) {
    const t = k / 8, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]]);
  }
  return pts;
}

function pushPt(car, p) {
  const last = car.pts[car.pts.length - 1];
  const d = last ? Math.hypot(p[0] - last[0], p[1] - last[1]) : 0;
  if (last && d < 0.05) return;
  car.pts.push(p);
  car.cum.push((car.cum.length ? car.cum[car.cum.length - 1] : 0) + d);
}
const pathEnd = (car) => car.cum[car.cum.length - 1];

// Drive along `edge` towards node `to`; queue the street, its zebra, and the stop/give-way line.
function queueStreet(car, edge, to) {
  const arm = to === edge.b ? (edge.dir + 2) % 4 : edge.dir;   // arm of `to` we arrive on
  if (edge.zebra) {
    const z = edge.zebra, from = to === edge.b ? edge.a : edge.b;
    const d = DIRS[(arm + 2) % 4];   // travel direction
    const l = leftOf(d);
    const zs = Math.hypot(z.x - from.x, z.y - from.y) - 3;
    const last = car.pts[car.pts.length - 1];
    const lastAlong = (last[0] - from.x) * d[0] + (last[1] - from.y) * d[1];
    if (zs > lastAlong + 1) {
      pushPt(car, [from.x + d[0] * zs + l[0] * LANE, from.y + d[1] * zs + l[1] * LANE]);
      car.gates.push({ type: 'zebra', s: pathEnd(car), z });
    }
  }
  pushPt(car, laneIn(to, arm, stopDist(to)));
  car.gates.push({ type: to.type, s: pathEnd(car), node: to, arm });
  car.next = { node: to, arm };
}

function planNext(car) {
  const { node: n, arm } = car.next;
  let choices = n.arms.filter(a => a !== arm);
  if (!choices.length) choices = [arm];
  // Prefer going straight a bit more often, like real traffic.
  const straight = (arm + 2) % 4;
  let ex = choices[(Math.random() * choices.length) | 0];
  if (choices.includes(straight) && Math.random() < 0.35) ex = straight;
  const g = car.gates[car.gates.length - 1];
  if (g && g.node === n) g.exit = ex;
  for (const p of junctionPath(n, arm, ex)) pushPt(car, p);
  pushPt(car, laneOut(n, ex, stopDist(n)));
  const e = n.edges[ex];
  queueStreet(car, e, e.a === n ? e.b : e.a);
  // Drop path we have already driven.
  while (car.cum.length > 4 && car.cum[2] < car.s - 1) {
    const off = car.cum[1];
    car.pts.shift(); car.cum.shift();
    for (let k = 0; k < car.cum.length; k++) car.cum[k] -= off;
    car.s -= off;
    for (const gt of car.gates) gt.s -= off;
  }
  car.gates = car.gates.filter(gt => gt.s > car.s - 2);
}

function spawnCar(edge, forward, along, R) {
  const from = forward ? edge.a : edge.b, to = forward ? edge.b : edge.a;
  const d = forward ? DIRS[edge.dir] : DIRS[(edge.dir + 2) % 4], l = leftOf(d);
  const car = { pts: [], cum: [], gates: [], s: 0, speed: 0, len: 4.3, wid: 1.8, wait: 0, stunned: 0,
    color: CAR_COLORS[(R() * CAR_COLORS.length) | 0], x: 0, y: 0, heading: Math.atan2(d[1], d[0]),
    eager: 0.85 + R() * 0.2, ai: true, kind: R() < 0.08 ? 'bus' : R() < 0.15 ? 'van' : 'car', ind: 0 };
  if (car.kind === 'bus') { car.len = 10; car.wid = 2.5; car.color = '#c8102e'; }
  if (car.kind === 'van') { car.len = 5.2; car.wid = 2; car.color = '#f2f2ee'; }
  pushPt(car, [from.x + d[0] * along + l[0] * LANE, from.y + d[1] * along + l[1] * LANE]);
  queueStreet(car, edge, to);
  car.x = car.pts[0][0]; car.y = car.pts[0][1];
  traffic.cars.push(car);
  return car;
}

function posAt(car, s) {
  let k = 0;
  while (k < car.cum.length - 2 && car.cum[k + 1] < s) k++;
  const a = car.pts[k], b = car.pts[k + 1] || a;
  const seg = (car.cum[k + 1] - car.cum[k]) || 1, t = clamp((s - car.cum[k]) / seg, 0, 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
}

function gateBlocks(car, g, dist, time, others) {
  if (g.type === 'zebra') return zebraOccupied(g.z);
  if (g.type === 'lights') {
    const st = lightState(g.node, g.arm % 2, time);
    if (st === 'R' || st === 'RA' || (st === 'A' && dist > 10)) return true;
    // Do not enter the junction while it is still blocked by stationary traffic.
    const n = g.node;
    return dist > 0.8 && others.some(o => o !== car && Math.abs(o.x - n.x) < W / 2 + 1 && Math.abs(o.y - n.y) < W / 2 + 1 && (o.ai ? o.speed : Math.hypot(o.vx, o.vy)) < 1);
  }
  if (g.type === 'rb') {
    if (dist > 9) return false;
    const n = g.node, entry = rbEntryAngle(g.arm);
    for (const o of others) {
      if (o === car) continue;
      const r = Math.hypot(o.x - n.x, o.y - n.y);
      if (r > RB_OUT + 0.5) continue;
      const a = Math.atan2(o.y - n.y, o.x - n.x);
      const rel = angDiff(entry, a);           // >0 when the other car is upstream, on our right
      if (rel > -0.25 && rel < 1.9) return true;
    }
    return false;
  }
  if (g.type === 'give' && g.arm % 2 !== g.node.major) {
    if (dist > 9) return false;
    const n = g.node;
    for (const o of others) {
      if (o === car) continue;
      const dx = n.x - o.x, dy = n.y - o.y, r = Math.hypot(dx, dy);
      if (r > 30) continue;
      const sp = o.ai ? o.speed : Math.hypot(o.vx, o.vy);
      if (r < W / 2 + 1.5 && sp > 0.3) return true;                  // someone in the junction
      const toward = (Math.cos(o.heading) * dx + Math.sin(o.heading) * dy) / (r || 1);
      if (sp > 1.5 && toward > 0.6) return true;                      // someone approaching
    }
  }
  return false;
}

function updateCars(dt, time, player) {
  const others = traffic.cars.concat(player ? [player] : []);
  for (const car of traffic.cars) {
    if (car.stunned > 0) { car.stunned -= dt; car.speed = 0; continue; }
    if (pathEnd(car) - car.s < 40) planNext(car);
    const edgeHere = edgeAtPoint(car.x, car.y);
    const limit = (edgeHere ? edgeHere.edge.limit : 30) / MPH;
    let want = limit * car.eager;
    // Corners: slow for curvature a little ahead.
    const [ax, ay, h1] = posAt(car, car.s + 8);
    const bend = Math.abs(angDiff(h1, car.heading));
    if (bend > 0.25) want = Math.min(want, 7.5);
    if (nodeAtPoint(car.x, car.y)?.type === 'rb') want = Math.min(want, 8);
    // Gates ahead.
    let waiting = false;
    for (const g of car.gates) {
      const dist = g.s - car.s;
      if (dist < -0.5 || dist > 45) continue;
      if (g.go) continue;
      if (dist < 0.6 && car.speed > 2) { g.go = true; continue; }   // already committed
      const patient = g.type === 'lights' || g.type === 'zebra';   // never run a red light or a busy crossing
      const blocks = gateBlocks(car, g, dist, time, others) && (patient || car.wait < 9);
      if (blocks) { want = Math.min(want, Math.sqrt(Math.max(0, 2 * 4 * (dist - 1)))); waiting = dist < 3; break; }
      else if (dist < 1) g.go = true;
      if (g.type === 'rb' || (g.type === 'give' && g.arm % 2 !== g.node.major)) want = Math.min(want, 4 + dist * 0.6);
    }
    // Following: anything in front in our path.
    const ch = Math.cos(car.heading), sh = Math.sin(car.heading);
    for (const o of others) {
      if (o === car) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      const f = dx * ch + dy * sh;
      if (f <= 0 || f > 30) continue;
      const lat = -dx * sh + dy * ch;
      if (Math.abs(lat) > 2.3) continue;
      // Cross traffic inside a junction: yield briefly, then carry on so junctions never gridlock.
      const hd = Math.abs(angDiff(o.heading, car.heading));
      if (o.ai && ((hd > 1.0 && f > 8) || (hd > 0.5 && car.wait > 1.5))) continue;
      const gap = f - (car.len + o.len) / 2 - 2;
      want = Math.min(want, Math.sqrt(Math.max(0, 2 * 5 * gap)));
      if (gap < 1.5) waiting = true;
    }
    for (const p of traffic.peds) {
      if (!p.onRoad) continue;
      const dx = p.x - car.x, dy = p.y - car.y, f = dx * ch + dy * sh;
      if (f > 0 && f < 14 && Math.abs(-dx * sh + dy * ch) < 2.6) want = Math.min(want, Math.max(0, (f - 4) * 0.8));
    }
    car.wait = (car.speed < 0.3 && waiting) ? car.wait + dt : car.speed > 1.5 ? 0 : car.wait;
    car.braking = want < car.speed - 0.4 || (car.speed < 0.3 && waiting);
    const acc = want > car.speed ? 2.6 : -7;
    car.speed = want > car.speed ? Math.min(want, car.speed + acc * dt) : Math.max(want, car.speed + acc * dt);
    car.speed = Math.max(0, car.speed);
    car.s += car.speed * dt;
    const [x, y, h] = posAt(car, car.s);
    car.x = x; car.y = y;
    car.heading += angDiff(h, car.heading) * Math.min(1, dt * 10);
    // Indicators for the next turn (AI signals too, so you learn to read them).
    const ng = car.gates.find(g => g.node && g.s - car.s > -6 && g.s - car.s < 35 && g.exit !== undefined);
    car.ind = 0;
    if (ng && ng.node.type !== 'rb') { const turn = (ng.exit - (ng.arm + 2) + 8) % 4; car.ind = turn === 1 ? 1 : turn === 3 ? -1 : 0; }
    if (ng && ng.node.type === 'rb') { const turn = (ng.exit - (ng.arm + 2) + 8) % 4; car.ind = turn === 3 ? -1 : turn === 1 ? 1 : 0; }
  }
}

// ---- Pedestrians
const PED_COLORS = ['#e4572e', '#2e86ab', '#f3a712', '#a23b72', '#3b1f2b', '#5d737e', '#7cb518', '#f0f0f0'];
function zebraOccupied(z) { return traffic.peds.some(p => p.zebra === z && p.state === 'cross'); }

function spawnPeds(R) {
  const town = world.blocks.filter(b => b.town);
  for (let k = 0; k < 120; k++) {
    const b = town[(R() * town.length) | 0];
    const loop = { x0: b.x0 + PAVE / 2, y0: b.y0 + PAVE / 2, x1: b.x1 - PAVE / 2, y1: b.y1 - PAVE / 2 };
    const per = 2 * ((loop.x1 - loop.x0) + (loop.y1 - loop.y0));
    traffic.peds.push({ kind: 'walk', loop, per, p: R() * per, dir: R() < 0.5 ? 1 : -1, v: 1.1 + R() * 0.5,
      color: PED_COLORS[(R() * PED_COLORS.length) | 0], x: 0, y: 0, hit: 0, onRoad: false });
  }
  for (const z of world.zebras) for (let k = 0; k < 2; k++) {
    traffic.peds.push({ kind: 'cross', zebra: z, side: k ? 1 : -1, lat: (k ? 1 : -1) * (W / 2 + 1.4), off: (R() - 0.5) * 2,
      state: 'wait', timer: 2 + R() * 8, v: 1.2 + R() * 0.3, color: PED_COLORS[(R() * PED_COLORS.length) | 0], x: 0, y: 0, hit: 0, onRoad: false });
  }
}

function updatePeds(dt, player) {
  for (const p of traffic.peds) {
    if (p.hit > 0) { p.hit -= dt; continue; }
    if (p.kind === 'walk') {
      p.p = (p.p + p.dir * p.v * dt + p.per) % p.per;
      const L = p.loop, w = L.x1 - L.x0, h = L.y1 - L.y0;
      let s = p.p;
      if (s < w) { p.x = L.x0 + s; p.y = L.y0; }
      else if ((s -= w) < h) { p.x = L.x1; p.y = L.y0 + s; }
      else if ((s -= h) < w) { p.x = L.x1 - s; p.y = L.y1; }
      else { s -= w; p.x = L.x0; p.y = L.y1 - s; }
      continue;
    }
    const z = p.zebra;
    if (p.state === 'wait') {
      p.timer -= dt;
      if (p.timer <= 0) {
        // Step out only if nothing is close and fast — the way a cautious pedestrian would.
        const near = traffic.cars.concat(player ? [player] : []).some(c => {
          const sp = c.ai ? c.speed : Math.hypot(c.vx, c.vy);
          const d = Math.hypot(c.x - z.x, c.y - z.y);
          return d < 8 || (d < 9 + sp * 2.2 && sp > 2);
        });
        if (!near) { p.state = 'cross'; p.target = -p.side * (W / 2 + 1.4); }
        else p.timer = 0.5;
      }
    } else {
      const step = Math.sign(p.target - p.lat) * p.v * dt;
      if (Math.abs(p.target - p.lat) <= Math.abs(step)) { p.lat = p.target; p.side = -p.side; p.state = 'wait'; p.timer = 5 + Math.random() * 12; }
      else p.lat += step;
    }
    p.onRoad = p.state === 'cross' && Math.abs(p.lat) < W / 2 + 0.3;
    if (z.horiz) { p.x = z.x + p.off; p.y = z.y + p.lat; } else { p.x = z.x + p.lat; p.y = z.y + p.off; }
  }
}
