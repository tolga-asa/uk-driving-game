// Top-down renderer. Signs and signal heads are drawn upright on screen so they stay readable
// when the camera turns with the car.
const COL = {
  grass: '#7da35a', garden: '#8fb46a', pave: '#c9c6bd', kerb: '#e9e6dc', road: '#45484d', ring: '#4d5055',
  line: '#f4f4ef', yellow: '#f2c230', hedge: '#4d6e33', water: '#5d8fb5', island: '#6f9a4f',
};
const skids = [];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawWorld(ctx, cam, time, view) {
  const vis = (x0, y0, x1, y1) => x1 > view.x0 && x0 < view.x1 && y1 > view.y0 && y0 < view.y1;
  // Countryside.
  for (const f of world.fields) {
    if (!vis(f.x0 - 3, f.y0 - 3, f.x1 + 3, f.y1 + 3)) continue;
    ctx.fillStyle = COL.hedge; ctx.fillRect(f.x0 - 2.5, f.y0 - 2.5, f.x1 - f.x0 + 5, f.y1 - f.y0 + 5);
    ctx.fillStyle = f.color; ctx.fillRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
    if (f.rows) { ctx.strokeStyle = 'rgba(60,70,20,.18)'; ctx.lineWidth = 0.8; ctx.beginPath();
      for (let x = f.x0 + 3; x < f.x1; x += 4) { ctx.moveTo(x, f.y0); ctx.lineTo(x, f.y1); } ctx.stroke(); }
  }
  // Town blocks: pavement ring with a kerb, gardens inside.
  for (const b of world.blocks) {
    if (!b.town || !vis(b.x0, b.y0, b.x1, b.y1)) continue;
    ctx.fillStyle = COL.kerb; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    ctx.fillStyle = COL.pave; ctx.fillRect(b.x0 + 0.3, b.y0 + 0.3, b.x1 - b.x0 - 0.6, b.y1 - b.y0 - 0.6);
    ctx.fillStyle = b.kind === 'park' ? '#86b35e' : COL.garden;
    ctx.fillRect(b.x0 + PAVE, b.y0 + PAVE, b.x1 - b.x0 - 2 * PAVE, b.y1 - b.y0 - 2 * PAVE);
    if (b.pond) { ctx.fillStyle = COL.water; ctx.beginPath(); ctx.ellipse(b.pond.x, b.pond.y, b.pond.rx, b.pond.ry, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d8cfb0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(b.pond.x, b.pond.y, b.pond.rx + 5, b.pond.ry + 5, 0, 0, 7); ctx.stroke(); }
    if (b.pitch) { const p = b.pitch; ctx.fillStyle = '#6aa84f'; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.3;
      ctx.strokeRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4); ctx.beginPath(); ctx.moveTo(p.x + p.w / 2, p.y + 2); ctx.lineTo(p.x + p.w / 2, p.y + p.h - 2); ctx.stroke(); }
  }
  // Carriageways.
  for (const e of world.edges) {
    const x0 = Math.min(e.a.x, e.b.x) - W / 2, y0 = Math.min(e.a.y, e.b.y) - W / 2, x1 = Math.max(e.a.x, e.b.x) + W / 2, y1 = Math.max(e.a.y, e.b.y) + W / 2;
    if (!vis(x0, y0, x1, y1)) continue;
    ctx.fillStyle = e.ring ? COL.ring : COL.road; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  for (const n of world.nodes) if (n.type === 'rb' && vis(n.x - 20, n.y - 20, n.x + 20, n.y + 20)) {
    ctx.fillStyle = COL.kerb; ctx.beginPath(); ctx.arc(n.x, n.y, RB_OUT + 1.2, 0, 7); ctx.fill();
    ctx.fillStyle = COL.road; ctx.beginPath(); ctx.arc(n.x, n.y, RB_OUT, 0, 7); ctx.fill();
    for (const arm of n.arms) { const d = DIRS[arm]; ctx.fillRect(n.x + d[0] * 10 - (d[1] ? W / 2 : 0), n.y + d[1] * 10 - (d[0] ? W / 2 : 0), d[0] ? d[0] * 10 : W, d[1] ? d[1] * 10 : W); }
  }
  for (const e of world.edges) drawStreetMarkings(ctx, e, view, time);
  for (const n of world.nodes) if (vis(n.x - 30, n.y - 30, n.x + 30, n.y + 30)) drawJunction(ctx, n, time);
  // Skid marks.
  ctx.lineCap = 'round';
  for (const s of skids) { ctx.strokeStyle = `rgba(20,20,20,${s.a * 0.5})`; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke(); }
}

function dashLine(ctx, x0, y0, x1, y1, on, off) { ctx.setLineDash([on, off]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); }

function drawStreetMarkings(ctx, e, view, time) {
  const d = DIRS[e.dir], o = [d[1], d[0]];
  const s0 = e.a.r + 3, s1 = SP - e.b.r - 3;
  const px = (s, lat) => [e.a.x + d[0] * s + o[0] * lat, e.a.y + d[1] * s + o[1] * lat];
  const A = px(s0, 0), B = px(s1, 0);
  if (Math.max(A[0], B[0]) < view.x0 - 10 || Math.min(A[0], B[0]) > view.x1 + 10 || Math.max(A[1], B[1]) < view.y0 - 10 || Math.min(A[1], B[1]) > view.y1 + 10) return;
  ctx.strokeStyle = COL.line; ctx.lineWidth = 0.15;
  if (e.ring) { for (const lat of [-W / 2 + 0.4, W / 2 - 0.4]) { const a = px(s0 - 3, lat), b = px(s1 + 3, lat); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
  ctx.lineWidth = 0.15;
  if (e.zebra) {
    const zs = e.zebra.along;
    let a = px(s0, 0), b = px(zs - 13, 0); dashLine(ctx, a[0], a[1], b[0], b[1], 3, 6);
    a = px(zs + 13, 0); b = px(s1, 0); dashLine(ctx, a[0], a[1], b[0], b[1], 3, 6);
    drawZebra(ctx, e, px, zs, time);
  } else dashLine(ctx, A[0], A[1], B[0], B[1], 3, 6);
}

function drawZebra(ctx, e, px, zs, time) {
  ctx.fillStyle = COL.line;
  for (let lat = -W / 2 + 0.3; lat < W / 2 - 0.3; lat += 1.2) {
    const a = px(zs - 1.5, lat), b = px(zs + 1.5, lat + 0.6);
    ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  }
  // Give-way dashes and zigzags on both approaches.
  ctx.strokeStyle = COL.line; ctx.lineWidth = 0.2;
  for (const sg of [-1, 1]) {
    let a = px(zs + sg * 2.6, -W / 2), b = px(zs + sg * 2.6, W / 2); dashLine(ctx, a[0], a[1], b[0], b[1], 0.6, 0.4);
    for (const lat of [-W / 2 + 0.5, 0, W / 2 - 0.5]) {
      ctx.beginPath();
      for (let k = 0; k <= 10; k++) { const p = px(zs + sg * (3.5 + k), lat + (k % 2 ? 0.35 : -0.35)); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke();
    }
  }
  // Belisha beacons: flashing amber globes on striped poles.
  const on = Math.floor(time * 1.6 + e.zebra.flash * 2) % 2 === 0;
  for (const lat of [-W / 2 - 1.2, W / 2 + 1.2]) for (const sg of [-1, 1]) {
    const p = px(zs + sg * 1.9, lat);
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(p[0], p[1], 0.55, 0, 7); ctx.fill();
    ctx.fillStyle = on ? '#ffb000' : '#8a5a10'; ctx.beginPath(); ctx.arc(p[0], p[1], 0.42, 0, 7); ctx.fill();
    if (on) { ctx.fillStyle = 'rgba(255,190,40,.25)'; ctx.beginPath(); ctx.arc(p[0], p[1], 1.4, 0, 7); ctx.fill(); }
  }
}

function drawJunction(ctx, n, time) {
  ctx.strokeStyle = COL.line;
  if (n.type === 'rb') {
    ctx.fillStyle = COL.kerb; ctx.beginPath(); ctx.arc(n.x, n.y, RB_IN, 0, 7); ctx.fill();
    ctx.fillStyle = COL.island; ctx.beginPath(); ctx.arc(n.x, n.y, RB_IN - 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#e3c34a'; for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.3; ctx.beginPath(); ctx.arc(n.x + Math.cos(a) * 2.5, n.y + Math.sin(a) * 2.5, 0.6, 0, 7); ctx.fill(); }
    // Clockwise arrows painted on the circulating lane.
    ctx.fillStyle = 'rgba(244,244,239,.85)';
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4, r = RB_LANE;
      ctx.save(); ctx.translate(n.x + Math.cos(a) * r, n.y + Math.sin(a) * r); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(1.6, 0); ctx.lineTo(-0.2, -1); ctx.lineTo(-0.2, -0.35); ctx.lineTo(-1.6, -0.35); ctx.lineTo(-1.6, 0.35); ctx.lineTo(-0.2, 0.35); ctx.lineTo(-0.2, 1); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = 0.2;
    for (const arm of n.arms) giveWayLine(ctx, n, arm, RB_OUT + 0.4);
    return;
  }
  if (n.type === 'lights') {
    ctx.lineWidth = 0.35;
    for (const arm of n.arms) { const [a, b] = acrossIncoming(n, arm, n.r + 1.2); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  }
  if (n.type === 'give') { ctx.lineWidth = 0.2; for (const arm of n.arms) if (arm % 2 !== n.major) giveWayLine(ctx, n, arm, n.r + 0.4); }
}
function acrossIncoming(n, arm, t) {      // stop line across the lane coming in on `arm`
  const d = DIRS[arm], l = leftOf([-d[0], -d[1]]);
  return [[n.x + d[0] * t, n.y + d[1] * t], [n.x + d[0] * t + l[0] * W / 2, n.y + d[1] * t + l[1] * W / 2]];
}
function giveWayLine(ctx, n, arm, t) {
  for (const k of [0, 0.6]) { const [a, b] = acrossIncoming(n, arm, t + k); dashLine(ctx, a[0], a[1], b[0], b[1], 0.6, 0.45); }
  // Painted triangle a few metres back.
  const d = DIRS[arm], l = leftOf([-d[0], -d[1]]), c = [n.x + d[0] * (t + 6) + l[0] * LANE, n.y + d[1] * (t + 6) + l[1] * LANE];
  ctx.lineWidth = 0.25; ctx.beginPath();
  ctx.moveTo(c[0] + d[0] * 2.2, c[1] + d[1] * 2.2);   // apex points back at the approaching driver
  ctx.lineTo(c[0] - d[0] * 1.6 + l[0] * 0.9, c[1] - d[1] * 1.6 + l[1] * 0.9);
  ctx.lineTo(c[0] - d[0] * 1.6 - l[0] * 0.9, c[1] - d[1] * 1.6 - l[1] * 0.9); ctx.closePath(); ctx.stroke();
}

function drawCar(ctx, c, time) {
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.heading);
  const L = c.len, Wd = c.wid;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; roundRect(ctx, -L / 2 + 0.3, -Wd / 2 + 0.35, L, Wd, 0.5); ctx.fill();
  ctx.fillStyle = c.color; roundRect(ctx, -L / 2, -Wd / 2, L, Wd, c.kind === 'bus' ? 0.4 : 0.6); ctx.fill();
  if (c.kind === 'bus') {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-L / 2 + 0.6, -Wd / 2 + 0.4, L - 1.4, Wd - 0.8);
    ctx.fillStyle = '#d9d9d9'; for (let k = 0; k < 3; k++) ctx.fillRect(-L / 2 + 1.5 + k * 2.8, -0.5, 1.6, 1);
  } else {
    ctx.fillStyle = '#26323d';
    ctx.beginPath(); ctx.moveTo(L * 0.22, -Wd / 2 + 0.2); ctx.lineTo(L * 0.34, -Wd / 2 + 0.3); ctx.lineTo(L * 0.34, Wd / 2 - 0.3); ctx.lineTo(L * 0.22, Wd / 2 - 0.2); ctx.closePath(); ctx.fill();
    ctx.fillRect(-L * 0.38, -Wd / 2 + 0.3, L * 0.09, Wd - 0.6);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; roundRect(ctx, -L * 0.27, -Wd / 2 + 0.25, L * 0.48, Wd - 0.5, 0.35); ctx.fill();
  }
  // Lights.
  ctx.fillStyle = '#fff6c8'; ctx.fillRect(L / 2 - 0.25, -Wd / 2 + 0.15, 0.25, 0.4); ctx.fillRect(L / 2 - 0.25, Wd / 2 - 0.55, 0.25, 0.4);
  const braking = c.ai ? c.braking : c.brakeLight;
  ctx.fillStyle = braking ? '#ff2a2a' : '#7a1010'; ctx.fillRect(-L / 2, -Wd / 2 + 0.15, 0.22, 0.45); ctx.fillRect(-L / 2, Wd / 2 - 0.6, 0.22, 0.45);
  if (braking) { ctx.fillStyle = 'rgba(255,40,40,.25)'; ctx.fillRect(-L / 2 - 1, -Wd / 2, 1, Wd); }
  if (c.reversing) { ctx.fillStyle = '#fff'; ctx.fillRect(-L / 2, -0.15, 0.2, 0.3); }
  if (c.ind && Math.floor(time * 2.6) % 2 === 0) {
    const side = c.ind > 0 ? Wd / 2 : -Wd / 2;   // right-hand side of the car is +y in car space
    ctx.fillStyle = '#ffa500';
    ctx.beginPath(); ctx.arc(L / 2 - 0.25, side * 0.85, 0.32, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-L / 2 + 0.25, side * 0.85, 0.32, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,165,0,.3)'; ctx.beginPath(); ctx.arc(L / 2 - 0.25, side * 0.85, 1, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(-L / 2 + 0.25, side * 0.85, 1, 0, 7); ctx.fill();
  }
  if (!c.ai) {
    // L plates front and back, and the driver sitting on the RIGHT.
    for (const x of [L / 2 - 0.55, -L / 2 + 0.15]) {
      ctx.fillStyle = '#fff'; ctx.fillRect(x, -0.3, 0.42, 0.6);
      ctx.fillStyle = '#d0021b'; ctx.fillRect(x + 0.08, -0.2, 0.08, 0.42); ctx.fillRect(x + 0.08, 0.13, 0.26, 0.09);
    }
    ctx.fillStyle = '#f0c9a0'; ctx.beginPath(); ctx.arc(L * 0.12, Wd * 0.22, 0.28, 0, 7); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(L * 0.24, Wd * 0.22, 0.22, 0, 7); ctx.stroke();
  }
  ctx.restore();
}

function drawPed(ctx, p, time) {
  const bob = Math.sin(time * 8 + p.x) * 0.08;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(p.x + 0.15, p.y + 0.2, 0.45, 0, 7); ctx.fill();
  ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(p.x, p.y, 0.55, 0.55 + bob, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#5b3a29'; ctx.beginPath(); ctx.arc(p.x, p.y, 0.3, 0, 7); ctx.fill();
  if (p.hit > 0) { ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.arc(p.x, p.y, 1 + Math.sin(time * 12) * 0.2, 0, 7); ctx.stroke(); }
}

function drawBuildingsAndTrees(ctx, view, camRot) {
  const vis = (x0, y0, x1, y1) => x1 > view.x0 && x0 < view.x1 && y1 > view.y0 && y0 < view.y1;
  for (const h of world.buildings) {
    if (!vis(h.x, h.y, h.x + h.w, h.y + h.h)) continue;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(h.x + 1.2, h.y + 1.2, h.w, h.h);
    ctx.fillStyle = h.roof; ctx.fillRect(h.x, h.y, h.w, h.h);
    // Pitched roof: ridge along the long side, the far slope a little darker.
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    if (h.w > h.h) ctx.fillRect(h.x, h.y + h.h / 2, h.w, h.h / 2); else ctx.fillRect(h.x + h.w / 2, h.y, h.w / 2, h.h);
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 0.2; ctx.beginPath();
    if (h.w > h.h) { ctx.moveTo(h.x, h.y + h.h / 2); ctx.lineTo(h.x + h.w, h.y + h.h / 2); } else { ctx.moveTo(h.x + h.w / 2, h.y); ctx.lineTo(h.x + h.w / 2, h.y + h.h); }
    ctx.stroke();
    if (!h.shop && !h.label && h.w * h.h < 140) { ctx.fillStyle = '#7a3a2a'; ctx.fillRect(h.x + h.w * 0.25, h.y + h.h * 0.2, 0.8, 0.8); }
    if (h.label) {
      ctx.save(); ctx.translate(h.x + h.w / 2, h.y + h.h / 2); ctx.rotate(camRot);
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '600 4px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h.label, 0, 0); ctx.restore();
    }
  }
  for (const t of world.trees) {
    if (!vis(t.x - t.r, t.y - t.r, t.x + t.r, t.y + t.r)) continue;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.arc(t.x + 1, t.y + 1, t.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#3f6b2f'; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#4f8139'; ctx.beginPath(); ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, 7); ctx.fill();
  }
}

// Upright signs and signal heads (scaled up a bit beyond real life so they read on screen).
function drawSignsAndLights(ctx, view, camRot, time) {
  const inView = (x, y) => x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1;
  for (const s of world.signs) {
    if (!inView(s.x, s.y)) continue;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(camRot);
    if (s.kind === 'limit') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, 7); ctx.fill();
      if (s.limit === 60) {
        ctx.strokeStyle = '#111'; ctx.lineWidth = 0.1; ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 1.45, 0, 7); ctx.clip(); ctx.rotate(-Math.PI / 4 + Math.PI / 2);
        ctx.fillStyle = '#111'; ctx.fillRect(-2, -0.32, 4, 0.64); ctx.restore();
      } else {
        ctx.strokeStyle = '#d4202a'; ctx.lineWidth = 0.32; ctx.beginPath(); ctx.arc(0, 0, 1.32, 0, 7); ctx.stroke();
        ctx.fillStyle = '#111'; ctx.font = '700 1.45px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.limit, 0, 0.08);
      }
    } else if (s.kind === 'giveway') {
      ctx.fillStyle = '#d4202a'; ctx.beginPath(); ctx.moveTo(-1.5, -1.1); ctx.lineTo(1.5, -1.1); ctx.lineTo(0, 1.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-0.95, -0.75); ctx.lineTo(0.95, -0.75); ctx.lineTo(0, 0.85); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  for (const n of world.nodes) {
    if (n.type !== 'lights' || !inView(n.x, n.y)) continue;
    for (const arm of n.arms) {
      const d = DIRS[arm], l = leftOf([-d[0], -d[1]]), t = n.r + 1.6;
      const x = n.x + d[0] * t + l[0] * (W / 2 + 1.3), y = n.y + d[1] * t + l[1] * (W / 2 + 1.3);
      const st = lightState(n, arm % 2, time);
      ctx.save(); ctx.translate(x, y); ctx.rotate(camRot);
      ctx.fillStyle = '#151515'; roundRect(ctx, -0.65, -1.75, 1.3, 3.5, 0.3); ctx.fill();
      ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 0.1; ctx.stroke();
      const lamp = (yy, on, col, dim) => { ctx.fillStyle = on ? col : dim; ctx.beginPath(); ctx.arc(0, yy, 0.42, 0, 7); ctx.fill();
        if (on) { ctx.fillStyle = col + '44'; ctx.beginPath(); ctx.arc(0, yy, 0.9, 0, 7); ctx.fill(); } };
      lamp(-1.1, st === 'R' || st === 'RA', '#ff2d2d', '#3a1010');
      lamp(0, st === 'A' || st === 'RA', '#ffb000', '#3a2a08');
      lamp(1.1, st === 'G', '#2ee06a', '#0d2a16');
      ctx.restore();
    }
  }
}

// Minimap: static roads drawn once; the player arrow and nearby lights on top every frame.
let miniCache = null;
function drawMinimap(mctx, size, player, time) {
  const s = size / Math.max(WORLD_W, WORLD_H);
  const ox = (size - WORLD_W * s) / 2, oy = (size - WORLD_H * s) / 2;
  if (!miniCache) {
    miniCache = document.createElement('canvas'); miniCache.width = miniCache.height = size;
    const c = miniCache.getContext('2d');
    c.fillStyle = '#2f4a2a'; c.fillRect(0, 0, size, size);
    c.fillStyle = '#4b5d43'; for (const b of world.blocks) if (b.town) c.fillRect(ox + b.x0 * s, oy + b.y0 * s, (b.x1 - b.x0) * s, (b.y1 - b.y0) * s);
    for (const e of world.edges) { c.strokeStyle = e.ring ? '#e6d9a8' : '#d9d9d2'; c.lineWidth = e.ring ? 3 : 2.2;
      c.beginPath(); c.moveTo(ox + e.a.x * s, oy + e.a.y * s); c.lineTo(ox + e.b.x * s, oy + e.b.y * s); c.stroke(); }
    for (const n of world.nodes) if (n.type === 'rb') { c.fillStyle = '#d9d9d2'; c.beginPath(); c.arc(ox + n.x * s, oy + n.y * s, 4, 0, 7); c.fill(); c.fillStyle = '#4b5d43'; c.beginPath(); c.arc(ox + n.x * s, oy + n.y * s, 1.6, 0, 7); c.fill(); }
    for (const z of world.zebras) { c.fillStyle = '#ffb000'; c.fillRect(ox + z.x * s - 1.5, oy + z.y * s - 1.5, 3, 3); }
  }
  mctx.drawImage(miniCache, 0, 0);
  for (const n of world.nodes) if (n.type === 'lights') {
    const st = lightState(n, 0, time);
    mctx.fillStyle = st === 'G' ? '#2ee06a' : '#ff2d2d'; mctx.beginPath(); mctx.arc(ox + n.x * s, oy + n.y * s, 2.2, 0, 7); mctx.fill();
  }
  mctx.save(); mctx.translate(ox + player.x * s, oy + player.y * s); mctx.rotate(player.heading);
  mctx.fillStyle = '#f7d117'; mctx.strokeStyle = '#111'; mctx.lineWidth = 1;
  mctx.beginPath(); mctx.moveTo(6, 0); mctx.lineTo(-4, -4); mctx.lineTo(-2, 0); mctx.lineTo(-4, 4); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}
