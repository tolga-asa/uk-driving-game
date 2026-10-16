// HUD, theory questions, fault feed, pause/debrief sheet, title screen and touch controls.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEV_LABEL = { minor: 'Driving fault', serious: 'Serious fault', dangerous: 'Dangerous fault' };

const ui = {
  q: null, qOrder: [], qPos: 0, tipTimer: null, toastTimer: null,

  init() {
    this.qOrder = QUESTIONS.map((_, i) => i).sort(() => Math.random() - 0.5);
    $('startBtn').onclick = () => { sfx.init(); this.hide('title'); game.state = 'drive'; game.tip('You start on a town street. Drive on the LEFT. Q / E work the indicators.', 'start', 999); };
    $('resumeBtn').onclick = () => this.resume();
    $('restartBtn').onclick = () => { newSession(); this.resume(); };
    $('pauseBtn').onclick = () => this.pause();
    $('quizBtn').onclick = () => this.askQuestion();
    $('qInterval').value = String(game.settings.qInterval);
    $('qInterval').onchange = (e) => { game.settings.qInterval = +e.target.value; game.qTimer = 0; saveSettings(); };
    $('camMode').value = game.settings.camera;
    $('camMode').onchange = (e) => { game.settings.camera = e.target.value; saveSettings(); };
    $('tipsOn').checked = game.settings.tips;
    $('tipsOn').onchange = (e) => { game.settings.tips = e.target.checked; saveSettings(); };
    $('soundOn').checked = game.settings.sound;
    $('soundOn').onchange = (e) => { game.settings.sound = e.target.checked; saveSettings(); };
    this.initTouch();
  },
  show(id) { $(id).hidden = false; },
  hide(id) { $(id).hidden = true; },

  pause() {
    if (game.state !== 'drive') return;
    game.state = 'paused'; for (const k in input) input[k] = false; sfx.horn(false);
    this.renderSheet(); this.show('pause');
  },
  resume() { this.hide('pause'); game.state = 'drive'; },

  toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => t.hidden = true, 1600);
  },
  showTip(msg) {
    const t = $('tip'); $('tipText').textContent = msg; t.hidden = false; t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    clearTimeout(this.tipTimer); this.tipTimer = setTimeout(() => t.hidden = true, 6500);
  },
  showFault(f) {
    const box = $('faults');
    const el = document.createElement('div');
    el.className = 'fault ' + f.sev;
    el.innerHTML = `<div class="fault-sev">${SEV_LABEL[f.sev]} · ${esc(f.cat)}</div><div class="fault-msg">${esc(f.msg)}</div><div class="fault-tip">${esc(f.tip)}</div>`;
    box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, f.sev === 'minor' ? 5500 : 8000);
  },

  counts() {
    const c = { minor: 0, serious: 0, dangerous: 0 };
    for (const f of game.faults) c[f.sev]++;
    return c;
  },
  refreshTally() {
    const c = this.counts();
    $('tMinor').textContent = c.minor; $('tSerious').textContent = c.serious; $('tDanger').textContent = c.dangerous;
    $('tTheory').textContent = `${game.theory.correct}/${game.theory.asked}`;
    const pass = c.minor <= 15 && !c.serious && !c.dangerous;
    const v = $('verdict'); v.textContent = pass ? 'On course to pass' : 'This would be a fail';
    v.className = 'verdict ' + (pass ? 'pass' : 'fail');
  },

  updateHud() {
    const p = game.player, mph = Math.abs(p.speed) * MPH, lim = p.limit || 30;
    $('speed').textContent = Math.round(mph);
    $('speedBox').classList.toggle('over', p.speed * MPH > lim + 1);
    $('gear').textContent = p.reversing ? 'R' : 'D';
    const ls = $('limitSign'); ls.dataset.limit = lim; ls.querySelector('span').textContent = lim === 60 ? '' : lim;
    const blink = Math.floor(game.time * 2.6) % 2 === 0;
    $('indL').classList.toggle('on', p.ind === -1 && blink);
    $('indR').classList.toggle('on', p.ind === 1 && blink);
    $('keepLeft').hidden = !(p.wrongSide > 0.6);
    const next = game.settings.qInterval > 0 ? Math.max(0, game.settings.qInterval - game.qTimer) : null;
    $('qNext').textContent = next === null ? 'off' : `${Math.ceil(next)} s`;
  },

  // ---- Theory questions
  pickQuestion() {
    // After a recent mistake, prefer a question on the same topic.
    if (game.lastFaultTopic && game.time - game.lastFaultT < 90) {
      const topic = game.lastFaultTopic; game.lastFaultTopic = null;
      const pool = QUESTIONS.map((q, i) => i).filter(i => QUESTIONS[i].t === topic);
      const unseen = pool.filter(i => !game.theory.log.some(l => l.i === i));
      const list = unseen.length ? unseen : pool;
      if (list.length) return list[(Math.random() * list.length) | 0];
    }
    const i = this.qOrder[this.qPos % this.qOrder.length]; this.qPos++;
    return i;
  },
  askQuestion() {
    if (game.state !== 'drive') return;
    game.state = 'question'; game.qTimer = 0; for (const k in input) input[k] = false; sfx.horn(false);
    const i = this.pickQuestion(), q = QUESTIONS[i];
    const order = q.a.map((_, k) => k).sort(() => Math.random() - 0.5);
    this.q = { i, q, order, answered: false };
    $('qTopic').textContent = { speed: 'Speed limits', safety: 'Safety margins', roundabout: 'Roundabouts', lights: 'Traffic lights', crossing: 'Pedestrian crossings',
      junction: 'Junctions', keepleft: 'Keeping left', signals: 'Signals', signs: 'Signs & markings', motorway: 'Motorways', law: 'The law', general: 'General' }[q.t] || 'Theory';
    $('qText').textContent = q.q;
    $('qAnswers').innerHTML = order.map((k, n) => `<button class="ans" data-k="${k}" id="ans${n}"><b>${'ABCD'[n]}</b><span>${esc(q.a[k])}</span></button>`).join('');
    for (const b of $('qAnswers').children) b.onclick = () => this.answer(+b.dataset.k);
    $('qFeedback').hidden = true; $('qContinue').hidden = true;
    $('qContinue').onclick = () => this.closeQuestion();
    this.show('question');
    $('ans0').focus({ preventScroll: true });
  },
  answer(k) {
    const s = this.q; if (!s || s.answered) return;
    s.answered = true;
    const right = k === s.q.c;
    game.theory.asked++; if (right) game.theory.correct++;
    game.theory.log.push({ i: s.i, right });
    for (const b of $('qAnswers').children) {
      const bk = +b.dataset.k; b.disabled = true;
      if (bk === s.q.c) b.classList.add('correct'); else if (bk === k) b.classList.add('wrong');
    }
    const fb = $('qFeedback');
    fb.className = 'q-feedback ' + (right ? 'right' : 'wrong');
    fb.innerHTML = `<strong>${right ? 'Correct.' : 'Not quite.'}</strong> ${esc(s.q.e)}`;
    fb.hidden = false; $('qContinue').hidden = false; $('qContinue').focus({ preventScroll: true });
    right ? sfx.good() : sfx.bad();
    this.refreshTally();
  },
  closeQuestion() { this.hide('question'); this.q = null; game.state = 'drive'; },
  questionKey(e) {
    if (!this.q) return;
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, KeyA: 0, KeyB: 1, KeyC: 2, KeyD: 3 }[e.code];
    if (!this.q.answered && n !== undefined) { e.preventDefault(); this.answer(this.q.order[n]); }
    else if (this.q.answered && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); this.closeQuestion(); }
  },

  // ---- Debrief sheet, laid out like the DL25 marking sheet: tally of driving faults, S and D boxes.
  renderSheet() {
    const cats = {};
    for (const f of game.faults) { (cats[f.cat] ||= { minor: 0, serious: 0, dangerous: 0, last: f })[f.sev]++; cats[f.cat].last = f; }
    const c = this.counts();
    const pass = c.minor <= 15 && !c.serious && !c.dangerous;
    const mins = Math.floor(game.time / 60), secs = Math.floor(game.time % 60);
    $('sheetSummary').innerHTML = `<div class="result ${pass ? 'pass' : 'fail'}">${pass ? 'PASS' : 'FAIL'}</div>
      <div class="sum-grid"><div><b>${c.minor}</b><span>driving faults (max 15)</span></div><div><b>${c.serious}</b><span>serious</span></div>
      <div><b>${c.dangerous}</b><span>dangerous</span></div><div><b>${game.theory.correct}/${game.theory.asked}</b><span>theory correct</span></div>
      <div><b>${mins}:${String(secs).padStart(2, '0')}</b><span>time driving</span></div></div>`;
    const rows = Object.entries(cats).map(([cat, v]) => `<tr><th>${esc(cat)}</th><td class="tally">${'|'.repeat(v.minor) || ''}</td>
      <td class="box ${v.serious ? 'marked' : ''}">${v.serious ? 'S' : ''}</td><td class="box ${v.dangerous ? 'marked d' : ''}">${v.dangerous ? 'D' : ''}</td>
      <td class="last">${esc(v.last.msg)}</td></tr>`).join('');
    $('sheetRows').innerHTML = rows || '<tr><td colspan="5" class="empty">No faults recorded yet. Keep it up.</td></tr>';
    const wrong = game.theory.log.filter(l => !l.right).slice(-4);
    $('sheetReview').innerHTML = wrong.length ? '<h3>Theory to review</h3>' + wrong.map(l => `<p><b>${esc(QUESTIONS[l.i].q)}</b><br>${esc(QUESTIONS[l.i].a[QUESTIONS[l.i].c])}. ${esc(QUESTIONS[l.i].e)}</p>`).join('') : '';
  },

  initTouch() {
    const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!touch) return;
    this.show('touch');
    const bind = (id, key) => {
      const el = $(id);
      const on = (e) => { e.preventDefault(); sfx.init(); input[key] = true; el.classList.add('down'); };
      const off = (e) => { e.preventDefault(); input[key] = false; el.classList.remove('down'); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    };
    bind('tLeft', 'left'); bind('tRight', 'right'); bind('tGas', 'up'); bind('tBrake', 'down'); bind('tHand', 'hand');
    $('tIndL').onclick = () => setIndicator(-1); $('tIndR').onclick = () => setIndicator(1);
  },
};
