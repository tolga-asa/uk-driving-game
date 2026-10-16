// UK rule checks for the player, marked like the practical test (driving / serious / dangerous faults).
const SIG_TIP = 'Mirrors, Signal, Manoeuvre. Signal in good time (Rule 103).';

function laneIndex(e, dir, lat) {
  const idx = dir > 0 ? Math.floor((e.W / 2 - lat) / e.laneW) : Math.floor((lat + e.W / 2) / e.laneW);
  return clamp(idx, 0, Math.max(0, lanesOf(e, dir) - 1));
}
// Is the player passing something on its left (parked car, slow vehicle, build-out)? Then crossing the centre line is fine.
function passingSomething(p, q, dir) {
  if ((q.e.obst[dir] || []).some(([lo, hi]) => q.s > lo - 16 && q.s < hi + 16)) return true;
  const hx = Math.cos(p.heading), hy = Math.sin(p.heading);
  return traffic.cars.some(c => {
    const dx = c.x - p.x, dy = c.y - p.y;
    if (Math.abs(dx) > 30 || Math.abs(dy) > 30) return false;
    const f = dx * hx + dy * hy, lat = -dx * hy + dy * hx;
    return Math.cos(c.heading - p.heading) > 0.7 && f > -12 && f < 25 && lat < -1.2;
  });
}

function checkRules(p, dt) {
  const t = game.time;
  const mph = Math.max(0, p.speed) * MPH;
  const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
  if (p.ind) { p.lastIndDir = p.ind; p.lastIndT = t; }
  if (p.ind && Math.abs(angDiff(p.heading, p.indHeading)) > 1.0 && Math.abs(p.steer) < 0.15) p.ind = 0;   // self-cancel

  const node = nodeAt(p.x + ch * 2, p.y + sh * 2) || nodeAt(p.x, p.y);
  const q = node ? null : roadAt(p.x, p.y);
  if (q && q.dist <= q.e.W / 2 + 0.5) onRoad(p, q, dt, mph);
  else { p.wrongSide = Math.max(0, p.wrongSide - dt * 2); p.lastQ = null; }

  // Speed.
  const limit = p.limit || 30;
  if (mph > limit + 3) p.overLimit += dt; else p.overLimit = 0;
  if (mph > limit + 10 && p.overLimit > 1) fault('speed2', 'serious', 'Speed', `${Math.round(mph)} mph in a ${limit} mph limit`,
    `Speed limits are maximums. ${limit >= 60 ? 'National limit for cars: 60 mph on single carriageways, 70 mph on dual carriageways.' : limit === 20 ? '20 mph zones are common near schools and in city centres.' : 'In towns 30 mph is the norm.'} (Rule 124)`, 'speed', 15);
  else if (p.overLimit > 2.5) fault('speed', 'minor', 'Speed', `Exceeded the ${limit} mph limit`, 'Check your speedometer: it reads in mph. Press L for the speed limiter.', 'speed', 12);

  const surf = surfaceAt(p.x, p.y);
  if (surf === 'pavement' && Math.abs(p.speed) > 1) fault('kerb', 'serious', 'Control', 'Drove on the pavement', 'Pavements are for pedestrians. Mounting the kerb is a serious fault.', 'safety', 6);
  if (surf === 'grass' && Math.abs(p.speed) > 2) fault('grass', 'minor', 'Control', 'Left the road', 'Keep to your lane and steer smoothly.', 'keepleft', 8);

  // Junctions.
  if (node && node !== p.node) enterNode(p, node, t);
  if (!node && p.node) exitNode(p, p.node);
  if (node) inNode(p, node, dt);
  p.node = node;
}

function onRoad(p, q, dt, mph) {
  const e = q.e, along = Math.cos(p.heading - q.ang);
  const dir = along > 0 ? 1 : -1;
  if (e !== p.lastEdge) {
    if (p.lastEdge && p.lastEdge.limit !== e.limit)
      game.tip(e.limit >= 60 ? `National speed limit: ${e.kind === 'dual' ? '70 mph on this dual carriageway' : '60 mph on this single carriageway'}` : `Speed limit now ${e.limit} mph`, 'limit', 0);
    p.limit = e.limit;
    if (lanesOf(e, dir) && (dir > 0 ? e.busF : e.busB)) game.tip('Bus lane on the left (red surface). Stay out of it during its hours of operation (Rule 141).', 'bus' + e.id, 60);
    if (e.lanesB === 0 && lanesOf(e, dir)) game.tip('One-way street. You may use either lane; pick the right-hand lane early if you will turn right.', 'oneway' + e.id, 90);
    if (e.kind === 'single') game.tip('Single-track road: no centre line. Slow down for bends and pull into a passing place on your LEFT, or wait opposite one on your right (Rule 155).', 'single', 120);
    if (e.kind === 'dual') game.tip('Dual carriageway, 70 mph. Keep to the left lane; use the right lane only to overtake (Rule 137).', 'dual', 120);
    p.lastEdge = e;
  }
  game.where = { road: e.name, district: e.district, kind: e.kind };
  if (Math.abs(along) < 0.6 || p.speed < 1.5) { p.wrongSide = Math.max(0, p.wrongSide - dt * 2); p.lastQ = { e, s: q.s }; return; }

  if (lanesOf(e, dir) === 0) fault('oneway', 'dangerous', 'Response to signs', 'Drove the wrong way along a one-way street',
    'Look for the blue one-way arrows and the red-and-white No Entry signs.', 'signs', 15);

  // Keep left.
  const side = (q.lat - e.div) * dir;
  const tol = e.kind === 'single' ? -1.0 : -0.4;
  if (lanesOf(e, dir) && lanesOf(e, -dir) && side < tol && !passingSomething(p, q, dir)) p.wrongSide += dt;
  else p.wrongSide = Math.max(0, p.wrongSide - dt * 2);
  if (p.wrongSide > 3 && !p.wrongSideFault) {
    p.wrongSideFault = true;
    fault('side', 'serious', 'Positioning', 'Drove on the right-hand side of the road', 'In the UK keep LEFT. The centre line should be on your right, next to you as the driver (Rule 160).', 'keepleft', 1);
  }
  if (p.wrongSide === 0) p.wrongSideFault = false;

  const lane = laneIndex(e, dir, q.lat);
  // Dual carriageway: don't sit in the overtaking lane.
  if (e.kind === 'dual' && lane >= 1 && !passingSomething(p, q, dir)) p.hogT += dt; else p.hogT = Math.max(0, p.hogT - dt);
  if (p.hogT > 15) fault('hog', 'minor', 'Positioning', 'Stayed in the overtaking lane', 'On dual carriageways keep to the left lane unless overtaking (Rules 137, 264).', 'keepleft', 30);
  // Bus lane.
  const endDist = dir > 0 ? e.len - e.b.r - q.s : q.s - e.a.r;
  if (isBusLane(e, dir, lane) && lanesOf(e, dir) > 1 && endDist > 25) p.busT += dt; else p.busT = 0;
  if (p.busT > 2.5) fault('bus', 'minor', 'Road markings', 'Drove in a bus lane', 'Bus lanes are marked with a solid white line and BUS LANE on a red surface. Check the times on the blue sign (Rule 141).', 'signs', 20);
  // Passing an obstruction on your side: oncoming traffic has priority.
  for (const [lo, hi] of e.obst[dir] || []) {
    const inZone = dir > 0 ? q.s > lo - 6 && q.s < hi : q.s < hi + 6 && q.s > lo;
    if (!inZone || side > e.laneW * 0.55) continue;
    const oncoming = traffic.cars.some(c => Math.cos(c.heading - p.heading) < -0.5 && c.speed > 1.5 && Math.hypot(c.x - p.x, c.y - p.y) < 30 &&
      (c.x - p.x) * Math.cos(p.heading) + (c.y - p.y) * Math.sin(p.heading) > 0);
    if (oncoming) fault('obst', 'serious', 'Meeting traffic', 'Did not give way to oncoming traffic at an obstruction',
      'If the obstruction (parked cars, a pinch point) is on your side, oncoming traffic goes first (Rule 163).', 'junction', 10);
  }
  // Speed humps.
  for (const h of e.humps) if (Math.abs(q.s - h) < 1.2 && mph > 18) {
    game.shake = Math.max(game.shake, 0.5);
    fault('hump', 'minor', 'Speed', 'Too fast over a speed hump', 'Slow to about 15 mph for humps. They are there because children and pedestrians are about.', 'speed', 4);
  }
  // Crossings and level crossings: detect crossing the stop point since the last frame.
  const prev = p.lastQ && p.lastQ.e === e ? p.lastQ.s : null;
  const crossed = (s) => prev !== null && (prev - s) * dir < 0 && (q.s - s) * dir >= 0;
  for (const c of world.crossings) {
    if (c.e !== e) continue;
    const ahead = (c.s - q.s) * dir;
    if (ahead > 15 && ahead < 55 && mph > 5) game.tip(c.kind === 'zebra' ? 'Zebra crossing ahead: give way once someone steps on (Rule 195).' : 'Pedestrian crossing with lights ahead. Red means stop, even if nobody is crossing yet (Rule 196).', 'cx' + c.id, 60);
    if (c.kind === 'puffin' && crossed(c.s - dir * 3.5)) { const st = puffinState(c, game.time); if (st === 'R' || st === 'RA') fault('puffin', 'serious', 'Pedestrian crossings', 'Went through a red light at a pedestrian crossing', 'Stop at the white line when the light is red (Rules 176, 196).', 'crossing', 6); }
    if (crossingBusy(c) && Math.abs(q.s - c.s) < 2.4 + p.len / 2) fault('zebra', 'serious', 'Pedestrian crossings', `Did not give way to a pedestrian on a ${c.kind === 'zebra' ? 'zebra' : 'pedestrian'} crossing`,
      'You MUST give way once someone has moved onto a crossing (Rule 195).', 'crossing', 6);
  }
  for (const lx of world.levelX) {
    if (lx.e !== e) continue;
    const ahead = (lx.s - q.s) * dir;
    if (ahead > 20 && ahead < 90 && mph > 5) game.tip('Level crossing ahead. Amber then flashing red lights mean STOP, and keep waiting while they flash (Rule 293).', 'lx' + lx.id, 60);
    if (crossed(lx.s - dir * 7) && lx.state !== 'open') fault('lx', 'dangerous', 'Level crossings', 'Crossed a level crossing while the lights were showing',
      'Amber then flashing red means a train is coming. Stop at the white line (Rule 293).', 'general', 10);
  }
  // Coaching for the junction ahead.
  const to = dir > 0 ? e.b : e.a;
  const dist = Math.hypot(to.x - p.x, to.y - p.y) - to.r;
  if (dist < 55 && dist > 18 && mph > 6) junctionTip(to, e);
  if (to.asl && dist < 6 && dist > 0.5 && Math.abs(p.speed) < 0.2) {
    const arm = to.arms.find(a => a.e === e);
    if (arm && lightState(to, arm, game.time) !== 'G') fault('asl', 'minor', 'Response to signals', 'Stopped in the cyclists\' box', 'At red, stop at the FIRST white line. The box beyond it is for cyclists (Rule 178).', 'lights', 30);
  }
  if (dist < 25) p.approachMin = Math.min(p.approachMin, Math.abs(p.speed)); else p.approachMin = 99;
  p.lastLane = lane; p.lastLaneCount = lanesOf(e, dir);
  p.lastQ = { e, s: q.s };
}

function junctionTip(n, e) {
  const k = 'j' + n.id;
  const arm = n.arms.find(a => a.e === e);
  if (n.type === 'rb' && n.signals) game.tip('Traffic lights on the roundabout entry. Go on green, then give way on the roundabout as normal.', k);
  else if (n.type === 'rb' && n.ringLanes > 1) game.tip('Two-lane roundabout: LEFT lane for the first exit or straight on, RIGHT lane for exits past 12 o\'clock. Follow the lane arrows (Rule 186).', k);
  else if (n.type === 'rb') game.tip('Roundabout: give way to traffic from the RIGHT, then go clockwise. Signal left for the first exit, right for exits past 12 o\'clock.', k);
  else if (n.type === 'mini') game.tip(n.arms.some(a => (a.e.a.type === 'mini' && a.e.a !== n) || (a.e.b.type === 'mini' && a.e.b !== n)) ? 'Double mini-roundabout: treat each one separately and give way to the right at both (Rule 189).' : 'Mini-roundabout: give way to the right and go round the white circle, not over it (Rule 188).', k);
  else if (n.type === 'lights' && n.box) game.tip('Box junction (yellow criss-cross): do not enter unless your exit is clear (Rule 174).', k);
  else if (n.type === 'lights') game.tip('Traffic lights ahead. Turning right? Give way to oncoming traffic even on green (Rule 176).', k);
  else if (n.type === 'stop' && arm && !arm.major) game.tip('STOP sign: you must stop completely at the line, even if the road is clear (Rule 171).', k);
  else if (n.type === 'unmarked') game.tip('Unmarked crossroads: nobody has priority. Slow down and look both ways (Rule 146).', k);
  else if (n.gap && arm && !arm.major) game.tip('Crossing a dual carriageway: treat each half separately. Only wait in the gap if your car fits in it (Rule 173).', k);
  else if (n.type === 'give' && arm && !arm.major) game.tip('Give way: traffic on the main road has priority. Look RIGHT, LEFT, then RIGHT again before you pull out.', k);
  else if (n.type === 'give' && arm && arm.major) game.tip('Junction ahead. Turning right? Wait just left of the centre line for a gap in oncoming traffic.', k, 120);
}

function armFromPoint(n, x, y) {
  const a = Math.atan2(y - n.y, x - n.x);
  return n.arms.reduce((b, arm) => !b || Math.abs(angDiff(a, arm.ang)) < Math.abs(angDiff(a, b.ang)) ? arm : b, null);
}
const sinceInd = (p, t) => p.ind || (t - p.lastIndT < 2.5 ? p.lastIndDir : 0);

function enterNode(p, n, t) {
  const arm = armFromPoint(n, p.x - Math.cos(p.heading) * 3, p.y - Math.sin(p.heading) * 3);
  const opp = oppositeArm(n, arm);
  const oncoming = !!opp && traffic.cars.some(c => approaching(c, n, 35, opp) && c.speed > 4);
  p.nodeEntry = { node: n, arm, heading: p.heading, ind: sinceInd(p, t), t, lane: p.lastLane || 0, lanes: p.lastLaneCount || 1, oncoming };
  p.rbAngle = Math.atan2(p.y - n.y, p.x - n.x); p.rbTurned = 0; p.boxT = 0;
  if (p.speed < 1) return;
  if ((n.type === 'lights' || n.signals) && arm) {
    const st = lightState(n, arm, t);
    if (st === 'R' || st === 'RA') fault('red', 'serious', 'Response to signals', 'Drove through a red light', 'You MUST stop behind the white line unless the light is green. Red + amber still means stop (Rule 176).', 'lights', 5);
  }
  if (n.type === 'rb') {
    const entry = Math.atan2(p.y - n.y, p.x - n.x);
    const conflict = traffic.cars.some(c => {
      const r = Math.hypot(c.x - n.x, c.y - n.y);
      if (r > n.r || c.speed < 2 || Math.hypot(c.x - p.x, c.y - p.y) > 16) return false;
      const rel = angDiff(entry, Math.atan2(c.y - n.y, c.x - n.x));
      return rel > 0 && rel < 1.3;
    });
    if (conflict) fault('rbgive', 'serious', 'Junctions', 'Did not give way to traffic from the right at a roundabout', 'At roundabouts give priority to traffic coming from your RIGHT (Rule 185).', 'roundabout', 6);
  }
  if (n.type === 'mini' && traffic.cars.some(c => c.speed > 2 && inBox(c, n, 0) && Math.hypot(c.x - p.x, c.y - p.y) < 10))
    fault('minigive', 'serious', 'Junctions', 'Did not give way at a mini-roundabout', 'Mini-roundabouts work like big ones: give way to traffic from the right (Rule 188).', 'roundabout', 6);
  if ((n.type === 'give' || n.type === 'stop') && arm && !arm.major) {
    if (n.type === 'stop' && p.approachMin > 0.4) fault('stop', 'serious', 'Response to signs', 'Did not stop at a STOP sign', 'At a STOP sign you must stop completely at the solid white line (Rule 171).', 'junction', 6);
    const conflict = n.arms.some(a => a.major && traffic.cars.some(c => approaching(c, n, 32, a) && c.speed > 3));
    if (conflict) fault('give', 'serious', 'Junctions', 'Pulled out without giving way to traffic on the main road', 'Observation at junctions is the top reason for failing the test. Look right, left, right (Rule 172).', 'junction', 6);
  }
  if (n.type === 'unmarked' && traffic.cars.some(c => c.speed > 3 && n.arms.some(a => a !== arm && approaching(c, n, 18, a))))
    fault('unmarked', 'minor', 'Junctions', 'Went into an unmarked crossroads as another car arrived', 'Nobody has priority at an unmarked crossroads. Slow down and be ready to stop (Rule 146).', 'junction', 8);
}

function inNode(p, n, dt) {
  if (n.type === 'rb' || n.type === 'mini') {
    const a = Math.atan2(p.y - n.y, p.x - n.x);
    p.rbTurned += angDiff(a, p.rbAngle); p.rbAngle = a;
    if (p.rbTurned < -0.6) fault('rbwrong', 'dangerous', 'Roundabouts', 'Went the wrong way round a roundabout', 'UK roundabouts go CLOCKWISE: turn left onto them (Rule 185).', 'roundabout', 10);
    if (n.type === 'mini' && Math.hypot(p.x - n.x, p.y - n.y) < n.islandR && Math.abs(p.speed) > 1)
      fault('minicentre', 'minor', 'Roundabouts', 'Drove over the mini-roundabout marking', 'Go round the white circle. Only large vehicles that cannot avoid it may drive over it (Rule 188).', 'roundabout', 10);
  }
  if (n.box && Math.abs(p.speed) < 0.3) { p.boxT += dt; if (p.boxT > 1.5) fault('box', 'minor', 'Junctions', 'Stopped in a yellow box junction', 'Do not enter the box unless your exit is clear (Rule 174).', 'junction', 20); }
}

function exitNode(p, n) {
  const en = p.nodeEntry;
  p.nodeEntry = null;
  if (!en || en.node !== n || !en.arm) return;
  const exArm = armFromPoint(n, p.x, p.y);
  if (n.type === 'rb' || n.type === 'mini') {
    if (p.rbTurned < 0.3 || !exArm) return;
    const sw = rbSweep(en.arm, exArm);
    if (sw < 2.2 && en.ind !== -1) fault('sig', 'minor', 'Signals', 'No left signal for the first exit at a roundabout', 'Taking the first exit: signal left on approach and keep left (Rule 186).', 'roundabout', 4);
    if (sw > 3.7 && en.ind !== 1) fault('sig', 'minor', 'Signals', 'No right signal when turning right at a roundabout', 'Going right: signal right on approach, then left after the exit before yours (Rule 186).', 'roundabout', 4);
    if (en.lanes > 1 && en.lane >= 1 && sw < 2.2) fault('rblane', 'minor', 'Roundabouts', 'Used the right-hand lane to take the first exit', 'For the first exit, approach in the LEFT lane (Rule 186).', 'roundabout', 6);
    if (en.lanes > 1 && en.lane === 0 && sw > 3.9) fault('rblane', 'minor', 'Roundabouts', 'Used the left lane to turn right at a roundabout', 'For exits past 12 o\'clock, approach in the RIGHT lane (Rule 186).', 'roundabout', 6);
    return;
  }
  if (n.type === 'bend' || n.type === 'gateway') return;
  const d = angDiff(p.heading, en.heading);
  const turn = d > 0.9 ? 1 : d < -0.9 ? -1 : 0;
  if (turn === 1 && en.ind !== 1) fault('sig', 'minor', 'Signals', 'Turned right without signalling', SIG_TIP, 'signals', 4);
  if (turn === -1 && en.ind !== -1) fault('sig', 'minor', 'Signals', 'Turned left without signalling', SIG_TIP, 'signals', 4);
  if (turn === 0 && en.ind !== 0 && p.ind) fault('sigm', 'minor', 'Signals', 'Misleading signal: indicated but went straight on', 'Cancel signals you no longer need (Rule 103).', 'signals', 4);
  if (turn === 1 && en.oncoming && (en.arm.major || n.type === 'lights'))
    fault('rightturn', 'serious', 'Junctions', 'Turned right across oncoming traffic', 'Turning right is where most test fails happen. Wait for a safe gap in oncoming traffic (Rule 180).', 'junction', 6);
  if (turn === 1) game.tip('Big right turn done. Make sure you are in the LEFT lane of the new road.', 'afterright', 30);
}
