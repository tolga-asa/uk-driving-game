// Buildings, trees, fields and road signs, placed along the roads in the style of each district.
const STYLE = {
  city: { w: [16, 28], d: [18, 30], setback: 0.4, gap: [0, 1.5], roofs: ['#5d6670', '#6f7780', '#4b545e', '#7d8590', '#3e4a59', '#56738f', '#8a7f72'], kind: 'flat' },
  suburb: { w: [5.8, 8], d: [8.5, 10], setback: 4.5, gap: [0, 0.4], roofs: ['#7d3b2f', '#8c4a36', '#6e3428', '#5d5f63', '#9a5a40', '#6b4a3a'], kind: 'pitched', breakP: 0.1 },
  village: { w: [8, 12], d: [7.5, 9.5], setback: 2.5, gap: [3, 7], roofs: ['#b89b5e', '#5d5f63', '#a58f6e', '#7d3b2f', '#c2a56b'], kind: 'pitched' },
};
const PARK = { x0: 760, y0: 630, x1: 900, y1: 760 };
const railYAt = (x) => { const p = world.rail.pts; for (let k = 0; k < p.length - 1; k++) if (x <= p[k + 1][0]) { const t = (x - p[k][0]) / (p[k + 1][0] - p[k][0]); return p[k][1] + (p[k + 1][1] - p[k][1]) * t; } return p[p.length - 1][1]; };

function buildingFits(h, district) {
  const c = Math.cos(h.ang), s = Math.sin(h.ang);
  for (const u of [-0.5, 0, 0.5]) for (const v of [-0.5, 0, 0.5]) {
    const lx = u * (h.w + 1.5), ly = v * (h.h + 1.5);
    const x = h.x + lx * c - ly * s, y = h.y + lx * s + ly * c;
    if (surfaceAt(x, y) !== 'grass' || nodeAt(x, y, PAVE + 2) || buildingAt(x, y, 0.5)) return false;
    if (districtAt(x, y) !== district) return false;
    if (x > PARK.x0 && x < PARK.x1 && y > PARK.y0 && y < PARK.y1) return false;
    if (Math.abs(y - railYAt(x)) < 14) return false;
  }
  return true;
}
function placeBuilding(h) {
  world.buildings.push(h);
  const m = Math.hypot(h.w, h.h) / 2;
  gadd(h.x - m, h.y - m, h.x + m, h.y + m, { t: 'b', h });
}

function buildScenery() {
  const R = rng(4242);
  const pick = (arr) => arr[(R() * arr.length) | 0];
  const range = (r) => r[0] + R() * (r[1] - r[0]);
  // Landmarks first so the terraces fit round them.
  const landmark = (x, y, ang, w, h, roof, label, kind = 'pitched') => placeBuilding({ x, y, ang, w, h, roof, label, kind, district: districtAt(x, y) });
  landmark(560, 300, 0, 46, 22, '#8a8f99', 'SCHOOL', 'flat');
  landmark(958, 1402, 0, 28, 12, '#6d6a63', '✝ CHURCH');
  landmark(840, 1306, 0, 16, 10, '#5b4a3a', 'RED LION');
  landmark(1300, 455, 0, 34, 30, '#3e4a59', 'STATION', 'flat');

  // Fields fill the countryside; hedges run between them.
  const greens = ['#7fa457', '#8bb060', '#9bb86a', '#c9b56a', '#86a95a', '#a7b866'];
  for (let x = 0; x < world.W; x += 95) for (let y = 860; y < world.H; y += 85) {
    const cx = x + 47, cy = y + 42;
    if (districtAt(cx, cy) !== 'rural') continue;
    world.fields.push({ x0: x + 2, y0: y + 2, x1: x + 93, y1: y + 83, color: pick(greens), rows: R() < 0.4, ang: R() < 0.5 });
  }

  // Frontages along every town street.
  for (const e of world.edges) {
    for (const side of [1, -1]) {
      let s = 6;
      while (s < e.len - 6) {
        const mid = pointAt(e, s, side * (e.W / 2 + PAVE + 6));
        const d = districtAt(mid.x, mid.y), st = STYLE[d];
        if (!st || !e.pave) { s += 8; continue; }
        const w = range(st.w), depth = range(st.d);
        const p = pointAt(e, s + w / 2, side * (e.W / 2 + PAVE + st.setback + depth / 2));
        const h = { x: p.x, y: p.y, ang: p.ang, w, h: depth, roof: pick(st.roofs), kind: st.kind, district: d, side };
        if (st.kind === 'flat') h.height = 6 + R() * 10;
        if (buildingFits(h, d)) { placeBuilding(h); s += w + range(st.gap) + (st.breakP && R() < st.breakP ? 5 : 0); }
        else s += 3;
      }
    }
    // Farms along country roads.
    if (e.kind === 'rural') for (let s = 120; s < e.len - 80; s += 260) {
      if (R() < 0.45) continue;
      const side = R() < 0.5 ? 1 : -1;
      const p = pointAt(e, s, side * (e.W / 2 + 26));
      const house = { x: p.x, y: p.y, ang: p.ang, w: 12, h: 9, roof: '#6b4a3a', kind: 'pitched', district: 'rural' };
      const q = pointAt(e, s + 22, side * (e.W / 2 + 32));
      const barn = { x: q.x, y: q.y, ang: p.ang, w: 22, h: 14, roof: pick(['#8a3b2c', '#6b6f72', '#4f6b55']), kind: 'flat', height: 4, district: 'rural' };
      for (const b of [house, barn]) if (buildingFits(b, 'rural')) placeBuilding(b);
    }
  }

  // Trees: gardens, a park, hedgerows, street trees on Kingsway, and a wood.
  const tryTree = (x, y, r) => { if (surfaceAt(x, y) === 'grass' && !buildingAt(x, y, r * 0.6) && !nodeAt(x, y, PAVE + 3) && Math.abs(y - railYAt(x)) > 8) world.trees.push({ x, y, r }); };
  for (let k = 0; k < 900; k++) { const x = 160 + R() * 780, y = 160 + R() * 640; tryTree(x, y, 2 + R() * 2.4); }
  for (let k = 0; k < 60; k++) tryTree(PARK.x0 + 6 + R() * (PARK.x1 - PARK.x0 - 12), PARK.y0 + 6 + R() * (PARK.y1 - PARK.y0 - 12), 3 + R() * 2.5);
  for (let k = 0; k < 140; k++) { const a = R() * TAU, d = Math.sqrt(R()) * 230; tryTree(900 + Math.cos(a) * d, 1390 + Math.sin(a) * d, 2.5 + R() * 2.5); }
  for (let k = 0; k < 420; k++) tryTree(1560 + R() * 520, 1230 + R() * 350, 3 + R() * 3);
  for (let k = 0; k < 180; k++) tryTree(R() * 160, 840 + R() * 740, 3 + R() * 3);
  for (const e of world.edges) {
    if (e.hedge) for (let s = 20; s < e.len - 20; s += 28) if (R() < 0.4) { const p = pointAt(e, s, (R() < 0.5 ? 1 : -1) * (e.W / 2 + 4)); tryTree(p.x, p.y, 2.5 + R() * 2.5); }
    if (e.busF) for (let s = 20; s < e.len - 20; s += 24) for (const side of [1, -1]) { const p = pointAt(e, s, side * (e.W / 2 + PAVE - 0.8)); world.trees.push({ x: p.x, y: p.y, r: 1.8, street: true }); }
  }
  buildSigns();
}

function buildSigns() {
  const add = (kind, x, y, o = {}) => world.signs.push({ kind, x, y, ...o });
  const kerbSign = (e, s, dir, kind, o = {}, off = 1.5) => { const p = pointAt(e, s, dir * (e.W / 2 + off)); add(kind, p.x, p.y, o); };
  for (const e of world.edges) for (const dir of [1, -1]) {
    if (!lanesOf(e, dir)) continue;
    const from = dir > 0 ? e.a : e.b, s0 = dir > 0 ? from.r + 10 : e.len - from.r - 10;
    const otherLimits = from.arms.filter(a => a.e !== e).map(a => a.e.limit);
    const nsl = e.limit >= 60;
    if (e.len > 70 && (from.type === 'gateway' || otherLimits.some(l => l !== e.limit) || e.limit === 20))
      kerbSign(e, s0, dir, 'limit', { limit: e.limit, nsl });
    if (from.type === 'gateway' && e.limit === 30) kerbSign(e, s0 + dir * 4, dir, 'village', { text: 'LITTLE MARDON' }, 2.8);
    if (e.lanesB === 0) kerbSign(e, s0 + dir * 6, dir, 'oneway', {}, 1.5);
    if ((dir > 0 ? e.busF : e.busB)) kerbSign(e, s0 + dir * 14, dir, 'bus', {}, 1.5);
    if (e.kind === 'single') kerbSign(e, s0 + dir * 14, dir, 'single', {}, 1.5);
    if (e.humps.length) kerbSign(e, s0 + dir * 18, dir, 'hump', {}, 1.5);
    if (e.limit === 20 && e.district === 'suburb') kerbSign(e, s0 + dir * 24, dir, 'school', {}, 1.5);
    // Warnings before the junction this road leads to.
    const to = dir > 0 ? e.b : e.a, sEnd = dir > 0 ? e.len - to.r : to.r;
    if (to.type === 'rb' && e.len > 150) kerbSign(e, sEnd - dir * 70, dir, 'rbwarn', {}, 1.5);
  }
  // One-way streets: No Entry at the far end, facing anyone who would enter the wrong way.
  for (const e of world.edges) if (e.lanesB === 0) for (const side of [1, -1]) {
    const p = pointAt(e, e.len - e.b.r - 2, side * (e.W / 2 + 1.3)); add('noentry', p.x, p.y);
  }
  for (const n of world.nodes) for (const arm of n.arms) {
    if (!canEnter(arm)) continue;
    const d = dirIn(arm), s = sFrom(arm, n.r + 3);
    const minor = (n.type === 'give' && !arm.major) || n.type === 'stop' || n.type === 'rb' || n.type === 'mini';
    if (minor) kerbSign(arm.e, s, d, n.type === 'stop' && !arm.major ? 'stop' : n.type === 'mini' ? 'mini' : 'giveway', {}, 1.6);
  }
  for (const lx of world.levelX) for (const dir of [1, -1]) kerbSign(lx.e, lx.s - dir * 60, dir, 'lxwarn', {}, 1.5);
  for (const e of world.edges) for (const bay of e.bays) { const p = pointAt(e, bay.s, bay.side * (e.W / 2 + 3.4)); add('passing', p.x, p.y); }
  for (const o of world.obstacles) {
    kerbSign(o.e, o.s - 22, 1, 'yieldOncoming', {}, 1.5);
    kerbSign(o.e, o.s + 22, -1, 'priority', {}, 1.5);
  }
  // Chevrons on the outside of sharp country bends.
  for (const e of world.edges) {
    if (e.kind !== 'rural' && e.kind !== 'single') continue;
    for (let s = 40; s < e.len - 40; s += 15) {
      const t = angDiff(pointAt(e, s + 15).ang, pointAt(e, s - 15).ang);
      if (Math.abs(t) > 0.42) { kerbSign(e, s, t > 0 ? 1 : -1, 'chevron', { ang: pointAt(e, s).ang, right: t > 0 }, 2.5); s += 25; }
    }
  }
}
