// The player's car. Handling follows the usual recipe for keyboard driving games:
// pedals and steering ramp in and out instead of snapping (keys are all-or-nothing), steering lock
// shrinks with speed, yaw comes from a bicycle model (wheelbase + steering angle), a grip limit makes
// the car run wide if you overcook a bend, and the rear only lets go with the handbrake.
// Optional lane assist aligns the car with the lane when you are not steering.
const WHEELBASE = 2.6;
function makePlayer(x, y, heading) {
  return { x, y, heading, vx: 0, vy: 0, steer: 0, thr: 0, brk: 0, len: 4.4, wid: 1.85, ind: 0, indHeading: 0,
    color: '#f7d117', ai: false, speed: 0, brakeLight: false, reversing: false, limiter: false, limit: 30,
    wrongSide: 0, wrongSideFault: false, overLimit: 0, node: null, nodeEntry: null, lastEdge: null, lastQ: null,
    lastIndDir: 0, lastIndT: -99, rbTurned: 0, rbAngle: 0, cool: {}, busT: 0, hogT: 0, boxT: 0, approachMin: 99 };
}
const approach = (v, t, step) => v < t ? Math.min(t, v + step) : Math.max(t, v - step);

function bodyCircles(c) {
  const ch = Math.cos(c.heading), sh = Math.sin(c.heading), q = c.len / 2 - c.wid / 2;
  if (c.kind === 'bus') return [-4, -2, 0, 2, 4].map(o => [c.x + ch * o, c.y + sh * o]);
  return [[c.x + ch * q, c.y + sh * q], [c.x, c.y], [c.x - ch * q, c.y - sh * q]];
}

function updatePlayerPhysics(p, inp, dt) {
  const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
  let vF = p.vx * ch + p.vy * sh, vR = -p.vx * sh + p.vy * ch;
  const surf = surfaceAt(p.x, p.y);
  // Pedals: press gradually, release quickly.
  p.thr = approach(p.thr, inp.up ? 1 : 0, dt * (inp.up ? 1.6 : 6));
  p.brk = approach(p.brk, inp.down ? 1 : 0, dt * (inp.down ? 4 : 8));
  let thr = p.thr;
  if (p.limiter) thr *= clamp(((p.limit || 30) / MPH - 0.2 - vF) / 1.5, 0, 1);
  // Engine: about 4 s to 30 mph, 11 s to 60 mph, tops out near 100 mph.
  if (vF > -0.5) vF += thr * 3.4 * Math.max(0, 1 - (vF / 46) ** 2) * dt;
  else if (thr > 0) vF = Math.min(0, vF + 8 * thr * dt);
  p.brakeLight = false;
  if (p.brk > 0.02) {
    if (vF > 0.3) { vF = Math.max(0, vF - 9 * p.brk * dt); p.brakeLight = true; }
    else if (inp.down && !inp.up) vF = Math.max(-5, vF - 2.5 * dt);   // stopped: holding brake reverses
  }
  p.reversing = vF < -0.3;
  // Drag, rolling resistance, engine braking, surface.
  const surfDrag = surf === 'grass' ? 1.3 : surf === 'pavement' ? 0.4 : 0;
  vF -= (0.0007 * vF * Math.abs(vF) + (0.02 + surfDrag) * vF) * dt;
  if (thr < 0.05 && p.brk < 0.05) vF = approach(vF, 0, 0.45 * dt);
  if (inp.hand) vF = approach(vF, 0, 4.5 * dt);
  // Steering wheel: turn in at a steady rate, self-centre faster.
  const target = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const rate = target === 0 ? 4.5 : (p.steer * target < 0 ? 6 : 2.2);
  p.steer = approach(p.steer, target, rate * dt);
  const v = Math.abs(vF);
  const maxSteer = 0.62 / (1 + Math.pow(v / 8, 1.3));          // speed-sensitive steering
  let yaw = vF * Math.tan(p.steer * maxSteer) / WHEELBASE;
  const aMax = surf === 'grass' ? 3.5 : 7.8;                    // grip limit: run wide instead of turning tighter
  if (Math.abs(yaw * vF) > aMax) yaw = Math.sign(yaw) * aMax / Math.max(1, v);
  if (inp.hand && v > 4) yaw *= 1.7;
  // Lane assist while you are not steering.
  const assist = game.settings.assist;
  if (target === 0 && assist !== 'off' && vF > 2.5 && !inp.hand) {
    const q = roadAt(p.x, p.y);
    if (q && q.dist < q.e.W / 2 + 0.5 && !nodeAt(p.x, p.y)) {
      const dir = Math.cos(p.heading - q.ang) > 0 ? 1 : -1;
      const laneH = dir > 0 ? q.ang : q.ang + Math.PI;
      let want = laneH;
      if (assist === 'strong' && lanesOf(q.e, dir) > 0) {
        let best = null;
        for (let i = 0; i < lanesOf(q.e, dir); i++) { const l = laneLat(q.e, dir, i); if (best === null || Math.abs(q.lat - l) < Math.abs(q.lat - best)) best = l; }
        const err = (q.lat - best) * dir;                         // >0: left of the lane centre
        want = laneH + clamp(err * 0.06, -0.1, 0.1);
      }
      const d = angDiff(want, p.heading);
      if (Math.abs(angDiff(laneH, p.heading)) < 0.45) yaw += d * (assist === 'strong' ? 2.2 : 1.4);
    }
  }
  p.heading += yaw * dt;
  // Sideways slip dies away quickly unless the handbrake is on.
  vR *= Math.exp(-(inp.hand ? 1.2 : surf === 'grass' ? 5 : 16) * dt);
  const nch = Math.cos(p.heading), nsh = Math.sin(p.heading);
  p.vx = nch * vF - nsh * vR; p.vy = nsh * vF + nch * vR;
  const ox = p.x, oy = p.y;
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.speed = vF;
  return { ox, oy };
}

function solidAt(x, y) {
  const s = surfaceAt(x, y);
  if (s === 'wall' || s === 'island' || s === 'median') return s;
  if (buildingAt(x, y)) return 'building';
  for (const t of world.trees) if (Math.abs(t.x - x) < 1 && Math.abs(t.y - y) < 1 && Math.hypot(t.x - x, t.y - y) < 0.8) return 'tree';
  for (const o of world.obstacles) { const q = pointAt(o.e, o.s, o.side * (o.e.W / 2 - o.e.laneW * 0.45)); if (Math.abs(q.x - x) < 4 && Math.abs(q.y - y) < 4 && Math.hypot(q.x - x, q.y - y) < 2.2) return 'kerb build-out'; }
  for (const lx of world.levelX) if (lx.barrier > 0.6 && Math.hypot(lx.x - x, lx.y - y) < lx.e.W / 2 + 0.5) {
    const along = (x - lx.x) * Math.cos(lx.ang) + (y - lx.y) * Math.sin(lx.ang);
    if (Math.abs(Math.abs(along) - 7) < 0.6) return 'barrier';
  }
  return null;
}

function collidePlayer(p, prev) {
  const ch = Math.cos(p.heading), sh = Math.sin(p.heading), hl = p.len / 2, hw = p.wid / 2;
  let hit = null;
  for (const [a, b] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0]]) {
    const s = solidAt(p.x + ch * a - sh * b, p.y + sh * a + ch * b);
    if (s) { hit = s; break; }
  }
  if (hit) {
    const sp = Math.hypot(p.vx, p.vy);
    p.x = prev.ox; p.y = prev.oy;
    p.vx *= -0.25; p.vy *= -0.25;
    if (sp > 3) {
      game.bump(sp);
      const what = { wall: 'the edge of the map', building: 'a building', island: 'the roundabout island', tree: 'a tree', median: 'the central reservation barrier', barrier: 'a level-crossing barrier' }[hit] || hit;
      fault('crash', 'serious', 'Control', `Hit ${what}`, 'Keep your speed down so you can stop or steer in the distance you can see.', 'safety', 3);
    }
  }
  const mine = bodyCircles(p);
  const vehicles = traffic.cars.concat(world.parked);
  for (const c of vehicles) {
    if (Math.abs(c.x - p.x) > 14 || Math.abs(c.y - p.y) > 14) continue;
    const rr = (p.wid + c.wid) / 2 * 0.95;
    for (const m of mine) for (const t of bodyCircles(c)) {
      const dx = m[0] - t[0], dy = m[1] - t[1], d = Math.hypot(dx, dy);
      if (d >= rr || d < 0.001) continue;
      const nx = dx / d, ny = dy / d;
      p.x += nx * (rr - d); p.y += ny * (rr - d);
      const vn = p.vx * nx + p.vy * ny;
      const rel = Math.abs(vn - (c.ai ? (Math.cos(c.heading) * nx + Math.sin(c.heading) * ny) * c.speed : 0));
      if (vn < 0) { p.vx -= 1.4 * vn * nx; p.vy -= 1.4 * vn * ny; }
      if (c.ai) { c.stunned = 2.5; c.speed = 0; }
      if (rel > 1.5) {
        game.bump(rel);
        fault('crash', rel > 8 ? 'dangerous' : 'serious', 'Control', c.parked ? 'Hit a parked car' : 'Collided with another vehicle',
          'Keep a two-second gap and check all around before you change position.', 'safety', 3);
      }
      break;
    }
  }
  // Trains.
  for (const tr of world.trains) {
    if (tr.wait > 0) continue;
    for (let o = 0; o < tr.len; o += 3) {
      const q = railPoint(tr.s - tr.dir * o);
      if (Math.hypot(q.x - p.x, q.y - p.y) < 2.6) {
        game.bump(20); p.vx = Math.cos(q.ang) * tr.dir * 8; p.vy = Math.sin(q.ang) * tr.dir * 8;
        fault('train', 'dangerous', 'Level crossings', 'Hit by a train', 'Never enter a level crossing when the lights show or the barriers are down (Rule 293).', 'general', 5);
        break;
      }
    }
  }
  const sp = Math.hypot(p.vx, p.vy);
  for (const ped of traffic.peds) {
    if (ped.hit > 0 || Math.abs(ped.x - p.x) > 5 || Math.abs(ped.y - p.y) > 5) continue;
    for (const m of mine) {
      const dx = ped.x - m[0], dy = ped.y - m[1], d = Math.hypot(dx, dy);
      if (d < p.wid / 2 + 0.4) {
        ped.hit = 2.5;
        p.vx *= 0.3; p.vy *= 0.3;
        if (sp > 0.8) fault('ped', 'dangerous', 'Pedestrians', 'Hit a pedestrian',
          'Pedestrians are the most vulnerable road users. Since 2022 drivers carry the greatest responsibility (Rule H1).', 'crossing', 3);
        break;
      }
    }
  }
}

function fault(key, sev, cat, msg, tip, topic, cool = 8) {
  const p = game.player, t = game.time;
  if (p.cool[key] !== undefined && t - p.cool[key] < cool) return;
  p.cool[key] = t;
  game.addFault({ sev, cat, msg, tip, topic, t });
}
