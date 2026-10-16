// The map: Ashford Green (suburbs), Kingsgate (city centre), the A40 dual-carriageway bypass,
// countryside with a railway, and the village of Little Mardon.
// Features were chosen from what UK drivers and examiners find hardest: multi-lane and signalised roundabouts,
// mini and double-mini roundabouts, one-way streets and a gyratory loop, bus lanes, box junctions,
// advanced stop lines, staggered and unmarked crossroads, STOP junctions, right turns across a dual
// carriageway, level crossings, single-track lanes, parked cars and pinch points.
function buildMap() {
  const R = rng(1185);
  const SUB = { x0: 200, y0: 200, step: 140, nx: 6, ny: 5 };
  const S = {}, C = {};
  const sKey = (i, j) => i + ',' + j;
  const subRows = ['Church Lane', 'Victoria Road', 'Albert Street', 'Park Avenue', 'Mill Road'];
  const subCols = ['Station Road', 'Elm Grove', 'Queens Road', 'Oak Street', 'Manor Way', 'Green Lane'];
  const subType = { '2,1': 'give', '1,1': 'unmarked', '3,1': 'mini', '4,2': 'rb', '1,3': 'stop', '3,3': 'lights', '2,3': 'give' };

  // ---- Ashford Green: a slightly irregular grid of residential streets.
  for (let j = 0; j < SUB.ny; j++) for (let i = 0; i < SUB.nx; i++) {
    const edge = i === 0 || j === 0 || i === SUB.nx - 1 || j === SUB.ny - 1;
    const jx = edge ? 0 : (R() - 0.5) * 22, jy = edge ? 0 : (R() - 0.5) * 22;
    const type = subType[sKey(i, j)] || 'give';
    const n = addNode(SUB.x0 + i * SUB.step + jx, SUB.y0 + j * SUB.step + jy, type, { district: 'suburb' });
    if (type === 'rb') { n.ringR = 13; n.ringLanes = 1; }
    S[sKey(i, j)] = n;
  }
  // Double mini-roundabout replaces the crossing of the two main roads.
  const dm = S['2,2'];
  const miniL = addNode(dm.x - 17, dm.y, 'mini', { district: 'suburb' });
  const miniR = addNode(dm.x + 17, dm.y + 2, 'mini', { district: 'suburb' });
  dm.dead = true;
  // Staggered crossroads: Elm Grove continues south 34 m east of where it arrives from the north.
  const stag = addNode(S['1,2'].x + 34, S['1,2'].y + 1, 'give', { district: 'suburb' });

  const subRoad = (a, b, o) => addRoad(a, b, { kind: 'town', district: 'suburb', ...o });
  const skipH = new Set([]), skipV = new Set(['3,0', '4,3']);
  for (let j = 0; j < SUB.ny; j++) for (let i = 0; i < SUB.nx - 1; i++) {
    let a = S[sKey(i, j)], b = S[sKey(i + 1, j)];
    if (skipH.has(sKey(i, j))) continue;
    const o = { name: subRows[j], rank: j === 2 ? 2 : 1, limit: (j === 1 && (i === 2)) ? 20 : 30 };
    if (j === 2 && i === 1) { subRoad(a, stag, o); subRoad(stag, miniL, o); continue; }
    if (j === 2 && i === 2) { subRoad(miniR, b, o); continue; }
    subRoad(a, b, o);
  }
  subRoad(miniL, miniR, { name: subRows[2], rank: 2 });
  for (let i = 0; i < SUB.nx; i++) for (let j = 0; j < SUB.ny - 1; j++) {
    if (skipV.has(sKey(i, j))) continue;
    let a = S[sKey(i, j)], b = S[sKey(i, j + 1)];
    const o = { name: subCols[i], rank: i === 2 ? 2 : 1, limit: (i === 3 && j === 1) ? 20 : 30 };
    if (i === 1 && j === 2) a = stag;
    if (i === 2 && j === 1) b = miniL;
    if (i === 2 && j === 2) a = miniR;
    subRoad(a, b, o);
  }

  // ---- Kingsgate city centre: one-way streets, a clockwise one-way loop, a bus-lane avenue.
  const cityRows = ['Castle Street', 'King Street', 'Kingsway', 'Queen Street', 'Bridge Street'];
  const cityCols = ['West Street', 'Market Street', 'Broad Street', 'Cross Street', 'High Street', 'East Street'];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) {
    const n = addNode(1150 + i * 100, 200 + j * 100, 'give', { district: 'city' });
    C[sKey(i, j)] = n;
  }
  const cRoad = (a, b, o) => addRoad(a, b, { kind: 'city', district: 'city', ...o });
  const rowCfg = [
    { rank: 1, limit: 30 },
    { rank: 2, limit: 20, oneway: true, lanesF: 2 },                  // King Street: one-way east
    { rank: 3, limit: 30, lanesF: 2, lanesB: 2, busF: true, busB: true }, // Kingsway: bus lanes both ways
    { rank: 2, limit: 20, oneway: true, lanesF: 2, rev: true },       // Queen Street: one-way west
    { rank: 1, limit: 30 },
  ];
  const colCfg = [
    { rank: 1, limit: 30 }, { rank: 1, limit: 20, oneway: true, rev: true },    // Market Street: one-way north
    { rank: 1, limit: 20 }, { rank: 2, limit: 20, oneway: true, lanesF: 2 }, // Cross Street: one-way south
    { rank: 1, limit: 20 }, { rank: 1, limit: 30 },
  ];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const c = rowCfg[j], a = C[sKey(i, j)], b = C[sKey(i + 1, j)];
    cRoad(c.rev ? b : a, c.rev ? a : b, { ...c, name: cityRows[j] });
  }
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const c = colCfg[i], a = C[sKey(i, j)], b = C[sKey(i, j + 1)];
    cRoad(c.rev ? b : a, c.rev ? a : b, { ...c, name: cityCols[i] });
  }
  for (const k in C) {
    const n = C[k], [i, j] = k.split(',').map(Number);
    const inner = i > 0 && i < 5 && j > 0 && j < 4;
    if (inner || (j === 2 && (i === 0 || i === 5))) n.type = 'lights';
    if (j === 2 && inner) { n.box = true; n.asl = true; }
    if (j === 0 && i === 3) n.type = 'stop';
  }

  // ---- Links between districts.
  const link = (a, b, o) => addRoad(a, b, { kind: 'link', limit: 30, rank: 2, ...o });
  link(S['5,0'], C['0,0'], { name: 'Station Road' });
  link(S['5,2'], C['0,3'], { name: 'London Road', via: [[1020, 488]] });
  link(S['5,4'], C['0,4'], { name: 'Mill Road', via: [[1010, 720], [1090, 640]] });

  // ---- A40 bypass: a 70 mph dual carriageway between large roundabouts.
  const rb1 = addNode(220, 1000, 'rb', { ringR: 16, ringLanes: 1, district: 'rural' });
  const rb2 = addNode(620, 1000, 'rb', { ringR: 24, ringLanes: 2, district: 'rural', spiral: true });
  const rb3 = addNode(1150, 1000, 'rb', { ringR: 27, ringLanes: 2, district: 'rural', signals: true });
  const gap = addNode(1400, 1000, 'give', { district: 'rural', gap: true });
  const rb4 = addNode(1650, 1000, 'rb', { ringR: 21, ringLanes: 2, district: 'rural' });
  const dual = { kind: 'dual', lanesF: 2, lanesB: 2, median: 3.2, limit: 70, rank: 4, pave: false, name: 'A40 Bypass' };
  addRoad(rb1, rb2, dual); addRoad(rb2, rb3, dual); addRoad(rb3, gap, dual); addRoad(gap, rb4, dual);
  const a40 = { kind: 'link', limit: 40, rank: 2, pave: false };
  link(S['0,4'], rb1, { ...a40, name: 'Station Road' });
  link(S['3,4'], rb2, { ...a40, name: 'Oak Street', via: [[628, 880]] });
  link(C['2,4'], rb3, { ...a40, name: 'Broad Street', via: [[1350, 740], [1220, 880]] });
  link(C['5,4'], rb4, { ...a40, name: 'East Street' });

  // ---- Countryside and Little Mardon.
  const rural = { kind: 'rural', limit: 60, rank: 2, pave: false, hedge: true };
  const village = { kind: 'village', limit: 30, rank: 2, district: 'village' };
  const v1 = addNode(780, 1340, 'give', { district: 'village' });
  const v2 = addNode(900, 1340, 'mini', { district: 'village' });
  const v3 = addNode(1020, 1340, 'give', { district: 'village' });
  const v4 = addNode(900, 1462, 'give', { district: 'village' });
  const gwA = addNode(690, 1318, 'gateway', { pave: false }), gwB = addNode(866, 1236, 'gateway', { pave: false });
  const gwC = addNode(1058, 1246, 'gateway', { pave: false }), gwD = addNode(1112, 1352, 'gateway', { pave: false });
  addRoad(rb1, gwA, { ...rural, name: 'Mardon Lane', via: [[232, 1120], [318, 1252], [470, 1236], [585, 1322]] });
  addRoad(gwA, v1, { ...village, name: 'Mardon Lane' });
  addRoad(rb2, gwB, { ...rural, name: 'Ferry Road', via: [[640, 1110], [760, 1160]] });
  addRoad(gwB, v2, { ...village, name: 'Ferry Road' });
  addRoad(rb3, gwC, { ...rural, name: 'Kings Hill', via: [[1150, 1110], [1100, 1190]] });
  addRoad(gwC, v3, { ...village, name: 'Kings Hill' });
  addRoad(v1, v2, { ...village, name: 'High Street', rank: 3 });
  addRoad(v2, v3, { ...village, name: 'High Street', rank: 3 });
  addRoad(v1, v4, { ...village, name: 'Back Lane', rank: 1, via: [[792, 1440]] });
  addRoad(v2, v4, { ...village, name: 'Church Walk', rank: 1 });
  addRoad(v4, v3, { ...village, name: 'Back Lane', rank: 1, via: [[1012, 1450]] });
  addRoad(v3, gwD, { ...village, name: 'Wold Lane', rank: 1 });
  addRoad(gwD, gap, { kind: 'single', laneW: 2.3, limit: 60, rank: 1, pave: false, hedge: true, name: 'Wold Lane (single track)',
    via: [[1250, 1392], [1382, 1300], [1412, 1120]] });
  for (const n of [v1, v2, v3, v4]) n.district = 'village';

  world.nodes = world.nodes.filter(n => !n.dead);
  world.nodes.forEach((n, i) => n.id = i);
  for (const e of world.edges) e.district = e.district || (e.kind === 'village' ? 'village' : e.kind === 'city' ? 'city' : e.kind === 'town' ? 'suburb' : 'rural');
  finalizeNodes();

  // ---- Railway with level crossings found where it meets roads.
  const railPts = sampleCurve([[0, 1218], [600, 1196], [1300, 1176], [2100, 1150]], 6);
  const rail = { pts: railPts, cum: [0] };
  for (let k = 1; k < railPts.length; k++) rail.cum.push(rail.cum[k - 1] + Math.hypot(railPts[k][0] - railPts[k - 1][0], railPts[k][1] - railPts[k - 1][1]));
  rail.len = rail.cum[rail.cum.length - 1];
  world.rail = rail;
  for (const e of world.edges) for (let k = 0; k < e.pts.length - 1; k++) for (let m = 0; m < railPts.length - 1; m++) {
    const hit = segX(e.pts[k], e.pts[k + 1], railPts[m], railPts[m + 1]);
    if (!hit) continue;
    const s = e.cum[k] + hit.t * (e.cum[k + 1] - e.cum[k]), sr = rail.cum[m] + hit.u * (rail.cum[m + 1] - rail.cum[m]);
    const p = pointAt(e, s);
    world.levelX.push({ e, s, sr, x: p.x, y: p.y, ang: p.ang, state: 'open', t0: 0, barrier: 0, id: world.levelX.length });
  }
  world.trains.push({ s: -150, dir: 1, v: 33, len: 92, wait: 8 });

  // ---- Street furniture on roads: crossings, humps, passing places, parked cars, a pinch point.
  const findEdge = (a, b) => world.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  const addCrossing = (e, kind, t = 0.5) => { if (!e) return; const s = e.len * t, p = pointAt(e, s);
    world.crossings.push({ e, s, kind, x: p.x, y: p.y, ang: p.ang, phase: R() * 26, id: world.crossings.length }); };
  addCrossing(findEdge(S['0,2'], S['1,2']), 'zebra', 0.55);
  addCrossing(findEdge(S['2,0'], S['2,1']), 'zebra');
  addCrossing(findEdge(S['2,4'], S['3,4']), 'zebra', 0.4);
  addCrossing(findEdge(S['4,1'], S['4,2']), 'zebra');
  addCrossing(findEdge(S['2,1'], S['3,1']), 'zebra', 0.35);
  addCrossing(findEdge(C['1,2'], C['2,2']), 'puffin');
  addCrossing(findEdge(C['3,2'], C['4,2']), 'puffin');
  addCrossing(findEdge(C['2,1'], C['3,1']), 'puffin');
  addCrossing(findEdge(C['3,2'], C['3,3']), 'puffin');
  addCrossing(findEdge(C['2,0'], C['2,1']), 'zebra');
  addCrossing(findEdge(C['3,4'], C['4,4']), 'zebra');
  addCrossing(findEdge(v2, v3), 'zebra', 0.45);
  for (const e of [findEdge(S['2,1'], S['3,1']), findEdge(S['3,1'], S['3,2'])]) if (e) e.humps = [0.22, 0.62, 0.85].map(t => e.len * t);
  const single = world.edges.find(e => e.kind === 'single');
  for (let s = 60, side = 1; s < single.len - 40; s += 110, side = -side) single.bays.push({ s, side });
  for (const e of world.edges) {
    if (!['town', 'city', 'village'].includes(e.kind) || e.rank > 2 || e.limit === 20 || e.lanesB === 0 || e.len < 70) continue;
    if (R() < 0.45) continue;
    const side = R() < 0.5 ? 1 : -1, dir = side > 0 ? 1 : -1;     // parked in the kerb lane on that side
    for (let s = e.a.r + 22; s < e.len - e.b.r - 22; s += 6 + R() * 10) {
      if (world.crossings.some(c => c.e === e && Math.abs(c.s - s) < 20)) continue;
      if (R() < 0.35) { s += 14; continue; }
      world.parked.push({ e, s, dir, lat: laneLat(e, dir, 0) + side * 0.75, color: CAR_COLORS[(R() * CAR_COLORS.length) | 0], len: 4.3, wid: 1.8, parked: true });
    }
  }
  const pinch = findEdge(S['0,3'], S['1,3']);
  if (pinch) { world.parked = world.parked.filter(p => p.e !== pinch); world.obstacles.push({ e: pinch, s: pinch.len / 2, side: 1, len: 7 }); }
  // Parked cars and build-outs both block a lane; record them as obstructions for give-way logic.
  for (const p of world.parked) { const q = pointAt(p.e, p.s, p.lat); p.x = q.x; p.y = q.y; p.heading = p.dir > 0 ? q.ang : q.ang + Math.PI; }
}

function segX(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}
