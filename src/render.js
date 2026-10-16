// Renderer, part 1: the static world. Geometry is turned into Path2D objects once, then stroked each frame.
const COL = {
  grass: '#7da35a', lawn: '#8fb46a', city: '#b3afa5', village: '#88ad62', pave: '#c9c6bd', kerb: '#e9e6dc',
  road: '#45484d', rural: '#4f5257', dual: '#4a4d52', line: '#f4f4ef', yellow: '#f2c230', hedge: '#4d6e33',
  water: '#5d8fb5', island: '#6f9a4f', bus: '#9c3b34', asl: '#3f8f4f',
};
const skids = [];
const R2D = { edges: [], nodes: [] };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function offsetPath(e, lat, s0, s1, step = 4) {
  const p = new Path2D();
  if (s1 <= s0) return p;
  let first = true;
  for (let s = s0; ; s = Math.min(s1, s + step)) {
    const q = pointAt(e, s, typeof lat === 'function' ? lat(s) : lat);
    first ? p.moveTo(q.x, q.y) : p.lineTo(q.x, q.y); first = false;
    if (s >= s1) break;
  }
  return p;
}
function zigzag(e, lat, s0, s1) {
  const p = new Path2D();
  let k = 0;
  for (let s = s0; s <= s1; s += 1, k++) { const q = pointAt(e, s, lat + (k % 2 ? 0.3 : -0.3)); k ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y); }
  return p;
}

function prepareRender() {
  for (const e of world.edges) {
    const r = { e, marks: [], texts: [], arrows: [] };
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of e.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const m = e.W / 2 + PAVE + 6;
    r.bbox = [x0 - m, y0 - m, x1 + m, y1 + m];
    r.centre = offsetPath(e, 0, 0, e.len);
    const s0 = e.a.r + 1.5, s1 = e.len - e.b.r - 1.5;
    const cxs = world.crossings.filter(c => c.e === e);
    const gaps = cxs.map(c => [c.s - 3, c.s + 3]).concat(world.levelX.filter(l => l.e === e).map(l => [l.s - 8, l.s + 8]));
    const segs = (a, b) => {                       // [a,b] minus crossings
      let out = [[a, b]];
      for (const [g0, g1] of gaps) out = out.flatMap(([u, v]) => g1 < u || g0 > v ? [[u, v]] : [[u, g0], [g1, v]].filter(([p, q]) => q - p > 1));
      return out;
    };
    const add = (lat, dash, width = 0.15, color = COL.line, a = s0, b = s1) => { for (const [u, v] of segs(a, b)) r.marks.push({ p: offsetPath(e, lat, u, v), dash, width, color }); };
    if (e.kind !== 'single') {
      if (e.median) { add(e.div + e.median / 2 + 0.2, null); add(e.div - e.median / 2 - 0.2, null); }
      else if (e.lanesF && e.lanesB) {
        // Centre line: long "hazard" dashes near junctions, short dashes elsewhere.
        const near = 30, hz = [6, 2], norm = e.kind === 'rural' ? [4, 8] : [3, 6];
        add(e.div, hz, 0.16, COL.line, s0, Math.min(s1, s0 + near));
        if (s1 - s0 > 2 * near) add(e.div, norm, 0.15, COL.line, s0 + near, s1 - near);
        add(e.div, hz, 0.16, COL.line, Math.max(s0, s1 - near), s1);
      }
      for (const dir of [1, -1]) for (let i = 0; i < lanesOf(e, dir) - 1; i++) {
        const lat = (laneLat(e, dir, i) + laneLat(e, dir, i + 1)) / 2;
        add(lat, isBusLane(e, dir, i) ? null : [3, 6], isBusLane(e, dir, i) ? 0.3 : 0.15);
      }
      if (e.kind === 'rural' || e.kind === 'dual' || e.kind === 'link') { add(e.W / 2 - 0.35, null, 0.12); add(-e.W / 2 + 0.35, null, 0.12); }
    }
    // Bus lanes: red surface and words.
    for (const dir of [1, -1]) if (lanesOf(e, dir) > 1 && isBusLane(e, dir, 0)) {
      r.bus = r.bus || [];
      r.bus.push(offsetPath(e, laneLat(e, dir, 0), s0 + 6, s1 - 18));
      for (let s = s0 + 20; s < s1 - 30; s += 55) { const q = pointAt(e, dir > 0 ? s : e.len - s, laneLat(e, dir, 0)); r.texts.push({ x: q.x, y: q.y, ang: (dir > 0 ? q.ang : q.ang + Math.PI) + Math.PI / 2, text: 'BUS LANE' }); }
    }
    // Zigzags and give-way dashes at crossings.
    for (const c of cxs) {
      for (const sg of [-1, 1]) {
        for (const lat of [-e.W / 2 + 0.5, e.div, e.W / 2 - 0.5]) r.marks.push({ p: zigzag(e, lat, Math.min(c.s + sg * 3.6, c.s + sg * 14), Math.max(c.s + sg * 3.6, c.s + sg * 14)), dash: null, width: 0.15, color: COL.line });
        const a = pointAt(e, c.s + sg * 2.6, -e.W / 2), b = pointAt(e, c.s + sg * 2.6, e.W / 2);
        const p = new Path2D(); p.moveTo(a.x, a.y); p.lineTo(b.x, b.y);
        r.marks.push({ p, dash: c.kind === 'zebra' ? [0.6, 0.4] : null, width: c.kind === 'zebra' ? 0.2 : 0.3, color: COL.line });
      }
    }
    // Lane arrows before multi-lane junctions.
    for (const dir of [1, -1]) {
      const L = lanesOf(e, dir), to = dir > 0 ? e.b : e.a;
      if (L < 2 || to.type === 'bend' || to.type === 'gateway') continue;
      const s = dir > 0 ? e.len - to.r - 14 : to.r + 14;
      if ((dir > 0 ? s - e.a.r : e.len - e.b.r - s) < 20) continue;
      for (let i = 0; i < L; i++) {
        if (isBusLane(e, dir, i)) continue;
        const q = pointAt(e, s, laneLat(e, dir, i));
        const kind = i === 0 ? 'leftAhead' : i === L - 1 ? (to.type === 'rb' ? 'right' : 'aheadRight') : 'ahead';
        r.arrows.push({ x: q.x, y: q.y, ang: dir > 0 ? q.ang : q.ang + Math.PI, kind });
      }
    }
    if (e.hedge) r.hedge = [offsetPath(e, e.W / 2 + 1.6, 0, e.len, 6), offsetPath(e, -e.W / 2 - 1.6, 0, e.len, 6)];
    r.humps = e.humps.map(s => ({ s, q: pointAt(e, s) }));
    R2D.edges.push(r);
  }
  for (const n of world.nodes) R2D.nodes.push({ n, marks: nodeMarks(n) });
  const rp = new Path2D(); world.rail.pts.forEach(([x, y], i) => i ? rp.lineTo(x, y) : rp.moveTo(x, y));
  R2D.rail = rp;
  R2D.railL = new Path2D(); R2D.railR = new Path2D();
  for (let k = 0; k < world.rail.pts.length; k++) {
    const q = railPoint(world.rail.cum[k]), nx = Math.sin(q.ang) * 0.72, ny = -Math.cos(q.ang) * 0.72;
    k ? (R2D.railL.lineTo(q.x + nx, q.y + ny), R2D.railR.lineTo(q.x - nx, q.y - ny)) : (R2D.railL.moveTo(q.x + nx, q.y + ny), R2D.railR.moveTo(q.x - nx, q.y - ny));
  }
}

// Stop lines, give-way lines, box junctions and cyclist boxes at a junction.
function nodeMarks(n) {
  const out = [];
  const across = (arm, d, width, dash, color = COL.line) => {
    const e = arm.e, dir = dirIn(arm), s = sFrom(arm, d);
    const lo = dir > 0 ? e.div : -e.W / 2, hi = dir > 0 ? e.W / 2 : e.div;
    const a = pointAt(e, s, lo + (dir > 0 && e.median ? e.median / 2 : 0)), b = pointAt(e, s, hi - (dir < 0 && e.median ? e.median / 2 : 0));
    const p = new Path2D(); p.moveTo(a.x, a.y); p.lineTo(b.x, b.y);
    out.push({ p, width, dash, color });
  };
  for (const arm of n.arms) {
    if (!canEnter(arm)) continue;
    if (n.type === 'lights' || (n.type === 'rb' && n.signals)) {
      across(arm, n.r + 0.8, 0.35, null);
      if (n.asl) { across(arm, n.r + 5.8, 0.35, null); out.push({ asl: true, arm, n }); }
    }
    if (n.type === 'rb' || n.type === 'mini' || (n.type === 'give' && !arm.major)) { across(arm, n.r + 0.4, 0.22, [0.6, 0.45]); across(arm, n.r + 1.0, 0.22, [0.6, 0.45]); }
    if (n.type === 'stop' && !arm.major) { across(arm, n.r + 0.6, 0.45, null); out.push({ stopText: true, arm, n }); }
  }
  return out;
}

function drawWorld(ctx, time, view) {
  const vis = (b) => b[2] > view.x0 && b[0] < view.x1 && b[3] > view.y0 && b[1] < view.y1;
  // Ground by district.
  ctx.fillStyle = COL.lawn; ctx.fillRect(0, 0, 1010, 870);
  ctx.fillStyle = COL.city; ctx.fillRect(1090, 0, world.W - 1090, 660);
  ctx.fillStyle = COL.village; ctx.beginPath(); ctx.arc(900, 1390, 240, 0, TAU); ctx.fill();
  for (const f of world.fields) {
    if (!vis([f.x0, f.y0, f.x1, f.y1])) continue;
    ctx.fillStyle = COL.hedge; ctx.fillRect(f.x0 - 2, f.y0 - 2, f.x1 - f.x0 + 4, f.y1 - f.y0 + 4);
    ctx.fillStyle = f.color; ctx.fillRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
    if (f.rows) { ctx.strokeStyle = 'rgba(60,70,20,.16)'; ctx.lineWidth = 0.8; ctx.beginPath();
      if (f.ang) for (let x = f.x0 + 3; x < f.x1; x += 4) { ctx.moveTo(x, f.y0); ctx.lineTo(x, f.y1); } else for (let y = f.y0 + 3; y < f.y1; y += 4) { ctx.moveTo(f.x0, y); ctx.lineTo(f.x1, y); }
      ctx.stroke(); }
  }
  ctx.fillStyle = '#86b35e'; ctx.fillRect(PARK.x0, PARK.y0, PARK.x1 - PARK.x0, PARK.y1 - PARK.y0);
  ctx.fillStyle = COL.water; ctx.beginPath(); ctx.ellipse((PARK.x0 + PARK.x1) / 2, (PARK.y0 + PARK.y1) / 2, 30, 18, 0.3, 0, TAU); ctx.fill();
  // Railway.
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#8d8173'; ctx.lineWidth = 4.2; ctx.stroke(R2D.rail);
  ctx.strokeStyle = '#5a4636'; ctx.lineWidth = 2.6; ctx.setLineDash([0.35, 0.65]); ctx.stroke(R2D.rail); ctx.setLineDash([]);
  ctx.strokeStyle = '#a7adb3'; ctx.lineWidth = 0.18; ctx.stroke(R2D.railL); ctx.stroke(R2D.railR);
  // Hedges, pavements, kerbs, carriageways.
  const E = R2D.edges.filter(r => vis(r.bbox));
  ctx.lineCap = 'round';
  ctx.strokeStyle = COL.hedge;
  for (const r of E) if (r.hedge) { ctx.lineWidth = 1.8; ctx.stroke(r.hedge[0]); ctx.stroke(r.hedge[1]); }
  const N = R2D.nodes.filter(x => x.n.x > view.x0 - 40 && x.n.x < view.x1 + 40 && x.n.y > view.y0 - 40 && x.n.y < view.y1 + 40);
  ctx.strokeStyle = COL.pave; ctx.fillStyle = COL.pave;
  for (const r of E) if (r.e.pave) { ctx.lineWidth = r.e.W + 2 * PAVE; ctx.stroke(r.centre); }
  for (const { n } of N) if (n.pave && n.arms.some(a => a.e.pave)) { ctx.beginPath(); ctx.arc(n.x, n.y, (n.type === 'rb' ? n.ringR : n.r) + PAVE, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = COL.kerb; ctx.fillStyle = COL.kerb;
  for (const r of E) if (r.e.pave) { ctx.lineWidth = r.e.W + 0.7; ctx.stroke(r.centre); }
  for (const r of E) for (const bay of r.e.bays) { const q = pointAt(r.e, bay.s, bay.side * (r.e.W / 2 + 1)); ctx.fillStyle = COL.rural; ctx.beginPath(); ctx.ellipse(q.x, q.y, 12, 2.6, q.ang, 0, TAU); ctx.fill(); }
  for (const r of E) { ctx.strokeStyle = r.e.kind === 'rural' || r.e.kind === 'single' ? COL.rural : r.e.kind === 'dual' ? COL.dual : COL.road; ctx.lineWidth = r.e.W; ctx.stroke(r.centre); }
  for (const { n } of N) {
    if (n.type === 'bend' || n.type === 'gateway') continue;
    ctx.fillStyle = COL.kerb; ctx.beginPath(); ctx.arc(n.x, n.y, (n.type === 'rb' ? n.ringR : n.r) + 0.35, 0, TAU); if (n.pave && (n.type === 'rb' || n.arms.some(a => a.e.pave))) ctx.fill();
    ctx.fillStyle = COL.road; ctx.beginPath(); ctx.arc(n.x, n.y, n.type === 'rb' ? n.ringR : n.r, 0, TAU); ctx.fill();
  }
  // Repaint arm mouths over the kerb ring so roads run into junctions cleanly.
  ctx.lineCap = 'butt';
  for (const { n } of N) for (const arm of n.arms) {
    if (n.type === 'bend' || n.type === 'gateway') continue;
    const R0 = (n.type === 'rb' ? n.ringR : n.r) - 2, a = pointAt(arm.e, sFrom(arm, Math.max(0, R0))), b = pointAt(arm.e, sFrom(arm, R0 + 5));
    ctx.strokeStyle = arm.e.kind === 'rural' || arm.e.kind === 'single' ? COL.rural : arm.e.kind === 'dual' ? COL.dual : COL.road;
    ctx.lineWidth = arm.e.W; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // Central reservations.
  for (const r of E) if (r.e.median) {
    const e = r.e, s0 = e.a.r + 2, s1 = e.len - e.b.r - 2;
    const med = offsetPath(e, e.div, s0, s1, 6);
    ctx.strokeStyle = COL.kerb; ctx.lineWidth = e.median; ctx.stroke(med);
    ctx.strokeStyle = '#6f9a4f'; ctx.lineWidth = e.median - 0.6; ctx.stroke(med);
    ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 0.25; ctx.stroke(med);
  }
  // Surfaces and markings.
  ctx.lineCap = 'butt';
  for (const r of E) if (r.bus) { ctx.strokeStyle = COL.bus; ctx.lineWidth = r.e.laneW - 0.3; for (const p of r.bus) ctx.stroke(p); }
  for (const r of E) for (const m of r.marks) { ctx.strokeStyle = m.color; ctx.lineWidth = m.width; ctx.setLineDash(m.dash || []); ctx.stroke(m.p); }
  ctx.setLineDash([]);
  for (const r of E) {
    for (const c of world.crossings) if (c.e === r.e) drawCrossingStripes(ctx, c);
    for (const h of r.humps) { ctx.save(); ctx.translate(h.q.x, h.q.y); ctx.rotate(h.q.ang); ctx.fillStyle = 'rgba(255,255,255,.8)';
      for (let l = -r.e.W / 2 + 0.6; l < r.e.W / 2 - 0.6; l += 1.6) { ctx.beginPath(); ctx.moveTo(-0.9, l); ctx.lineTo(0.9, l + 0.5); ctx.lineTo(-0.9, l + 1); ctx.fill(); }
      ctx.restore(); }
    for (const a of r.arrows) drawArrow(ctx, a);
    ctx.fillStyle = 'rgba(244,244,239,.9)'; ctx.font = '700 1.1px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of r.texts) { ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang); ctx.fillText(t.text, 0, 0); ctx.restore(); }
  }
  for (const { n, marks } of N) drawJunction(ctx, n, marks, time);
  for (const lx of world.levelX) if (lx.x > view.x0 && lx.x < view.x1 && lx.y > view.y0 && lx.y < view.y1) drawLevelCrossing(ctx, lx, time);
  ctx.lineCap = 'round';
  for (const s of skids) { ctx.strokeStyle = `rgba(20,20,20,${s.a * 0.5})`; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke(); }
}

function drawCrossingStripes(ctx, c) {
  const e = c.e;
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.ang);
  if (c.kind === 'zebra') { ctx.fillStyle = COL.line; for (let l = -e.W / 2 + 0.3; l < e.W / 2 - 0.3; l += 1.2) ctx.fillRect(-1.5, l, 3, 0.6); }
  else { ctx.strokeStyle = COL.line; ctx.lineWidth = 0.15; ctx.setLineDash([0.5, 0.5]); for (const x of [-1.6, 1.6]) { ctx.beginPath(); ctx.moveTo(x, -e.W / 2); ctx.lineTo(x, e.W / 2); ctx.stroke(); } ctx.setLineDash([]); }
  ctx.restore();
}
function drawArrow(ctx, a) {
  // Local frame: +x is the direction of travel, -y is the driver's left.
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.ang); ctx.fillStyle = 'rgba(244,244,239,.85)';
  const head = (x, y, rot) => { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); ctx.moveTo(1.2, 0); ctx.lineTo(0, -0.6); ctx.lineTo(0, 0.6); ctx.fill(); ctx.restore(); };
  ctx.fillRect(-3, -0.15, 2.6, 0.3);
  if (a.kind !== 'right') { ctx.fillRect(-0.5, -0.15, 0.8, 0.3); head(0.3, 0, 0); }
  if (a.kind === 'leftAhead') { ctx.fillRect(-0.85, -1.4, 0.3, 1.4); head(-0.7, -1.4, -Math.PI / 2); }
  if (a.kind === 'aheadRight' || a.kind === 'right') { ctx.fillRect(-0.85, 0, 0.3, 1.4); head(-0.7, 1.4, Math.PI / 2); }
  ctx.restore();
}

function drawJunction(ctx, n, marks, time) {
  if (n.type === 'rb') {
    ctx.fillStyle = COL.kerb; ctx.beginPath(); ctx.arc(n.x, n.y, n.islandR + 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = COL.island; ctx.beginPath(); ctx.arc(n.x, n.y, n.islandR, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e3c34a'; for (let k = 0; k < 8; k++) { const a = k * 0.8; ctx.beginPath(); ctx.arc(n.x + Math.cos(a) * n.islandR * 0.5, n.y + Math.sin(a) * n.islandR * 0.5, 0.7, 0, TAU); ctx.fill(); }
    if (n.ringLanes > 1) { ctx.strokeStyle = COL.line; ctx.lineWidth = 0.15; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(n.x, n.y, n.ringR - LANE_W, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = 'rgba(244,244,239,.85)';
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + 0.4, r = n.ringR - LANE_W * 0.55;
      ctx.save(); ctx.translate(n.x + Math.cos(a) * r, n.y + Math.sin(a) * r); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(1.6, 0); ctx.lineTo(-0.2, -1); ctx.lineTo(-0.2, -0.35); ctx.lineTo(-1.6, -0.35); ctx.lineTo(-1.6, 0.35); ctx.lineTo(-0.2, 0.35); ctx.lineTo(-0.2, 1); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  if (n.type === 'mini') {
    ctx.fillStyle = '#f4f4ef'; ctx.beginPath(); ctx.arc(n.x, n.y, n.islandR, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d8d8d2'; ctx.beginPath(); ctx.arc(n.x - 0.3, n.y - 0.3, n.islandR * 0.6, 0, TAU); ctx.fill();
  }
  if (n.box) {
    ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(n.arms[0].ang);
    const h = n.r * 0.92; ctx.strokeStyle = COL.yellow; ctx.lineWidth = 0.2;
    ctx.strokeRect(-h, -h, 2 * h, 2 * h);
    ctx.restore();
    ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(n.arms[0].ang); ctx.beginPath(); ctx.rect(-h, -h, 2 * h, 2 * h); ctx.clip();
    ctx.strokeStyle = COL.yellow; ctx.lineWidth = 0.2; ctx.beginPath();
    for (let k = -2 * h; k <= 2 * h; k += 2.4) { ctx.moveTo(k - h, -h); ctx.lineTo(k + h, h); ctx.moveTo(k + h, -h); ctx.lineTo(k - h, h); }
    ctx.stroke(); ctx.restore();
  }
  for (const m of marks) {
    if (m.p) { ctx.strokeStyle = m.color; ctx.lineWidth = m.width; ctx.setLineDash(m.dash || []); ctx.stroke(m.p); ctx.setLineDash([]); continue; }
    const e = m.arm.e, dir = dirIn(m.arm);
    if (m.asl) {
      const q = pointAt(e, sFrom(m.arm, n.r + 3.3), dir > 0 ? (e.div + e.W / 2) / 2 : (e.div - e.W / 2) / 2);
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(dir > 0 ? q.ang : q.ang + Math.PI);
      ctx.fillStyle = 'rgba(63,143,79,.55)'; const w = (dir > 0 ? e.W / 2 - e.div : e.W / 2 + e.div) - 0.2; ctx.fillRect(-2.4, -w / 2, 4.8, w);
      ctx.strokeStyle = COL.line; ctx.lineWidth = 0.14; for (const x of [-0.8, 0.8]) { ctx.beginPath(); ctx.arc(x, 0, 0.55, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    if (m.stopText) {
      const q = pointAt(e, sFrom(m.arm, n.r + 4), laneLat(e, dir, 0));
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate((dir > 0 ? q.ang : q.ang + Math.PI) + Math.PI / 2);
      ctx.fillStyle = COL.line; ctx.font = '700 1.5px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('STOP', 0, 0); ctx.restore();
    }
  }
}

function drawLevelCrossing(ctx, lx, time) {
  const e = lx.e;
  ctx.save(); ctx.translate(lx.x, lx.y); ctx.rotate(lx.ang);
  ctx.strokeStyle = '#a7adb3'; ctx.lineWidth = 0.18;
  const ra = railPoint(lx.sr).ang - lx.ang, dx = Math.cos(ra), dy = Math.sin(ra), L = e.W * 0.75;
  for (const o of [-0.72, 0.72]) { const bx = -dy * o, by = dx * o; ctx.beginPath(); ctx.moveTo(bx - dx * L, by - dy * L); ctx.lineTo(bx + dx * L, by + dy * L); ctx.stroke(); }
  ctx.strokeStyle = COL.line; ctx.lineWidth = 0.3;
  for (const x of [-7.6, 7.6]) { ctx.beginPath(); ctx.moveTo(x, -e.W / 2); ctx.lineTo(x, e.W / 2); ctx.stroke(); }
  // Half barriers on the approach side of each lane, striped red and white.
  for (const [x, side] of [[-7, 1], [7, -1]]) {
    const L = e.W / 2 * lx.barrier;
    ctx.lineWidth = 0.35;
    for (let k = 0; k < 6; k++) { ctx.strokeStyle = k % 2 ? '#d4202a' : '#fff'; ctx.beginPath(); ctx.moveTo(x, side * (e.W / 2 + 0.6 - k * L / 6)); ctx.lineTo(x, side * (e.W / 2 + 0.6 - (k + 1) * L / 6)); ctx.stroke(); }
  }
  ctx.restore();
}
