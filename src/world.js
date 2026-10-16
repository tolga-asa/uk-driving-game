// World: a small English town on a grid, ringed by a 60 mph A-road with countryside outside.
// Units are metres. Screen-style axes: +x east, +y south. Angles: 0 = east, 90° = south,
// so increasing angle is clockwise on screen (the way UK roundabouts flow).
const W = 9;               // carriageway width: two 4.5 m lanes
const LANE = W / 4;        // lane centre offset from the centre line
const PAVE = 3;            // pavement width
const SP = 150;            // distance between junctions
const NX = 6, NY = 5;      // junction grid
const MARGIN = 130;        // countryside outside the ring road
const RB_IN = 6, RB_OUT = 15, RB_LANE = 10.5;
const MPH = 2.23694;       // m/s → mph
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];  // E S W N
const DIR_NAMES = ['east', 'south', 'west', 'north'];
const WORLD_W = MARGIN * 2 + (NX - 1) * SP, WORLD_H = MARGIN * 2 + (NY - 1) * SP;

function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Left of a travel direction (y-down): facing east, left is north.
const leftOf = (d) => [d[1], -d[0]];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

const world = { nodes: [], edges: [], blocks: [], buildings: [], trees: [], zebras: [], fields: [], signs: [] };

function buildWorld() {
  const R = rng(20240917);
  const node = (i, j) => world.nodes[j * NX + i];
  world.node = node;

  // Junction types. Interior layout chosen so every type turns up within a minute of driving.
  const interior = {
    '1,1': 'lights', '2,1': 'give', '3,1': 'rb', '4,1': 'lights',
    '1,2': 'rb', '2,2': 'lights', '3,2': 'give', '4,2': 'rb',
    '1,3': 'give', '2,3': 'rb', '3,3': 'lights', '4,3': 'give',
  };
  const ringRb = { '0,2': 'rb', '5,2': 'rb', '3,0': 'rb', '2,4': 'rb' };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const onRing = i === 0 || j === 0 || i === NX - 1 || j === NY - 1;
    const corner = (i === 0 || i === NX - 1) && (j === 0 || j === NY - 1);
    let type = corner ? 'bend' : onRing ? (ringRb[i + ',' + j] || 'give') : interior[i + ',' + j];
    const n = { i, j, x: MARGIN + i * SP, y: MARGIN + j * SP, type, arms: [], edges: [null, null, null, null],
      phase: R() * 33, onRing };
    // Major road at give-way junctions: the ring road on the ring, alternating axes inside.
    n.major = onRing ? (i === 0 || i === NX - 1 ? 1 : 0) : (i + j) % 2;
    n.r = type === 'rb' ? RB_OUT : W / 2;
    world.nodes.push(n);
  }

  const addEdge = (a, b, dir) => {
    const ringEdge = (a.onRing && b.onRing) && (a.i === b.i ? (a.i === 0 || a.i === NX - 1) : (a.j === 0 || a.j === NY - 1));
    const e = { a, b, dir, ring: ringEdge, limit: ringEdge ? 60 : 30, zebra: null, id: world.edges.length };
    a.edges[dir] = e; b.edges[(dir + 2) % 4] = e;
    a.arms.push(dir); b.arms.push((dir + 2) % 4);
    world.edges.push(e);
  };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if (i < NX - 1) addEdge(node(i, j), node(i + 1, j), 0);
    if (j < NY - 1) addEdge(node(i, j), node(i, j + 1), 1);
  }
  // School street: 20 mph. Zebra crossings on some town streets.
  const school = [node(2, 2).edges[0], node(2, 1).edges[1]];
  school.forEach(e => e.limit = 20);
  const zebraEdges = [node(1, 1).edges[0], node(2, 2).edges[0], node(3, 2).edges[1], node(1, 2).edges[1],
    node(4, 2).edges[1], node(2, 3).edges[0], node(3, 1).edges[0], node(1, 3).edges[0]];
  for (const e of zebraEdges) {
    const len = SP - e.a.r - e.b.r;
    const t = e.a.r + len * (0.42 + R() * 0.16);
    const d = DIRS[e.dir];
    e.zebra = { edge: e, x: e.a.x + d[0] * t, y: e.a.y + d[1] * t, horiz: e.dir === 0, along: t, flash: R() };
    world.zebras.push(e.zebra);
  }

  // Blocks between roads. Town inside the ring, fields outside.
  for (let j = -1; j < NY; j++) for (let i = -1; i < NX; i++) {
    const x0 = i < 0 ? 0 : MARGIN + i * SP + W / 2, x1 = i >= NX - 1 ? WORLD_W : MARGIN + (i + 1) * SP - W / 2;
    const y0 = j < 0 ? 0 : MARGIN + j * SP + W / 2, y1 = j >= NY - 1 ? WORLD_H : MARGIN + (j + 1) * SP - W / 2;
    const town = i >= 0 && j >= 0 && i < NX - 1 && j < NY - 1;
    const b = { x0, y0, x1, y1, town, i, j, kind: 'houses' };
    world.blocks.push(b);
    if (town) fillTownBlock(b, R); else fillField(b, R);
  }
  // Signs: a speed-limit sign facing each direction at the start of every street.
  for (const e of world.edges) for (const fwd of [true, false]) {
    const from = fwd ? e.a : e.b, d = fwd ? DIRS[e.dir] : DIRS[(e.dir + 2) % 4], l = leftOf(d);
    const t = from.r + 9;
    world.signs.push({ kind: 'limit', limit: e.limit, x: from.x + d[0] * t + l[0] * (W / 2 + 1.6), y: from.y + d[1] * t + l[1] * (W / 2 + 1.6) });
  }
  for (const n of world.nodes) for (const arm of n.arms) {
    const d = DIRS[arm], l = leftOf([-d[0], -d[1]]);   // left side for traffic approaching along this arm
    const t = n.r + 4;
    const pos = { x: n.x + d[0] * t + l[0] * (W / 2 + 1.6), y: n.y + d[1] * t + l[1] * (W / 2 + 1.6) };
    if (n.type === 'rb') world.signs.push({ kind: 'giveway', ...pos });
    else if (n.type === 'give' && arm % 2 !== n.major) world.signs.push({ kind: 'giveway', ...pos });
  }
}

function fillTownBlock(b, R) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const inner = { x0: b.x0 + PAVE, y0: b.y0 + PAVE, x1: b.x1 - PAVE, y1: b.y1 - PAVE };
  const special = { '1,1': 'park', '2,1': 'school', '3,2': 'shops', '0,2': 'church', '4,0': 'shops', '2,3': 'park' }[b.i + ',' + b.j];
  if (special) b.kind = special;
  if (b.kind === 'park') {
    for (let k = 0; k < 26; k++) world.trees.push({ x: inner.x0 + 10 + R() * (w - 26), y: inner.y0 + 10 + R() * (h - 26), r: 3 + R() * 2.5 });
    b.pond = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, rx: 18, ry: 11 };
    return;
  }
  if (b.kind === 'school') {
    world.buildings.push({ x: inner.x0 + 22, y: inner.y0 + 20, w: 60, h: 30, roof: '#8a8f99', label: 'SCHOOL' });
    world.buildings.push({ x: inner.x0 + 22, y: inner.y0 + 50, w: 20, h: 30, roof: '#8a8f99' });
    b.pitch = { x: inner.x0 + 60, y: inner.y0 + 70, w: 50, h: 38 };
    return;
  }
  if (b.kind === 'church') {
    world.buildings.push({ x: inner.x0 + 45, y: inner.y0 + 40, w: 40, h: 18, roof: '#6d6a63', label: '✝' });
    world.buildings.push({ x: inner.x0 + 37, y: inner.y0 + 43, w: 9, h: 12, roof: '#5b5852' });
    for (let k = 0; k < 10; k++) world.trees.push({ x: inner.x0 + 8 + R() * (w - 20), y: inner.y0 + 75 + R() * 40, r: 2.5 + R() * 2 });
  }
  // Terraced houses along each side, set back from the pavement, gardens behind.
  const roofs = b.kind === 'shops' ? ['#3d5a80', '#9c2c2c', '#2a6f4f', '#7a5c2e', '#4b3f72'] : ['#7d3b2f', '#8c4a36', '#6e3428', '#5d5f63', '#9a5a40', '#6b4a3a'];
  const setback = 4, depth = b.kind === 'shops' ? 16 : 10;
  const corner = 12;
  const row = (horizontal, fixed, from, to, facingNeg) => {
    let p = from;
    while (p < to - 6) {
      const bw = (b.kind === 'shops' ? 9 : 6) + R() * 3;
      if (p + bw > to) break;
      const roof = roofs[(R() * roofs.length) | 0];
      if (horizontal) world.buildings.push({ x: p, y: facingNeg ? fixed : fixed - depth, w: bw - 0.4, h: depth, roof, shop: b.kind === 'shops' });
      else world.buildings.push({ x: facingNeg ? fixed : fixed - depth, y: p, w: depth, h: bw - 0.4, roof, shop: b.kind === 'shops' });
      p += bw;
      if (R() < 0.12) p += 3 + R() * 4;   // a gap between terraces
    }
  };
  if (b.kind !== 'church') row(true, inner.y0 + setback, inner.x0 + corner, inner.x1 - corner, true);
  row(true, inner.y1 - setback, inner.x0 + corner, inner.x1 - corner, false);
  row(false, inner.x0 + setback, inner.y0 + corner + depth, inner.y1 - corner - depth, true);
  row(false, inner.x1 - setback, inner.y0 + corner + depth, inner.y1 - corner - depth, false);
  for (let k = 0; k < 6; k++) world.trees.push({ x: inner.x0 + 30 + R() * (w - 60), y: inner.y0 + 30 + R() * (h - 60), r: 2 + R() * 2 });
}

function fillField(b, R) {
  b.kind = 'field';
  const greens = ['#7fa457', '#8bb060', '#9bb86a', '#c9b56a', '#86a95a'];
  // Split into a few fields bounded by hedges.
  const cols = Math.max(1, Math.round((b.x1 - b.x0) / 75)), rows = Math.max(1, Math.round((b.y1 - b.y0) / 75));
  for (let a = 0; a < cols; a++) for (let c = 0; c < rows; c++) {
    const fx0 = b.x0 + (b.x1 - b.x0) * a / cols, fx1 = b.x0 + (b.x1 - b.x0) * (a + 1) / cols;
    const fy0 = b.y0 + (b.y1 - b.y0) * c / rows, fy1 = b.y0 + (b.y1 - b.y0) * (c + 1) / rows;
    world.fields.push({ x0: fx0 + 3, y0: fy0 + 3, x1: fx1 - 3, y1: fy1 - 3, color: greens[(R() * greens.length) | 0], rows: R() < 0.4 });
  }
  for (let k = 0; k < 8; k++) {
    const x = b.x0 + 8 + R() * (b.x1 - b.x0 - 16), y = b.y0 + 8 + R() * (b.y1 - b.y0 - 16);
    world.trees.push({ x, y, r: 3 + R() * 3 });
  }
}

// ---- Traffic lights. Axis 0 = east-west arms, 1 = north-south arms.
// UK sequence: red → red+amber → green → amber → red.
const LIGHT_CYCLE = 33;
function lightState(n, axis, time) {
  const t = (time + n.phase) % LIGHT_CYCLE;
  const a = t < 2 ? 'RA' : t < 12 ? 'G' : t < 15 ? 'A' : 'R';
  const b = t < 16.5 ? 'R' : t < 18.5 ? 'RA' : t < 28.5 ? 'G' : t < 31.5 ? 'A' : 'R';
  return axis === 0 ? a : b;
}

// ---- Location queries
function nodeAtPoint(x, y) {
  const i = Math.round((x - MARGIN) / SP), j = Math.round((y - MARGIN) / SP);
  if (i < 0 || j < 0 || i >= NX || j >= NY) return null;
  const n = world.node(i, j);
  const dx = x - n.x, dy = y - n.y;
  if (n.type === 'rb') return dx * dx + dy * dy < (RB_OUT + 0.5) ** 2 ? n : null;
  return Math.abs(dx) <= W / 2 + 0.3 && Math.abs(dy) <= W / 2 + 0.3 ? n : null;
}
// The street under a point: { edge, lat (signed offset from centre line, + = south/east), along }.
function edgeAtPoint(x, y) {
  const fi = (x - MARGIN) / SP, fj = (y - MARGIN) / SP;
  const j = Math.round(fj), i = Math.round(fi);
  if (j >= 0 && j < NY && Math.abs(y - (MARGIN + j * SP)) <= W / 2 + 0.2) {
    const i0 = Math.floor(fi);
    if (i0 >= 0 && i0 < NX - 1) {
      const e = world.node(i0, j).edges[0];
      const along = x - e.a.x;
      if (along > e.a.r && along < SP - e.b.r) return { edge: e, lat: y - e.a.y, along };
    }
  }
  if (i >= 0 && i < NX && Math.abs(x - (MARGIN + i * SP)) <= W / 2 + 0.2) {
    const j0 = Math.floor(fj);
    if (j0 >= 0 && j0 < NY - 1) {
      const e = world.node(i, j0).edges[1];
      const along = y - e.a.y;
      if (along > e.a.r && along < SP - e.b.r) return { edge: e, lat: x - e.a.x, along };
    }
  }
  return null;
}
function surfaceAt(x, y) {
  if (nodeAtPoint(x, y)) {
    const n = nodeAtPoint(x, y);
    if (n.type === 'rb' && Math.hypot(x - n.x, y - n.y) < RB_IN) return 'island';
    return 'road';
  }
  if (edgeAtPoint(x, y)) return 'road';
  if (x < 2 || y < 2 || x > WORLD_W - 2 || y > WORLD_H - 2) return 'wall';
  for (const b of world.blocks) if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) {
    if (!b.town) return 'grass';
    if (x < b.x0 + PAVE || x > b.x1 - PAVE || y < b.y0 + PAVE || y > b.y1 - PAVE) return 'pavement';
    return 'grass';
  }
  return 'road';   // seams between road rectangles
}
function buildingAt(x, y, pad = 0) {
  for (const h of world.buildings) if (x > h.x - pad && x < h.x + h.w + pad && y > h.y - pad && y < h.y + h.h + pad) return h;
  return null;
}
