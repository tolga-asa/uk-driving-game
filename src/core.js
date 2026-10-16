// Road network core. Roads are polylines with lanes; junctions are nodes where roads meet.
// Units are metres. Screen axes: +x east, +y south. Angles: 0 = east, increasing clockwise on screen
// (the way UK roundabouts flow). `lat` on a road is the sideways offset, positive = left of the a→b direction.
const MPH = 2.23694;
const LANE_W = 3.4, PAVE = 3;
const TAU = Math.PI * 2;
const world = { nodes: [], edges: [], buildings: [], trees: [], parked: [], crossings: [], levelX: [], fields: [],
  signs: [], obstacles: [], rail: null, trains: [], W: 2100, H: 1600 };

function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const leftOf = (d) => [d[1], -d[0]];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

function addNode(x, y, type = 'give', o = {}) {
  const n = { id: world.nodes.length, x, y, type, arms: [], r: 0, phase: 0, pave: true, ...o };
  world.nodes.push(n);
  return n;
}

// Catmull-Rom through the control points, sampled every `step` metres.
function sampleCurve(ctrl, step) {
  const out = [ctrl[0].slice()];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function addRoad(a, b, o = {}) {
  const e = { id: world.edges.length, a, b, lanesF: 1, lanesB: 1, laneW: LANE_W, median: 0, limit: 30, kind: 'town',
    rank: 1, pave: true, busF: false, busB: false, name: '', humps: [], bays: [], ...o };
  if (e.oneway) e.lanesB = 0;
  e.W = (e.lanesF + e.lanesB) * e.laneW + e.median;
  e.div = (e.lanesB - e.lanesF) * e.laneW / 2;          // lat of the line between the two directions
  const ctrl = [[a.x, a.y], ...(o.via || []), [b.x, b.y]];
  e.pts = ctrl.length > 2 ? sampleCurve(ctrl, 4) : ctrl.map(p => p.slice());
  e.cum = [0];
  for (let k = 1; k < e.pts.length; k++) e.cum.push(e.cum[k - 1] + Math.hypot(e.pts[k][0] - e.pts[k - 1][0], e.pts[k][1] - e.pts[k - 1][1]));
  e.len = e.cum[e.cum.length - 1];
  const p = e.pts, m = p.length - 1;
  a.arms.push({ e, end: 'a', node: a, ang: Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]) });
  b.arms.push({ e, end: 'b', node: b, ang: Math.atan2(p[m - 1][1] - p[m][1], p[m - 1][0] - p[m][0]) });
  world.edges.push(e);
  return e;
}

const lanesOf = (e, dir) => dir > 0 ? e.lanesF : e.lanesB;
const laneLat = (e, dir, i) => dir > 0 ? e.W / 2 - (i + 0.5) * e.laneW : -e.W / 2 + (i + 0.5) * e.laneW;
const isBusLane = (e, dir, i) => i === 0 && (dir > 0 ? e.busF : e.busB);
// Arm helpers. Arriving at a node along an arm means driving towards that end.
const dirIn = (arm) => arm.end === 'a' ? -1 : 1;
const sFrom = (arm, d) => arm.end === 'a' ? d : arm.e.len - d;
const canEnter = (arm) => lanesOf(arm.e, dirIn(arm)) > 0;     // traffic can arrive at the node on this arm
const canExit = (arm) => lanesOf(arm.e, -dirIn(arm)) > 0;     // traffic can leave the node on this arm

function segIndex(e, s) {
  let lo = 0, hi = e.cum.length - 2;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (e.cum[mid] <= s) lo = mid; else hi = mid - 1; }
  return lo;
}
function pointAt(e, s, lat = 0) {
  s = clamp(s, 0, e.len);
  const k = segIndex(e, s), a = e.pts[k], b = e.pts[k + 1];
  const L = (e.cum[k + 1] - e.cum[k]) || 1, t = (s - e.cum[k]) / L;
  const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
  return { x: a[0] + (b[0] - a[0]) * t + ty * lat, y: a[1] + (b[1] - a[1]) * t - tx * lat, ang: Math.atan2(ty, tx) };
}

function finalizeNodes() {
  for (const n of world.nodes) {
    n.arms.sort((p, q) => p.ang - q.ang);
    const maxW = Math.max(...n.arms.map(a => a.e.W / 2));
    if (n.type === 'rb') { n.r = n.ringR + 0.6; n.islandR = n.ringR - n.ringLanes * LANE_W - 0.4; }
    else if (n.type === 'mini') { n.ringR = maxW + 2.6; n.r = n.ringR; n.islandR = 1.6; n.ringLanes = 1; }
    else if (n.arms.length <= 2) { n.r = 0.5; if (n.type !== 'gateway') n.type = 'bend'; }
    else {
      n.r = maxW + 1.2;
      for (let i = 0; i < n.arms.length; i++) {
        const g = Math.abs(angDiff(n.arms[(i + 1) % n.arms.length].ang, n.arms[i].ang));
        if (g < 1.3) n.r = Math.max(n.r, (maxW + 1) / Math.tan(g / 2));
      }
    }
    // Priority: arms on the highest-ranked roads are the major road.
    const top = Math.max(...n.arms.map(a => a.e.rank));
    for (const a of n.arms) a.major = n.type === 'unmarked' ? false : a.e.rank === top && n.arms.filter(b => b.e.rank === top).length <= 2;
    // Traffic-light groups: opposite arms share a phase.
    if (n.type === 'lights' || n.signals) {
      let g = 0;
      for (const a of n.arms) a.group = undefined;
      for (const a of n.arms) {
        if (a.group !== undefined) continue;
        a.group = g;
        for (const b of n.arms) if (b.group === undefined && Math.abs(angDiff(b.ang, a.ang + Math.PI)) < 0.75) b.group = g;
        g++;
      }
      n.groups = g;
    }
  }
}

// ---- Signals. UK sequence: red → red+amber → green → amber → red.
const PHASE = 15.5;
function lightState(n, arm, t) {
  const T = n.groups * PHASE, tt = ((t + n.phase) % T + T) % T, idx = Math.floor(tt / PHASE), local = tt - idx * PHASE;
  if (idx !== arm.group) return 'R';
  return local < 2 ? 'RA' : local < 11 ? 'G' : local < 14 ? 'A' : 'R';
}
function puffinState(c, t) {           // signal for traffic at a puffin crossing
  const tt = ((t + c.phase) % 29 + 29) % 29;
  return tt < 14 ? 'G' : tt < 17 ? 'A' : tt < 27 ? 'R' : 'RA';
}

// ---- Spatial index
const CELL = 24, grid = new Map();
const gkey = (i, j) => i * 8192 + j;
function gadd(x0, y0, x1, y1, item) {
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) {
      const k = gkey(i, j); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(item);
    }
}
const gget = (x, y) => grid.get(gkey(Math.floor(x / CELL), Math.floor(y / CELL))) || [];
function buildIndex() {
  grid.clear();
  for (const e of world.edges) for (let k = 0; k < e.pts.length - 1; k++) {
    const a = e.pts[k], b = e.pts[k + 1], m = e.W / 2 + PAVE + 2;
    gadd(Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, { t: 'e', e, k });
  }
  for (const n of world.nodes) gadd(n.x - n.r - PAVE, n.y - n.r - PAVE, n.x + n.r + PAVE, n.y + n.r + PAVE, { t: 'n', n });
  for (const h of world.buildings) { const m = Math.hypot(h.w, h.h) / 2; gadd(h.x - m, h.y - m, h.x + m, h.y + m, { t: 'b', h }); }
}

// Nearest road under a point: { e, s, lat, ang, dist } (dist = |lat|), or null if none near.
function roadAt(x, y) {
  let best = null;
  for (const it of gget(x, y)) {
    if (it.t !== 'e') continue;
    const e = it.e, a = e.pts[it.k], b = e.pts[it.k + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const u = ((x - a[0]) * dx + (y - a[1]) * dy) / L2;
    if (u < -0.02 || u > 1.02) continue;
    const L = Math.sqrt(L2), tx = dx / L, ty = dy / L;
    const lat = (x - a[0]) * ty - (y - a[1]) * tx;
    const dist = Math.abs(lat);
    if (dist > e.W / 2 + PAVE + 1.5) continue;
    if (!best || dist - e.W / 2 < best.dist - best.e.W / 2) best = { e, s: e.cum[it.k] + clamp(u, 0, 1) * L, lat, ang: Math.atan2(ty, tx), dist };
  }
  return best;
}
function nodeAt(x, y, pad = 0) {
  for (const it of gget(x, y)) if (it.t === 'n') { const n = it.n; if ((x - n.x) ** 2 + (y - n.y) ** 2 < (n.r + pad) ** 2) return n; }
  return null;
}
function buildingAt(x, y, pad = 0) {
  for (const it of gget(x, y)) {
    if (it.t !== 'b') continue;
    const h = it.h, c = Math.cos(h.ang), s = Math.sin(h.ang), dx = x - h.x, dy = y - h.y;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    if (Math.abs(u) < h.w / 2 + pad && Math.abs(v) < h.h / 2 + pad) return h;
  }
  return null;
}
function surfaceAt(x, y) {
  if (x < 2 || y < 2 || x > world.W - 2 || y > world.H - 2) return 'wall';
  const n = nodeAt(x, y);
  if (n) {
    const d = Math.hypot(x - n.x, y - n.y);
    if (n.type === 'rb' && d < n.islandR) return 'island';
    if (n.type === 'mini' && d < n.islandR) return 'mini';
    return 'road';
  }
  const q = roadAt(x, y);
  if (q) {
    const e = q.e;
    if (q.dist <= e.W / 2) return e.median && Math.abs(q.lat - e.div) < e.median / 2 ? 'median' : 'road';
    for (const bay of e.bays) if (Math.abs(q.s - bay.s) < 12 && Math.sign(q.lat) === bay.side && q.dist <= e.W / 2 + 2.6) return 'road';
    if (e.pave && q.dist <= e.W / 2 + PAVE) return 'pavement';
  }
  const n2 = nodeAt(x, y, PAVE);
  if (n2 && n2.pave && n2.arms.some(a => a.e.pave)) return 'pavement';
  return 'grass';
}
const districtAt = (x, y) => (x > 1090 && y < 660) ? 'city' : (x < 1010 && y < 870) ? 'suburb' : (Math.hypot(x - 900, y - 1390) < 240) ? 'village' : 'rural';

// ---- Railway and level crossings
function updateRail(dt, time) {
  const r = world.rail; if (!r) return;
  for (const tr of world.trains) {
    if (tr.wait > 0) { tr.wait -= dt; if (tr.wait <= 0) { tr.dir = -tr.dir; tr.s = tr.dir > 0 ? -150 : r.len + 150; } continue; }
    tr.s += tr.dir * tr.v * dt;
    if (tr.s < -200 || tr.s > r.len + 200) tr.wait = 40 + Math.random() * 30;
  }
  for (const lx of world.levelX) {
    const danger = world.trains.some(tr => {
      if (tr.wait > 0) return false;
      const head = tr.s, tail = tr.s - tr.dir * tr.len;
      if ((lx.sr - head) * (lx.sr - tail) <= 0 || Math.abs(lx.sr - tail) < 20) return true;   // train on the crossing
      const ahead = (lx.sr - head) * tr.dir;
      return ahead > 0 && ahead / tr.v < 15;
    });
    if (danger && lx.state === 'open') { lx.state = 'amber'; lx.t0 = time; }
    if (lx.state === 'amber' && time - lx.t0 > 3) { lx.state = 'red'; lx.t0 = time; }
    if (!danger && lx.state === 'red' && time - lx.t0 > 6) { lx.state = 'open'; }
    const down = lx.state === 'red' && time - lx.t0 > 3.5;
    lx.barrier = clamp(lx.barrier + (down ? dt : -dt) * 0.5, 0, 1);
  }
}
function railPoint(s) {
  const r = world.rail; s = clamp(s, 0, r.len);
  let k = 0; while (k < r.cum.length - 2 && r.cum[k + 1] < s) k++;
  const a = r.pts[k], b = r.pts[k + 1], L = (r.cum[k + 1] - r.cum[k]) || 1, t = (s - r.cum[k]) / L;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
