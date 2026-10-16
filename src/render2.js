// Renderer, part 2: vehicles, people, buildings, signs (drawn upright on screen) and the minimap.
function drawCar(ctx, c, time) {
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.heading);
  const L = c.len, Wd = c.wid;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; roundRect(ctx, -L / 2 + 0.3, -Wd / 2 + 0.35, L, Wd, 0.5); ctx.fill();
  if (c.kind === 'tractor') {
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-L / 2, -Wd / 2 - 0.1, 1.6, 0.6); ctx.fillRect(-L / 2, Wd / 2 - 0.5, 1.6, 0.6);
    ctx.fillRect(L / 2 - 1.2, -Wd / 2 + 0.1, 0.9, 0.4); ctx.fillRect(L / 2 - 1.2, Wd / 2 - 0.5, 0.9, 0.4);
    ctx.fillStyle = c.color; roundRect(ctx, -L / 2 + 0.2, -Wd / 2 + 0.5, L - 0.4, Wd - 1, 0.3); ctx.fill();
    ctx.fillStyle = '#c9d6c2'; ctx.fillRect(-L / 2 + 0.4, -0.6, 1.4, 1.2);
    ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.arc(-L / 2 + 1.1, 0, 0.25 + 0.1 * Math.sin(time * 8), 0, TAU); ctx.fill();
    ctx.restore(); return;
  }
  ctx.fillStyle = c.color; roundRect(ctx, -L / 2, -Wd / 2, L, Wd, c.kind === 'bus' ? 0.4 : 0.6); ctx.fill();
  if (c.kind === 'bus') {
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-L / 2 + 0.6, -Wd / 2 + 0.35, L - 1.2, Wd - 0.7);
    ctx.fillStyle = '#e8e8e8'; for (let k = 0; k < 4; k++) ctx.fillRect(-L / 2 + 1.2 + k * 2.4, -0.45, 1.5, 0.9);
    ctx.fillStyle = '#26323d'; ctx.fillRect(L / 2 - 0.5, -Wd / 2 + 0.25, 0.35, Wd - 0.5);
  } else {
    ctx.fillStyle = '#26323d';
    ctx.beginPath(); ctx.moveTo(L * 0.22, -Wd / 2 + 0.2); ctx.lineTo(L * 0.34, -Wd / 2 + 0.3); ctx.lineTo(L * 0.34, Wd / 2 - 0.3); ctx.lineTo(L * 0.22, Wd / 2 - 0.2); ctx.closePath(); ctx.fill();
    ctx.fillRect(-L * 0.38, -Wd / 2 + 0.3, L * 0.09, Wd - 0.6);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; roundRect(ctx, -L * 0.27, -Wd / 2 + 0.25, L * 0.48, Wd - 0.5, 0.35); ctx.fill();
    if (c.kind === 'taxi') { ctx.fillStyle = '#ffcc33'; ctx.fillRect(-0.1, -0.35, 0.5, 0.7); }
    if (c.kind === 'van') { ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(-L / 2 + 0.2, -Wd / 2 + 0.2, L * 0.62, Wd - 0.4); }
  }
  if (!c.parked) {
    ctx.fillStyle = '#fff6c8'; ctx.fillRect(L / 2 - 0.25, -Wd / 2 + 0.15, 0.25, 0.4); ctx.fillRect(L / 2 - 0.25, Wd / 2 - 0.55, 0.25, 0.4);
    const braking = c.ai ? c.braking : c.brakeLight;
    ctx.fillStyle = braking ? '#ff2a2a' : '#7a1010'; ctx.fillRect(-L / 2, -Wd / 2 + 0.15, 0.22, 0.45); ctx.fillRect(-L / 2, Wd / 2 - 0.6, 0.22, 0.45);
    if (braking) { ctx.fillStyle = 'rgba(255,40,40,.25)'; ctx.fillRect(-L / 2 - 1, -Wd / 2, 1, Wd); }
    if (c.reversing) { ctx.fillStyle = '#fff'; ctx.fillRect(-L / 2, -0.15, 0.2, 0.3); }
    if (c.ind && Math.floor(time * 2.6) % 2 === 0) {
      const side = c.ind > 0 ? Wd / 2 : -Wd / 2;
      for (const x of [L / 2 - 0.25, -L / 2 + 0.25]) {
        ctx.fillStyle = '#ffa500'; ctx.beginPath(); ctx.arc(x, side * 0.85, 0.32, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,165,0,.3)'; ctx.beginPath(); ctx.arc(x, side * 0.85, 1, 0, TAU); ctx.fill();
      }
    }
  }
  if (!c.ai && !c.parked) {
    for (const x of [L / 2 - 0.55, -L / 2 + 0.15]) {           // L plates
      ctx.fillStyle = '#fff'; ctx.fillRect(x, -0.3, 0.42, 0.6);
      ctx.fillStyle = '#d0021b'; ctx.fillRect(x + 0.08, -0.2, 0.08, 0.42); ctx.fillRect(x + 0.08, 0.13, 0.26, 0.09);
    }
    ctx.fillStyle = '#f0c9a0'; ctx.beginPath(); ctx.arc(L * 0.12, Wd * 0.22, 0.28, 0, TAU); ctx.fill();   // driver sits on the right
    ctx.strokeStyle = '#111'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(L * 0.24, Wd * 0.22, 0.22, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawTrain(ctx, tr, view) {
  if (tr.wait > 0) return;
  for (let k = 0; k < 4; k++) {
    const q = railPoint(tr.s - tr.dir * (k * 23 + 11.5));
    if (q.x < view.x0 - 20 || q.x > view.x1 + 20 || q.y < view.y0 - 20 || q.y > view.y1 + 20) continue;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.ang);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-11, -1.2, 22.5, 3.2);
    ctx.fillStyle = '#2f4f7f'; roundRect(ctx, -11, -1.45, 22, 2.9, 0.6); ctx.fill();
    ctx.fillStyle = '#c9ced6'; ctx.fillRect(-10, -0.5, 20, 1);
    if (k === 0) { ctx.fillStyle = '#f2c230'; ctx.fillRect(tr.dir > 0 ? 9.5 : -11, -1.45, 1.5, 2.9); }
    ctx.restore();
  }
}

function drawPed(ctx, p, time) {
  const bob = Math.sin(time * 8 + p.x) * 0.08;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(p.x + 0.15, p.y + 0.2, 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(p.x, p.y, 0.55, 0.55 + bob, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5b3a29'; ctx.beginPath(); ctx.arc(p.x, p.y, 0.3, 0, TAU); ctx.fill();
  if (p.hit > 0) { ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.arc(p.x, p.y, 1 + Math.sin(time * 12) * 0.2, 0, TAU); ctx.stroke(); }
}

function drawBuildingsAndTrees(ctx, view, camRot) {
  const inV = (x, y, m) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
  for (const h of world.buildings) {
    if (!inV(h.x, h.y, 40)) continue;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.ang);
    const sh = h.kind === 'flat' ? 1 + (h.height || 6) * 0.12 : 1.2;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-h.w / 2 + sh * 0.7, -h.h / 2 + sh, h.w, h.h);
    ctx.fillStyle = h.roof; ctx.fillRect(-h.w / 2, -h.h / 2, h.w, h.h);
    if (h.kind === 'flat') {
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 0.4; ctx.strokeRect(-h.w / 2 + 0.6, -h.h / 2 + 0.6, h.w - 1.2, h.h - 1.2);
      if (h.district === 'city' && !h.label) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-h.w * 0.2, -h.h * 0.15, h.w * 0.18, h.h * 0.2); ctx.fillRect(h.w * 0.12, h.h * 0.05, 2, 2); }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.16)';
      if (h.w > h.h) ctx.fillRect(-h.w / 2, 0, h.w, h.h / 2); else ctx.fillRect(0, -h.h / 2, h.w / 2, h.h);
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 0.2; ctx.beginPath();
      if (h.w > h.h) { ctx.moveTo(-h.w / 2, 0); ctx.lineTo(h.w / 2, 0); } else { ctx.moveTo(0, -h.h / 2); ctx.lineTo(0, h.h / 2); }
      ctx.stroke();
      if (h.district === 'suburb' && !h.label) { ctx.fillStyle = '#7a3a2a'; ctx.fillRect(h.w * 0.15, -h.h * 0.35, 0.8, 0.8); }
    }
    if (h.label) { ctx.rotate(camRot - h.ang); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = '700 3.4px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h.label, 0, 0); }
    ctx.restore();
  }
  for (const t of world.trees) {
    if (!inV(t.x, t.y, 8)) continue;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.arc(t.x + 1, t.y + 1, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3f6b2f'; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4f8139'; ctx.beginPath(); ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, TAU); ctx.fill();
  }
}

// ---- Signs. Sized a little larger than life so they read on screen.
function tri(ctx, down) { ctx.fillStyle = '#d4202a'; ctx.beginPath(); if (down) { ctx.moveTo(-1.5, -1.1); ctx.lineTo(1.5, -1.1); ctx.lineTo(0, 1.5); } else { ctx.moveTo(0, -1.5); ctx.lineTo(1.6, 1.2); ctx.lineTo(-1.6, 1.2); } ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); if (down) { ctx.moveTo(-0.95, -0.75); ctx.lineTo(0.95, -0.75); ctx.lineTo(0, 0.85); } else { ctx.moveTo(0, -0.85); ctx.lineTo(1, 0.85); ctx.lineTo(-1, 0.85); } ctx.closePath(); ctx.fill(); }
function txt(ctx, s, size, color, y = 0) { ctx.fillStyle = color; ctx.font = `700 ${size}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, 0, y); }
function drawSign(ctx, s) {
  switch (s.kind) {
    case 'limit':
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, TAU); ctx.fill();
      if (s.nsl) { ctx.strokeStyle = '#111'; ctx.lineWidth = 0.1; ctx.stroke(); ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 1.45, 0, TAU); ctx.clip(); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#111'; ctx.fillRect(-2, -0.3, 4, 0.6); ctx.restore(); }
      else { ctx.strokeStyle = '#d4202a'; ctx.lineWidth = 0.32; ctx.beginPath(); ctx.arc(0, 0, 1.32, 0, TAU); ctx.stroke(); txt(ctx, s.limit, 1.45, '#111', 0.08); }
      break;
    case 'giveway': tri(ctx, true); break;
    case 'stop':
      ctx.fillStyle = '#d4202a'; ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; ctx.lineTo(Math.cos(a) * 1.5, Math.sin(a) * 1.5); } ctx.fill();
      txt(ctx, 'STOP', 0.75, '#fff'); break;
    case 'noentry': ctx.fillStyle = '#d4202a'; ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-1, -0.25, 2, 0.5); break;
    case 'oneway': ctx.fillStyle = '#0b5cad'; ctx.fillRect(-1.1, -1.5, 2.2, 3); ctx.fillStyle = '#fff'; ctx.fillRect(-0.15, -0.6, 0.3, 1.6); ctx.beginPath(); ctx.moveTo(0, -1.2); ctx.lineTo(0.6, -0.5); ctx.lineTo(-0.6, -0.5); ctx.fill(); break;
    case 'bus': ctx.fillStyle = '#0b5cad'; ctx.fillRect(-1.6, -1.2, 3.2, 2.4); ctx.fillStyle = '#fff'; ctx.fillRect(-0.9, -0.8, 1.8, 0.9); txt(ctx, 'BUS LANE', 0.42, '#fff', 0.65); break;
    case 'single': ctx.fillStyle = '#fff'; ctx.fillRect(-1.8, -1, 3.6, 2); ctx.strokeStyle = '#111'; ctx.lineWidth = 0.1; ctx.strokeRect(-1.8, -1, 3.6, 2); txt(ctx, 'SINGLE TRACK', 0.36, '#111', -0.35); txt(ctx, 'passing places', 0.32, '#111', 0.35); break;
    case 'passing': ctx.fillStyle = '#fff'; ctx.fillRect(-1.3, -0.6, 2.6, 1.2); ctx.strokeStyle = '#111'; ctx.lineWidth = 0.08; ctx.strokeRect(-1.3, -0.6, 2.6, 1.2); txt(ctx, 'Passing place', 0.32, '#111'); break;
    case 'hump': tri(ctx, false); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0.75, 0.55, Math.PI, TAU); ctx.fill(); break;
    case 'school': tri(ctx, false); ctx.fillStyle = '#111'; for (const x of [-0.35, 0.35]) { ctx.beginPath(); ctx.arc(x, 0.1, 0.17, 0, TAU); ctx.fill(); ctx.fillRect(x - 0.12, 0.25, 0.24, 0.5); } break;
    case 'rbwarn': tri(ctx, false); ctx.strokeStyle = '#111'; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.arc(0, 0.35, 0.45, 0, TAU); ctx.stroke(); break;
    case 'lxwarn': tri(ctx, false); ctx.fillStyle = '#111'; for (let x = -0.6; x <= 0.6; x += 0.3) ctx.fillRect(x - 0.05, 0.1, 0.1, 0.6); ctx.fillRect(-0.7, 0.3, 1.4, 0.1); break;
    case 'mini': ctx.fillStyle = '#0b5cad'; ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.arc(0, 0, 0.75, 0.3, TAU - 0.3); ctx.stroke(); break;
    case 'yieldOncoming':
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 1.45, 0, TAU); ctx.fill(); ctx.strokeStyle = '#d4202a'; ctx.lineWidth = 0.3; ctx.stroke();
      ctx.fillStyle = '#111'; ctx.fillRect(0.25, -0.6, 0.2, 1.2); ctx.fillStyle = '#d4202a'; ctx.fillRect(-0.45, -0.6, 0.2, 1.2); break;
    case 'priority': ctx.fillStyle = '#0b5cad'; ctx.fillRect(-1.3, -1.3, 2.6, 2.6); ctx.fillStyle = '#fff'; ctx.fillRect(-0.45, -0.7, 0.25, 1.4); ctx.fillStyle = '#d4202a'; ctx.fillRect(0.25, -0.7, 0.25, 1.4); break;
    case 'village': ctx.fillStyle = '#fff'; ctx.fillRect(-2.6, -0.8, 5.2, 1.6); ctx.strokeStyle = '#111'; ctx.lineWidth = 0.1; ctx.strokeRect(-2.6, -0.8, 5.2, 1.6); txt(ctx, s.text, 0.62, '#111'); break;
    case 'chevron': ctx.fillStyle = '#111'; ctx.fillRect(-1.8, -0.7, 3.6, 1.4); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.25;
      for (const x of [-0.9, 0, 0.9]) { ctx.beginPath(); const d = s.right ? 1 : -1; ctx.moveTo(x - d * 0.3, -0.5); ctx.lineTo(x + d * 0.3, 0); ctx.lineTo(x - d * 0.3, 0.5); ctx.stroke(); } break;
  }
}
function signalHead(ctx, st, time) {
  ctx.fillStyle = '#151515'; roundRect(ctx, -0.65, -1.75, 1.3, 3.5, 0.3); ctx.fill();
  ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 0.1; ctx.stroke();
  const lamp = (y, on, col, dim) => { ctx.fillStyle = on ? col : dim; ctx.beginPath(); ctx.arc(0, y, 0.42, 0, TAU); ctx.fill(); if (on) { ctx.fillStyle = col + '44'; ctx.beginPath(); ctx.arc(0, y, 0.9, 0, TAU); ctx.fill(); } };
  lamp(-1.1, st === 'R' || st === 'RA', '#ff2d2d', '#3a1010');
  lamp(0, st === 'A' || st === 'RA', '#ffb000', '#3a2a08');
  lamp(1.1, st === 'G', '#2ee06a', '#0d2a16');
}
function drawSignsAndLights(ctx, view, camRot, time) {
  const inV = (x, y) => x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1;
  const upright = (x, y, f) => { ctx.save(); ctx.translate(x, y); ctx.rotate(camRot); f(); ctx.restore(); };
  for (const s of world.signs) if (inV(s.x, s.y)) upright(s.x, s.y, () => drawSign(ctx, s));
  for (const n of world.nodes) {
    if (!(n.type === 'lights' || n.signals) || !inV(n.x, n.y)) continue;
    for (const arm of n.arms) {
      if (!canEnter(arm)) continue;
      const e = arm.e, dir = dirIn(arm), q = pointAt(e, sFrom(arm, n.r + 1.6), dir * (e.W / 2 + 1.3));
      upright(q.x, q.y, () => signalHead(ctx, lightState(n, arm, time), time));
    }
  }
  for (const c of world.crossings) {
    if (!inV(c.x, c.y)) continue;
    const e = c.e;
    if (c.kind === 'puffin') for (const dir of [1, -1]) {
      if (!lanesOf(e, dir)) continue;
      const q = pointAt(e, c.s - dir * 4.5, dir * (e.W / 2 + 1.3));
      upright(q.x, q.y, () => signalHead(ctx, puffinState(c, time), time));
    } else {
      const on = Math.floor(time * 1.6 + c.phase) % 2 === 0;
      for (const lat of [-e.W / 2 - 1.2, e.W / 2 + 1.2]) for (const sg of [-1, 1]) {
        const q = pointAt(e, c.s + sg * 1.9, lat);
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(q.x, q.y, 0.55, 0, TAU); ctx.fill();
        ctx.fillStyle = on ? '#ffb000' : '#8a5a10'; ctx.beginPath(); ctx.arc(q.x, q.y, 0.42, 0, TAU); ctx.fill();
        if (on) { ctx.fillStyle = 'rgba(255,190,40,.25)'; ctx.beginPath(); ctx.arc(q.x, q.y, 1.4, 0, TAU); ctx.fill(); }
      }
    }
  }
  for (const lx of world.levelX) {
    if (!inV(lx.x, lx.y)) continue;
    for (const dir of [1, -1]) {
      const q = pointAt(lx.e, lx.s - dir * 8.5, dir * (lx.e.W / 2 + 1.4));
      upright(q.x, q.y, () => {
        ctx.fillStyle = '#151515'; roundRect(ctx, -1.3, -1, 2.6, 2.2, 0.3); ctx.fill();
        const flash = Math.floor(time * 3) % 2;
        ctx.fillStyle = lx.state === 'amber' ? '#ffb000' : '#3a2a08'; ctx.beginPath(); ctx.arc(0, -0.45, 0.32, 0, TAU); ctx.fill();
        for (const [x, k] of [[-0.7, 0], [0.7, 1]]) { const on = lx.state === 'red' && flash === k; ctx.fillStyle = on ? '#ff2d2d' : '#3a1010'; ctx.beginPath(); ctx.arc(x, 0.5, 0.42, 0, TAU); ctx.fill(); }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.moveTo(-1.1, 1.5); ctx.lineTo(1.1, 2.4); ctx.moveTo(1.1, 1.5); ctx.lineTo(-1.1, 2.4); ctx.stroke();
      });
    }
  }
}

// ---- Minimap: Ordnance-Survey-ish colours. Green = primary route, orange = country roads.
let miniCache = null;
function drawMinimap(mctx, size, player, time) {
  const s = size / Math.max(world.W, world.H), ox = (size - world.W * s) / 2, oy = (size - world.H * s) / 2;
  if (!miniCache) {
    miniCache = document.createElement('canvas'); miniCache.width = miniCache.height = size;
    const c = miniCache.getContext('2d');
    c.fillStyle = '#2f4a2a'; c.fillRect(0, 0, size, size);
    c.fillStyle = '#41573c'; c.fillRect(ox, oy, 1010 * s, 870 * s);
    c.fillStyle = '#55524c'; c.fillRect(ox + 1090 * s, oy, (world.W - 1090) * s, 660 * s);
    c.strokeStyle = '#111'; c.lineWidth = 1; c.setLineDash([2, 2]); c.beginPath();
    world.rail.pts.forEach(([x, y], i) => i ? c.lineTo(ox + x * s, oy + y * s) : c.moveTo(ox + x * s, oy + y * s)); c.stroke(); c.setLineDash([]);
    for (const e of world.edges) {
      c.strokeStyle = e.kind === 'dual' ? '#3fae5a' : e.kind === 'rural' || e.kind === 'link' ? '#f0a35e' : e.kind === 'single' ? '#f6e3a8' : '#e9e6dc';
      c.lineWidth = e.kind === 'dual' ? 3.2 : e.kind === 'rural' || e.kind === 'link' ? 2.2 : e.busF ? 2.6 : 1.6;
      c.beginPath(); e.pts.forEach(([x, y], i) => i ? c.lineTo(ox + x * s, oy + y * s) : c.moveTo(ox + x * s, oy + y * s)); c.stroke();
    }
    for (const n of world.nodes) if (n.type === 'rb' || n.type === 'mini') { c.fillStyle = '#e9e6dc'; c.beginPath(); c.arc(ox + n.x * s, oy + n.y * s, n.type === 'rb' ? 3.2 : 1.8, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '600 9px system-ui'; c.textAlign = 'center';
    for (const [t, x, y] of [['Ashford Green', 560, 140], ['Kingsgate', 1400, 140], ['A40', 900, 975], ['Little Mardon', 900, 1560]]) c.fillText(t, ox + x * s, oy + y * s);
  }
  mctx.drawImage(miniCache, 0, 0);
  for (const lx of world.levelX) if (lx.state !== 'open') { mctx.fillStyle = '#ff2d2d'; mctx.beginPath(); mctx.arc(ox + lx.x * s, oy + lx.y * s, 2.5, 0, TAU); mctx.fill(); }
  for (const tr of world.trains) if (!tr.wait) { const q = railPoint(tr.s); mctx.fillStyle = '#6fa8ff'; mctx.fillRect(ox + q.x * s - 2, oy + q.y * s - 2, 4, 4); }
  mctx.save(); mctx.translate(ox + player.x * s, oy + player.y * s); mctx.rotate(player.heading);
  mctx.fillStyle = '#f7d117'; mctx.strokeStyle = '#111'; mctx.lineWidth = 1;
  mctx.beginPath(); mctx.moveTo(6, 0); mctx.lineTo(-4, -4); mctx.lineTo(-2, 0); mctx.lineTo(-4, 4); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}
