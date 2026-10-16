// Game loop, input, camera and sound.
const game = {
  state: 'title', time: 0, player: null, faults: [], theory: { asked: 0, correct: 0, log: [] },
  qTimer: 0, shake: 0, tipShown: {}, lastFaultTopic: null, lastFaultT: -99,
  settings: { qInterval: 75, camera: 'chase', tips: true, sound: true },
};
const input = { up: false, down: false, left: false, right: false, hand: false };
let canvas, ctx, mini, mctx, cam = { x: 0, y: 0, rot: 0, scale: 10 };

try { Object.assign(game.settings, JSON.parse(localStorage.getItem('keepleft-settings') || '{}')); } catch (e) {}
function saveSettings() { try { localStorage.setItem('keepleft-settings', JSON.stringify(game.settings)); } catch (e) {} }

function newSession() {
  traffic.cars.length = 0; traffic.peds.length = 0; skids.length = 0;
  const R = rng(Date.now() & 0xffff);
  const start = world.node(1, 1).edges[1];        // heading south from the lights at (1,1)
  game.player = makePlayer(start.a.x + LANE, start.a.y + 40, Math.PI / 2);
  game.player.limit = start.limit;
  for (let k = 0, tries = 0; k < 64 && tries < 900; tries++) {
    const e = world.edges[(R() * world.edges.length) | 0];
    const fwd = R() < 0.5, along = e.a.r + 14 + R() * (SP - e.a.r - e.b.r - 34);
    const d = fwd ? DIRS[e.dir] : DIRS[(e.dir + 2) % 4], from = fwd ? e.a : e.b;
    const x = from.x + d[0] * along, y = from.y + d[1] * along;
    if (Math.hypot(x - game.player.x, y - game.player.y) < 45) continue;
    if (traffic.cars.some(c => Math.hypot(c.x - x, c.y - y) < 12)) continue;
    spawnCar(e, fwd, along, R); k++;
  }
  spawnPeds(R);
  game.faults = []; game.theory = { asked: 0, correct: 0, log: [] }; game.qTimer = 0; game.tipShown = {};
  cam.x = game.player.x; cam.y = game.player.y; cam.rot = game.settings.camera === 'chase' ? -(game.player.heading + Math.PI / 2) : 0;
  ui.refreshTally();
}

game.addFault = (f) => {
  game.faults.push(f);
  game.lastFaultTopic = f.topic; game.lastFaultT = game.time;
  ui.showFault(f); ui.refreshTally();
  sfx.fault(f.sev);
};
game.tip = (msg, key, cool = 45) => {
  if (!game.settings.tips) return;
  if (game.tipShown[key] !== undefined && game.time - game.tipShown[key] < cool) return;
  game.tipShown[key] = game.time;
  ui.showTip(msg);
};
game.bump = (sp) => { game.shake = Math.min(1.2, sp / 10); sfx.crash(sp); };

// ---- Input
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'hand' };
function setIndicator(dir) {
  const p = game.player; if (!p) return;
  p.ind = p.ind === dir ? 0 : dir; p.indHeading = p.heading;
  sfx.tick();
}
addEventListener('keydown', (e) => {
  if (game.state === 'question') { ui.questionKey(e); return; }
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (game.state !== 'drive') { if ((e.code === 'Escape' || e.code === 'KeyP') && game.state === 'paused') ui.resume(); return; }
  if (e.repeat) return;
  if (e.code === 'KeyQ' || e.code === 'KeyZ') setIndicator(-1);
  if (e.code === 'KeyE' || e.code === 'KeyX') setIndicator(1);
  if (e.code === 'KeyC') { game.settings.camera = game.settings.camera === 'chase' ? 'north' : 'chase'; saveSettings(); ui.toast(game.settings.camera === 'chase' ? 'Camera: behind the car' : 'Camera: north up (map view)'); }
  if (e.code === 'KeyH') sfx.horn(true);
  if (e.code === 'KeyT') ui.askQuestion();
  if (e.code === 'KeyM') { game.settings.sound = !game.settings.sound; saveSettings(); sfx.update(0, 0); ui.toast(game.settings.sound ? 'Sound on' : 'Sound off'); }
  if (e.code === 'Escape' || e.code === 'KeyP') ui.pause();
});
addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
  if (e.code === 'KeyH') sfx.horn(false);
});
addEventListener('blur', () => { for (const k in input) input[k] = false; if (game.state === 'drive') ui.pause(); });

// ---- Sound (Web Audio; starts after the first click)
const sfx = (() => {
  let ac, eng, engGain, filt, horn1, horn2, hornGain;
  const ok = () => ac && game.settings.sound;
  function init() {
    if (ac) return;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    eng = ac.createOscillator(); eng.type = 'sawtooth';
    filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 600;
    engGain = ac.createGain(); engGain.gain.value = 0;
    eng.connect(filt); filt.connect(engGain); engGain.connect(ac.destination); eng.start();
    hornGain = ac.createGain(); hornGain.gain.value = 0; hornGain.connect(ac.destination);
    horn1 = ac.createOscillator(); horn1.type = 'square'; horn1.frequency.value = 415;
    horn2 = ac.createOscillator(); horn2.type = 'square'; horn2.frequency.value = 523;
    horn1.connect(hornGain); horn2.connect(hornGain); horn1.start(); horn2.start();
  }
  function beep(freq, dur, type = 'sine', vol = 0.12, when = 0) {
    if (!ok()) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + when;
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
  }
  return {
    init, beep,
    update(speed, throttle) {
      if (!ac) return;
      // Fake 5-speed automatic: rpm climbs through each gear then drops.
      const mph = Math.abs(speed) * MPH, gears = [0, 15, 28, 42, 58, 200];
      let g = 1; while (mph > gears[g] && g < 5) g++;
      const frac = (mph - gears[g - 1]) / (gears[g] - gears[g - 1]);
      const rpm = 800 + frac * 3800 + (throttle ? 400 : 0);
      eng.frequency.setTargetAtTime(rpm / 60 * 2, ac.currentTime, 0.05);
      filt.frequency.setTargetAtTime(300 + rpm * 0.25, ac.currentTime, 0.05);
      engGain.gain.setTargetAtTime(ok() && game.state === 'drive' ? 0.035 + (throttle ? 0.03 : 0) : 0, ac.currentTime, 0.1);
    },
    tick() { beep(1800, 0.03, 'square', 0.05); },
    horn(on) { if (ac) hornGain.gain.setTargetAtTime(on && ok() ? 0.06 : 0, ac.currentTime, 0.01); },
    fault(sev) { beep(sev === 'minor' ? 330 : 220, 0.25, 'triangle', 0.15); if (sev !== 'minor') beep(165, 0.35, 'triangle', 0.15, 0.18); },
    good() { beep(660, 0.12, 'sine', 0.12); beep(880, 0.2, 'sine', 0.12, 0.1); },
    bad() { beep(200, 0.3, 'sawtooth', 0.08); },
    crash(sp) {
      if (!ok()) return;
      const len = 0.3, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const s = ac.createBufferSource(), g = ac.createGain(); g.gain.value = Math.min(0.5, sp / 25);
      s.buffer = buf; s.connect(g); g.connect(ac.destination); s.start();
    },
  };
})();

// ---- Main loop
let last = 0, tickPhase = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
  if (game.state === 'drive') {
    const steps = 3, h = dt / steps;
    for (let k = 0; k < steps; k++) {
      game.time += h;
      const p = game.player;
      const prev = updatePlayerPhysics(p, input, h);
      collidePlayer(p, prev, game.time);
      leaveSkids(p, prev);
      updateCars(h, game.time, p);
      updatePeds(h, p);
    }
    checkRules(game.player, dt);
    game.qTimer += dt;
    if (game.settings.qInterval > 0 && game.qTimer > game.settings.qInterval) ui.askQuestion();
    const ph = Math.floor(game.time * 2.6) % 2;
    if (game.player.ind && ph !== tickPhase) sfx.tick();
    tickPhase = ph;
  }
  for (const s of skids) s.a -= dt * 0.04;
  while (skids.length && skids[0].a <= 0) skids.shift();
  sfx.update(game.player ? game.player.speed : 0, input.up);
  if (game.player) { render(dt); ui.updateHud(); }
  requestAnimationFrame(frame);
}

function leaveSkids(p, prev) {
  const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
  const vR = -p.vx * sh + p.vy * ch, sp = Math.hypot(p.vx, p.vy);
  if (!(Math.abs(vR) > 2.2 || (input.hand && sp > 4) || (input.down && p.speed > 12))) return;
  for (const side of [-0.75, 0.75]) {
    const bx = -p.len * 0.35, x = p.x + ch * bx - sh * side, y = p.y + sh * bx + ch * side;
    skids.push({ x0: x - p.vx * 0.0167, y0: y - p.vy * 0.0167, x1: x, y1: y, a: 1 });
  }
  if (skids.length > 1500) skids.splice(0, skids.length - 1500);
}

function render(dt) {
  const w = canvas.width, h = canvas.height, dpr = canvas._dpr;
  const p = game.player, sp = Math.hypot(p.vx, p.vy);
  const chase = game.settings.camera === 'chase';
  // Camera: look ahead along the velocity, zoom out with speed.
  const ahead = chase ? 0.55 : 0.8;
  const tx = p.x + p.vx * ahead, ty = p.y + p.vy * ahead;
  const k = Math.min(1, dt * 4);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  const base = Math.min(w, h) / (Math.min(innerWidth, innerHeight) < 600 ? 40 : 56);
  const targetScale = base * (1 - Math.min(sp, 32) / 32 * 0.42);
  cam.scale += (targetScale - cam.scale) * Math.min(1, dt * 1.5);
  const rotT = chase ? -(p.heading + Math.PI / 2) : 0;
  cam.rot += angDiff(rotT, cam.rot) * Math.min(1, dt * (chase ? 3.5 : 6));
  game.shake = Math.max(0, game.shake - dt * 2.5);
  const shx = (Math.random() - 0.5) * game.shake * 12 * dpr, shy = (Math.random() - 0.5) * game.shake * 12 * dpr;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COL.grass; ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2 + shx, h * (chase ? 0.62 : 0.5) + shy);
  ctx.rotate(cam.rot); ctx.scale(cam.scale, cam.scale); ctx.translate(-cam.x, -cam.y);
  const rad = Math.hypot(w, h) / cam.scale * 0.62;
  const view = { x0: cam.x - rad, y0: cam.y - rad, x1: cam.x + rad, y1: cam.y + rad };
  drawWorld(ctx, cam, game.time, view);
  for (const ped of traffic.peds) if (ped.x > view.x0 && ped.x < view.x1 && ped.y > view.y0 && ped.y < view.y1) drawPed(ctx, ped, game.time);
  for (const c of traffic.cars) if (c.x > view.x0 - 6 && c.x < view.x1 + 6 && c.y > view.y0 - 6 && c.y < view.y1 + 6) drawCar(ctx, c, game.time);
  drawCar(ctx, p, game.time);
  drawBuildingsAndTrees(ctx, view, -cam.rot);
  drawSignsAndLights(ctx, view, -cam.rot, game.time);

  mctx.setTransform(1, 0, 0, 1, 0, 0);
  drawMinimap(mctx, mini.width, p, game.time);
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  canvas._dpr = dpr;
}

function boot() {
  canvas = document.getElementById('game'); ctx = canvas.getContext('2d');
  mini = document.getElementById('minimap'); mctx = mini.getContext('2d');
  resize(); addEventListener('resize', resize);
  buildWorld();
  newSession();
  ui.init();
  requestAnimationFrame(frame);
}
