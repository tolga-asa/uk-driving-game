// AI traffic, part 2: driving along the planned path, waiting at gates, and pedestrians.
const speedOf = (o) => o.ai ? o.speed : Math.hypot(o.vx, o.vy);
const inBox = (o, n, pad = 1) => (o.x - n.x) ** 2 + (o.y - n.y) ** 2 < (n.r + pad) ** 2;
// Is vehicle `o` driving towards node `n` (optionally along arm `arm`) and within maxD?
function approaching(o, n, maxD, arm) {
  const dx = n.x - o.x, dy = n.y - o.y, d = Math.hypot(dx, dy);
  if (d > maxD || d < n.r * 0.6 || speedOf(o) < 1.5) return false;
  if ((Math.cos(o.heading) * dx + Math.sin(o.heading) * dy) / d < 0.75) return false;
  return !arm || Math.abs(angDiff(Math.atan2(o.y - n.y, o.x - n.x), arm.ang)) < 0.5;
}
const crossingBusy = (c) => traffic.peds.some(p => p.c === c && p.onRoad);
const redish = (st, dist) => st === 'R' || st === 'RA' || (st === 'A' && dist > 10);

function posAt(car, s) {
  let lo = 0, hi = car.cum.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (car.cum[m] <= s) lo = m; else hi = m - 1; }
  const a = car.pts[lo], b = car.pts[lo + 1] || a;
  const seg = (car.cum[lo + 1] - car.cum[lo]) || 1, t = clamp((s - car.cum[lo]) / seg, 0, 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
}

function gateBlocks(car, g, dist, time, near) {
  const n = g.node;
  switch (g.type) {
    case 'zebra': return crossingBusy(g.c);
    case 'puffin': return redish(puffinState(g.c, time), dist) || crossingBusy(g.c);
    case 'lx': return g.lx.state !== 'open' || g.lx.barrier > 0.05;
    case 'obst': {
      if (dist > 14) return false;
      const hx = Math.cos(car.heading), hy = Math.sin(car.heading);
      return near.some(o => {
        if (o === car || Math.cos(o.heading) * hx + Math.sin(o.heading) * hy > -0.5) return false;
        const ax = o.x - g.ax, ay = o.y - g.ay, along = ax * hx + ay * hy, lat = -ax * hy + ay * hx;
        return along > -4 && along < 60 && Math.abs(lat) < 8;
      });
    }
    case 'lights': {
      if (redish(lightState(n, g.arm, time), dist)) return true;
      if (dist > 1 && near.some(o => o !== car && inBox(o, n, 0) && speedOf(o) < 1)) return true;   // exit not clear
      if (dist < 6 && turnOf(g.arm, g.ex) > 0.5) { const opp = oppositeArm(n, g.arm); if (opp && near.some(o => o !== car && approaching(o, n, 40, opp))) return true; }
      return false;
    }
    case 'rb': {
      if (n.signals && redish(lightState(n, g.arm, time), dist)) return true;
      if (dist > 10) return false;
      const entry = Math.atan2(car.y - n.y, car.x - n.x);
      return near.some(o => {
        if (o === car) return false;
        const dx = o.x - n.x, dy = o.y - n.y;
        if (Math.hypot(dx, dy) > n.r + 0.5) return false;
        if (n.type === 'mini') return speedOf(o) > 0.5;
        if (speedOf(o) < 0.8) return false;
        const rel = angDiff(entry, Math.atan2(dy, dx));     // >0: upstream, coming from our right
        return rel > -0.25 && rel < 1.7;
      });
    }
    case 'give': case 'stop': case 'unmarked': {
      if (g.type === 'stop' && !g.stopped) { if (dist < 2.5 && car.speed < 0.3) g.stopped = true; else return true; }
      if (dist > 10) return false;
      return near.some(o => {
        if (o === car) return false;
        if (inBox(o, n, 0.5) && speedOf(o) > 0.5) return true;
        return n.arms.some(a => a !== g.arm && (g.type === 'unmarked' || a.major) && approaching(o, n, g.type === 'unmarked' ? 22 : 38, a));
      });
    }
    case 'right': {
      if (dist > 8) return false;
      const opp = oppositeArm(n, g.arm);
      return near.some(o => o !== car && opp && approaching(o, n, 42, opp));
    }
  }
  return false;
}

function updateCars(dt, time, player) {
  const all = traffic.cars.concat(player ? [player] : []);
  const B = 50, bucket = new Map();
  for (const o of all) { const k = Math.floor(o.x / B) * 4096 + Math.floor(o.y / B); let l = bucket.get(k); if (!l) bucket.set(k, l = []); l.push(o); }
  for (const car of traffic.cars) {
    if (car.stunned > 0) { car.stunned -= dt; car.speed = 0; continue; }
    if (pathEnd(car) - car.s < 70) planNext(car);
    const near = [];
    const ci = Math.floor(car.x / B), cj = Math.floor(car.y / B);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) { const l = bucket.get(i * 4096 + j); if (l) near.push(...l); }
    const rq = roadAt(car.x, car.y);
    let want = (rq ? rq.e.limit : 30) / MPH * car.eager;
    if (car.maxV) want = Math.min(want, car.maxV);
    if (rq && rq.e.kind === 'single' && near.some(o => o !== car && Math.cos(o.heading - car.heading) < -0.5 && Math.hypot(o.x - car.x, o.y - car.y) < 70)) want = Math.min(want, 6);
    // Slow for bends ahead.
    const h1 = posAt(car, car.s + 4)[2], h2 = posAt(car, car.s + 16)[2];
    const bend = Math.abs(angDiff(h2, h1));
    if (bend > 0.2) want = Math.min(want, bend > 0.6 ? 6.5 : 9);
    let waiting = false;
    car.why = null;
    for (const g of car.gates) {
      const dist = g.s - car.s;
      if (dist < -0.5 || dist > 50 || g.go) continue;
      if (g.type === 'hump') { if (dist < 12) want = Math.min(want, 6.5); continue; }
      if (dist < 0.6 && car.speed > 2) { g.go = true; continue; }
      const patient = g.type === 'lights' || g.type === 'zebra' || g.type === 'puffin' || g.type === 'lx' || (g.type === 'rb' && g.node.signals);
      if (gateBlocks(car, g, dist, time, near) && (patient || car.wait < 9)) {
        want = Math.min(want, Math.sqrt(Math.max(0, 2 * 3.5 * (dist - 1))));
        waiting = dist < 3; car.why = g.type; break;
      } else if (dist < 1) g.go = true;
      if (['rb', 'give', 'stop', 'unmarked', 'right'].includes(g.type)) want = Math.min(want, 4.5 + dist * 0.5);
    }
    // Following: anything ahead in our lane.
    const ch = Math.cos(car.heading), sh = Math.sin(car.heading);
    for (const o of near) {
      if (o === car) continue;
      const dx = o.x - car.x, dy = o.y - car.y, f = dx * ch + dy * sh;
      if (f <= 0 || f > 35) continue;
      const lat = -dx * sh + dy * ch;
      if (Math.abs(lat) > (car.wid + o.wid) / 2 + 0.4) continue;
      const hd = Math.abs(angDiff(o.heading, car.heading));
      if (o.ai && ((hd > 1.0 && f > 8) || (hd > 0.5 && car.wait > 1.5))) continue;
      const gap = f - (car.len + o.len) / 2 - 2;
      want = Math.min(want, Math.sqrt(Math.max(0, 2 * 4.5 * gap)) + speedOf(o) * 0.5 * (hd < 0.5 ? 1 : 0));
      if (gap < 1.5) { want = Math.min(want, 0); waiting = true; car.why = o; }
    }
    for (const p of traffic.peds) {
      if (!p.onRoad || Math.abs(p.x - car.x) > 16 || Math.abs(p.y - car.y) > 16) continue;
      const dx = p.x - car.x, dy = p.y - car.y, f = dx * ch + dy * sh;
      if (f > 0 && f < 14 && Math.abs(-dx * sh + dy * ch) < 2.6) want = Math.min(want, Math.max(0, (f - 4) * 0.8));
    }
    car.wait = (car.speed < 0.3 && waiting) ? car.wait + dt : car.speed > 1.5 ? 0 : car.wait;
    car.braking = want < car.speed - 0.4 || (car.speed < 0.3 && waiting);
    car.speed = want > car.speed ? Math.min(want, car.speed + (car.kind === 'bus' || car.kind === 'tractor' ? 1.4 : 2.4) * dt) : Math.max(want, car.speed - 7 * dt);
    car.speed = Math.max(0, car.speed);
    car.s += car.speed * dt;
    const [x, y, h] = posAt(car, car.s);
    car.x = x; car.y = y;
    car.heading += angDiff(h, car.heading) * Math.min(1, dt * 10);
    // Indicators for the next turn, so you can practise reading other drivers' signals.
    const ng = car.gates.find(g => g.node && g.ex && g.s - car.s > -8 && g.s - car.s < 40);
    car.ind = 0;
    if (ng) {
      if (ng.node.type === 'rb' || ng.node.type === 'mini') { const sw = rbSweep(ng.arm, ng.ex); car.ind = sw < 2.2 ? -1 : sw > 3.7 ? 1 : 0; }
      else { const t = turnOf(ng.arm, ng.ex); car.ind = t > 0.5 ? 1 : t < -0.5 ? -1 : 0; }
    }
  }
}

// ---- Pedestrians: walkers along pavements, and people using the crossings.
const PED_COLORS = ['#e4572e', '#2e86ab', '#f3a712', '#a23b72', '#3b1f2b', '#5d737e', '#7cb518', '#f0f0f0', '#1f3a5f', '#c44536'];
function spawnPeds(R) {
  traffic.peds.length = 0;
  const pav = world.edges.filter(e => e.pave && e.len - e.a.r - e.b.r > 30);
  const w = pav.map(e => e.len * (e.district === 'city' ? 3 : e.district === 'village' ? 1.6 : e.district === 'suburb' ? 1.1 : 0.3));
  const tot = w.reduce((a, b) => a + b, 0);
  for (let k = 0; k < 260; k++) {
    let r = R() * tot, i = 0; while ((r -= w[i]) > 0) i++;
    const e = pav[Math.min(i, pav.length - 1)];
    traffic.peds.push({ kind: 'walk', e, side: R() < 0.5 ? 1 : -1, s: e.a.r + 6 + R() * (e.len - e.a.r - e.b.r - 12), dir: R() < 0.5 ? 1 : -1,
      v: 1.1 + R() * 0.5, color: PED_COLORS[(R() * PED_COLORS.length) | 0], x: 0, y: 0, hit: 0, onRoad: false });
  }
  for (const c of world.crossings) for (let k = 0; k < (c.kind === 'puffin' ? 4 : 2); k++) {
    const side = k % 2 ? 1 : -1;
    traffic.peds.push({ kind: 'cross', c, side, lat: side * (c.e.W / 2 + 1.4), off: (R() - 0.5) * 2.2, state: 'wait', timer: 2 + R() * 8,
      v: 1.2 + R() * 0.3, color: PED_COLORS[(R() * PED_COLORS.length) | 0], x: 0, y: 0, hit: 0, onRoad: false });
  }
}

function updatePeds(dt, player, time) {
  for (const p of traffic.peds) {
    if (p.hit > 0) { p.hit -= dt; continue; }
    if (p.kind === 'walk') {
      const e = p.e, lo = e.a.r + PAVE + 2, hi = e.len - e.b.r - PAVE - 2;
      p.s += p.dir * p.v * dt;
      if (p.s < lo) { p.s = lo; p.dir = 1; } if (p.s > hi) { p.s = hi; p.dir = -1; }
      const q = pointAt(e, p.s, p.side * (e.W / 2 + PAVE * 0.5));
      p.x = q.x; p.y = q.y; p.heading = p.dir > 0 ? q.ang : q.ang + Math.PI;
      continue;
    }
    const c = p.c, half = c.e.W / 2 + 1.4;
    if (p.state === 'wait') {
      p.timer -= dt;
      if (p.timer <= 0) {
        let go;
        if (c.kind === 'puffin') go = puffinState(c, time) === 'R';
        else go = !traffic.cars.concat(player ? [player] : []).some(v => {
          const sp = speedOf(v), d = Math.hypot(v.x - c.x, v.y - c.y);
          return d < 8 || (d < 9 + sp * 2.2 && sp > 2);
        });
        if (go) { p.state = 'cross'; p.target = -p.side * half; } else p.timer = 0.5;
      }
    } else {
      const step = Math.sign(p.target - p.lat) * p.v * dt;
      if (Math.abs(p.target - p.lat) <= Math.abs(step)) { p.lat = p.target; p.side = -p.side; p.state = 'wait'; p.timer = 5 + Math.random() * 12; }
      else p.lat += step;
    }
    p.onRoad = p.state === 'cross' && Math.abs(p.lat) < c.e.W / 2 + 0.3;
    const q = pointAt(c.e, c.s + p.off, p.lat);
    p.x = q.x; p.y = q.y;
  }
}
