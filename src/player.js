// The player's car: arcade "GTA-style" handling (grip, slides, handbrake turns) plus the UK rule checks.
function makePlayer(x, y, heading) {
  return { x, y, heading, vx: 0, vy: 0, yaw: 0, steer: 0, len: 4.4, wid: 1.85, ind: 0, indHeading: 0,
    color: '#f7d117', ai: false, speed: 0, gear: 'D', brakeLight: false, reversing: false,
    // rule-tracking state
    wrongSide: 0, wrongSideFault: false, overLimit: 0, node: null, nodeEntry: null, lastEdge: null,
    lastIndDir: 0, lastIndT: -99, rbAngle: 0, rbTurned: 0, cool: {}, approachTip: null };
}

// Three circles along the body approximate the car for collisions.
function bodyCircles(c) {
  const ch = Math.cos(c.heading), sh = Math.sin(c.heading), q = c.len / 2 - c.wid / 2;
  return [[c.x + ch * q, c.y + sh * q], [c.x, c.y], [c.x - ch * q, c.y - sh * q]];
}

function updatePlayerPhysics(p, inp, dt) {
  const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
  let vF = p.vx * ch + p.vy * sh, vR = -p.vx * sh + p.vy * ch;
  const surf = surfaceAt(p.x, p.y);
  // Steering eases in and out like a real wheel; less lock at speed.
  const target = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  p.steer += (target - p.steer) * Math.min(1, dt * (target ? 6 : 9));
  // Engine & brakes (automatic gearbox: brake to a stop, hold brake to reverse).
  const top = 52;
  if (inp.up) {
    if (vF < -0.5) vF += 12 * dt;
    else vF += (6.2 * (1 - Math.max(0, vF) / top) + 0.4) * dt;
  }
  p.brakeLight = false;
  if (inp.down) {
    if (vF > 0.4) { vF -= 13 * dt; p.brakeLight = true; }
    else vF = Math.max(-9, vF - 4 * dt);
  }
  p.reversing = vF < -0.3;
  // Drag, rolling resistance and surface.
  const surfDrag = surf === 'grass' ? 1.6 : surf === 'pavement' ? 0.6 : 0;
  vF -= vF * (0.12 + surfDrag) * dt + 0.0009 * vF * Math.abs(vF) * dt;
  if (!inp.up && !inp.down) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 0.6 * dt);
  // Handbrake: rear grip drops, the car slides.
  const hb = inp.hand;
  if (hb) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 5 * dt);
  const grip = hb ? 1.4 : surf === 'grass' ? 4 : 10;
  vR *= Math.exp(-grip * dt);
  // Yaw from steering geometry; the yaw rate lags a little so the car feels weighty.
  const maxSteer = 0.62 / (1 + Math.abs(vF) / 16);
  let yawT = vF * Math.tan(p.steer * maxSteer) / 2.6;
  if (hb) yawT *= 1.7;
  p.yaw += (yawT - p.yaw) * Math.min(1, dt * (hb ? 4 : 8));
  p.heading += p.yaw * dt;
  const nch = Math.cos(p.heading), nsh = Math.sin(p.heading);
  // Part of the old sideways motion carries into the new heading: this is the drift.
  p.vx = nch * vF - nsh * vR;
  p.vy = nsh * vF + nch * vR;
  const ox = p.x, oy = p.y;
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.speed = vF;
  return { ox, oy };
}

function solidAt(x, y) {
  if (x < 1 || y < 1 || x > WORLD_W - 1 || y > WORLD_H - 1) return 'wall';
  if (buildingAt(x, y)) return 'building';
  const n = nodeAtPoint(x, y);
  if (n && n.type === 'rb' && Math.hypot(x - n.x, y - n.y) < RB_IN - 0.3) return 'island';
  for (const t of world.trees) if (Math.abs(t.x - x) < 1 && Math.abs(t.y - y) < 1 && Math.hypot(t.x - x, t.y - y) < 0.8) return 'tree';
  return null;
}

function collidePlayer(p, prev, time) {
  // Static obstacles: test the four corners.
  const ch = Math.cos(p.heading), sh = Math.sin(p.heading), hl = p.len / 2, hw = p.wid / 2;
  let hit = null;
  for (const [a, b] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0]]) {
    const s = solidAt(p.x + ch * a - sh * b, p.y + sh * a + ch * b);
    if (s) { hit = s; break; }
  }
  if (hit) {
    const sp = Math.hypot(p.vx, p.vy);
    p.x = prev.ox; p.y = prev.oy;
    p.vx *= -0.25; p.vy *= -0.25; p.yaw *= 0.3;
    if (sp > 3) {
      game.bump(sp);
      const what = { wall: 'a wall', building: 'a building', island: 'the roundabout island', tree: 'a tree' }[hit];
      fault('crash', 'serious', 'Control', `Hit ${what}`, 'Keep your speed down so you can stop or steer in the distance you can see.', 'safety', 3);
    }
  }
  // Other vehicles.
  const mine = bodyCircles(p);
  for (const c of traffic.cars) {
    if (Math.abs(c.x - p.x) > 14 || Math.abs(c.y - p.y) > 14) continue;
    const rr = (p.wid + c.wid) / 2 * 0.95;
    const theirs = c.kind === 'bus' ? [-4, -2, 0, 2, 4].map(o => [c.x + Math.cos(c.heading) * o, c.y + Math.sin(c.heading) * o]) : bodyCircles(c);
    for (const m of mine) for (const t of theirs) {
      const dx = m[0] - t[0], dy = m[1] - t[1], d = Math.hypot(dx, dy);
      if (d < rr && d > 0.001) {
        const nx = dx / d, ny = dy / d, push = rr - d;
        p.x += nx * push; p.y += ny * push;
        const vn = p.vx * nx + p.vy * ny;
        const rel = Math.abs(vn - (Math.cos(c.heading) * nx + Math.sin(c.heading) * ny) * c.speed);
        if (vn < 0) { p.vx -= 1.4 * vn * nx; p.vy -= 1.4 * vn * ny; }
        c.stunned = 2.5; c.speed = 0;
        if (rel > 1.5) {
          game.bump(rel);
          fault('crash', rel > 8 ? 'dangerous' : 'serious', 'Control', 'Collided with another vehicle',
            'Keep a two-second gap and check all around before you change position.', 'safety', 3);
        }
        break;
      }
    }
  }
  // Pedestrians.
  const sp = Math.hypot(p.vx, p.vy);
  for (const ped of traffic.peds) {
    if (ped.hit > 0 || Math.abs(ped.x - p.x) > 5 || Math.abs(ped.y - p.y) > 5) continue;
    for (const m of mine) {
      const dx = ped.x - m[0], dy = ped.y - m[1], d = Math.hypot(dx, dy);
      if (d < p.wid / 2 + 0.4) {
        ped.hit = 2.5;
        if (ped.kind === 'walk') { ped.x += dx / (d || 1) * 1.5; ped.y += dy / (d || 1) * 1.5; }
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
  if (p.cool[key] && t - p.cool[key] < cool) return;
  p.cool[key] = t;
  game.addFault({ sev, cat, msg, tip, topic, t });
}

function checkRules(p, dt) {
  const t = game.time;
  const mph = Math.max(0, p.speed) * MPH;
  const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
  const fx = p.x + ch * p.len / 2, fy = p.y + sh * p.len / 2;   // front bumper

  // Indicator memory: remember the last direction used and when.
  if (p.ind) { p.lastIndDir = p.ind; p.lastIndT = t; }
  // Self-cancel after the steering returns, like a real indicator stalk.
  if (p.ind && Math.abs(angDiff(p.heading, p.indHeading)) > 1.0 && Math.abs(p.steer) < 0.15) p.ind = 0;

  // ---- Street rules
  const eh = edgeAtPoint(p.x, p.y);
  if (eh) {
    const e = eh.edge;
    if (p.lastEdge && p.lastEdge !== e && p.lastEdge.limit !== e.limit)
      game.tip(e.limit === 60 ? 'National speed limit: 60 mph on this single carriageway' : `Speed limit now ${e.limit} mph`, 'limit', 0);
    if (!p.lastEdge || p.lastEdge.limit !== e.limit) p.limit = e.limit;
    p.lastEdge = e;
    // Keep left.
    const axis = DIRS[e.dir];
    const along = ch * axis[0] + sh * axis[1];
    if (Math.abs(along) > 0.6 && Math.abs(p.speed) > 2 && p.speed > 0) {
      const d = along > 0 ? axis : [-axis[0], -axis[1]];
      const l = leftOf(d);
      const want = e.dir === 0 ? l[1] : l[0];      // which sign of `lat` is our left lane
      if (eh.lat * want < -0.4) p.wrongSide += dt; else p.wrongSide = Math.max(0, p.wrongSide - dt * 2);
    } else p.wrongSide = Math.max(0, p.wrongSide - dt * 2);
    if (p.wrongSide > 3 && !p.wrongSideFault) {
      p.wrongSideFault = true;
      fault('side', 'serious', 'Positioning', 'Drove on the right-hand side of the road',
        'In the UK keep LEFT. The centre line should be on your right, next to you as the driver (Rule 160).', 'keepleft', 1);
    }
    if (p.wrongSide === 0) p.wrongSideFault = false;
    // Zebra crossings.
    if (e.zebra) {
      const z = e.zebra;
      const dz = Math.hypot(z.x - p.x, z.y - p.y);
      const ahead = (z.x - p.x) * ch + (z.y - p.y) * sh;
      if (dz < 45 && ahead > 15 && p.speed > 3) game.tip('Zebra crossing ahead: give way once someone steps on (Rule 195)', 'zebra' + z.edge.id);
      if (zebraOccupied(z) && traffic.peds.some(pd => pd.zebra === z && pd.onRoad)) {
        for (const m of bodyCircles(p)) {
          const da = z.horiz ? Math.abs(m[0] - z.x) : Math.abs(m[1] - z.y);
          if (da < 2.2 && dz < 8) {
            fault('zebra', 'serious', 'Pedestrian crossings', 'Did not give way to a pedestrian on a zebra crossing',
              'You MUST give way when someone has moved onto a zebra crossing (Rule 195).', 'crossing', 6);
            break;
          }
        }
      }
    }
    // Junction ahead coaching.
    const to = along > 0 ? e.b : e.a;
    const dist = Math.hypot(to.x - p.x, to.y - p.y) - to.r;
    if (dist < 50 && dist > 20 && Math.abs(along) > 0.8 && p.speed > 3) {
      if (to.type === 'rb') game.tip('Roundabout: give way to traffic from the RIGHT, then go clockwise. Signal left for the 1st exit, right for past 12 o\'clock.', 'rb' + to.i + to.j);
      else if (to.type === 'lights') game.tip('Traffic lights ahead. UK sequence: red → red + amber → green → amber → red.', 'tl' + to.i + to.j);
      else if (to.type === 'give') {
        const arm = along > 0 ? (e.dir + 2) % 4 : e.dir;
        if (arm % 2 !== to.major) game.tip('Give way: traffic on the main road has priority. Look RIGHT first, then left, then right again.', 'gw' + to.i + to.j);
      }
    }
  }
  // Speeding.
  const limit = p.limit || 30;
  if (mph > limit + 3) p.overLimit += dt; else p.overLimit = 0;
  if (mph > limit + 10 && p.overLimit > 1) fault('speed2', 'serious', 'Speed', `${Math.round(mph)} mph in a ${limit} mph limit`,
    `Speed limits are maximums. ${limit === 60 ? 'National limit for cars on single carriageways is 60 mph.' : 'In towns 30 mph is the norm, 20 mph near schools.'} (Rule 124)`, 'speed', 15);
  else if (p.overLimit > 2.5) fault('speed', 'minor', 'Speed', `Exceeded the ${limit} mph limit`, 'Check your speedometer, it reads in mph. Watch for the red-ringed limit signs.', 'speed', 12);

  // Surface.
  const surf = surfaceAt(p.x, p.y);
  if (surf === 'pavement' && Math.abs(p.speed) > 1) fault('kerb', 'serious', 'Control', 'Drove on the pavement', 'Pavements are for pedestrians. Mounting the kerb is a serious fault.', 'safety', 6);
  if (surf === 'grass' && Math.abs(p.speed) > 2) fault('grass', 'minor', 'Control', 'Left the road', 'Keep to your lane and steer smoothly.', 'keepleft', 8);

  // ---- Junctions
  const n = nodeAtPoint(fx, fy) || nodeAtPoint(p.x, p.y);
  if (n && n !== p.node) enterNode(p, n, t);
  if (!n && p.node) exitNode(p, p.node);
  if (n && n.type === 'rb') {
    const a = Math.atan2(p.y - n.y, p.x - n.x);
    p.rbTurned += angDiff(a, p.rbAngle);
    p.rbAngle = a;
    if (p.rbTurned < -0.6) fault('rbwrong', 'dangerous', 'Roundabouts', 'Went the wrong way round a roundabout',
      'UK roundabouts go CLOCKWISE: turn left onto them (Rule 185).', 'roundabout', 10);
  }
  p.node = n;
}

function armFromPoint(n, x, y) {
  const a = Math.atan2(y - n.y, x - n.x);
  let best = 0, bd = 9;
  for (const arm of n.arms) { const d = Math.abs(angDiff(a, armAngle(arm))); if (d < bd) { bd = d; best = arm; } }
  return best;
}

function enterNode(p, n, t) {
  const arm = armFromPoint(n, p.x, p.y);
  const recentInd = p.ind || (t - p.lastIndT < 2 ? p.lastIndDir : 0);
  p.nodeEntry = { node: n, arm, heading: p.heading, ind: recentInd, t };
  p.rbAngle = Math.atan2(p.y - n.y, p.x - n.x); p.rbTurned = 0;
  if (n.type === 'lights') {
    const st = lightState(n, arm % 2, t);
    if (st === 'R' || st === 'RA') fault('red', 'serious', 'Traffic lights', 'Drove through a red light',
      'You MUST stop behind the white line unless the light is green. Red + amber still means stop (Rule 176).', 'lights', 5);
  }
  if (n.type === 'rb' && p.speed > 1) {
    const entry = rbEntryAngle(arm);
    const conflict = traffic.cars.some(c => {
      const r = Math.hypot(c.x - n.x, c.y - n.y);
      if (r > RB_OUT + 0.5 || c.speed < 1.5) return false;
      const rel = angDiff(entry, Math.atan2(c.y - n.y, c.x - n.x));
      return rel > 0 && rel < 1.4;
    });
    if (conflict) fault('rbgive', 'serious', 'Roundabouts', 'Did not give way to traffic from the right at a roundabout',
      'At roundabouts give priority to traffic coming from your RIGHT (Rule 185).', 'roundabout', 6);
  }
  if (n.type === 'give' && arm % 2 !== n.major && p.speed > 1) {
    const conflict = traffic.cars.some(c => {
      const dx = n.x - c.x, dy = n.y - c.y, r = Math.hypot(dx, dy);
      if (r > 24 || c.speed < 3) return false;
      return (Math.cos(c.heading) * dx + Math.sin(c.heading) * dy) / r > 0.7;
    });
    if (conflict) fault('give', 'serious', 'Junctions', 'Pulled out without giving way to traffic on the main road',
      'At give-way lines, traffic on the major road has priority. Look right, left, right (Rule 172).', 'junction', 6);
  }
}

function exitNode(p, n) {
  const en = p.nodeEntry;
  p.nodeEntry = null;
  if (!en || en.node !== n) return;
  let turn;
  if (n.type === 'rb') {
    const exArm = armFromPoint(n, p.x, p.y);
    turn = (exArm - (en.arm + 2) + 8) % 4;            // 0 ahead, 1 right, 2 back, 3 left
    if (p.rbTurned < 0.3) return;                       // clipped the edge, not a real pass
    if (turn === 3 && en.ind !== -1) fault('sig', 'minor', 'Signals', 'No left signal for the first exit at a roundabout',
      'Taking the first exit: signal left on approach and keep left (Rule 186).', 'roundabout', 4);
    if (turn === 1 && en.ind !== 1) fault('sig', 'minor', 'Signals', 'No right signal when turning right at a roundabout',
      'Going right: signal right on approach, then left after the exit before yours (Rule 186).', 'roundabout', 4);
    return;
  }
  const d = angDiff(p.heading, en.heading);
  turn = d > 0.9 ? 1 : d < -0.9 ? 3 : 0;
  if (n.type === 'bend') return;
  if (turn === 1 && en.ind !== 1) fault('sig', 'minor', 'Signals', 'Turned right without signalling', 'Mirrors, Signal, Manoeuvre. Signal in good time (Rule 103).', 'signals', 4);
  if (turn === 3 && en.ind !== -1) fault('sig', 'minor', 'Signals', 'Turned left without signalling', 'Mirrors, Signal, Manoeuvre. Signal in good time (Rule 103).', 'signals', 4);
  if (turn === 0 && en.ind !== 0 && p.ind) fault('sigm', 'minor', 'Signals', 'Misleading signal: indicated but went straight on', 'Cancel signals you no longer need (Rule 103).', 'signals', 4);
  if (turn === 1) game.tip('Big right turn done. Now make sure you are in the LEFT lane.', 'afterright', 0);
}
