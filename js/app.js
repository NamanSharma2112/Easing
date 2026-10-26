import { LIBRARY, byId, resolve, snippets, round, clamp } from './easings.js';
import { createPlot, sample, extent, miniCurve } from './curve.js';
import { DEMOS, demoById } from './demos.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORE_KEY = 'easing-lab-state';
const HOLD_MS = 700;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const defaults = () => ({
  demo: 'sheet',
  durationMs: 300,
  speed: 1,
  loop: false,
  cards: [{ id: 'ease' }, { id: 'spring-smooth' }, { id: 'spring-bouncy' }],
  tune: { id: 'spring-bouncy' },
  codeTab: 'CSS',
});

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, cards: state.cards, tune: state.tune }));
  } catch { /* private browsing, nothing to do */ }
}

const state = load();
let cards = [];       // live card instances for the compare grid
let tuneCard = null;  // the single large demo on the tuning bench
let rafId = null;
let holdId = null;
let startTime = 0;

/* ------------------------------------------------------------ phone mocks */

function makePhone(size = '') {
  const phone = document.createElement('div');
  phone.className = `phone ${size}`.trim();
  phone.innerHTML = '<div class="phone-notch"></div><div class="screen"></div>';
  return phone;
}

/* ------------------------------------------------------------- comparison */

function resolveCard(config) {
  return resolve({ ...config, durationMs: config.durationMs ?? state.durationMs });
}

function buildGrid() {
  const grid = $('#grid');
  grid.innerHTML = '';
  cards = state.cards.map((config, index) => {
    const article = document.createElement('article');
    article.className = 'card';
    article.tabIndex = 0;
    article.setAttribute('role', 'button');

    const phone = makePhone();
    const plot = createPlot();
    const label = document.createElement('div');
    label.className = 'card-label';
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.innerHTML = `
      <button class="link-btn" data-act="copy">Copy CSS</button>
      <button class="link-btn" data-act="tune">Tune</button>
      <button class="link-btn" data-act="remove">Remove</button>`;

    const plotWrap = document.createElement('div');
    plotWrap.className = 'plot-wrap';
    plotWrap.append(plot.svg);

    article.append(phone, plotWrap, label, actions);
    grid.append(article);

    const apply = demoById(state.demo).create($('.screen', phone));
    const card = { config, index, article, plot, label, apply, resolved: resolveCard(config) };

    article.addEventListener('click', (event) => {
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'remove') { removeCard(index); return; }
      if (act === 'tune') { state.tune = { ...config }; setView('tune'); return; }
      if (act === 'copy') { copyText(snippets(card.resolved).CSS, event.target); return; }
      playAll();
    });
    article.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); playAll(); }
    });

    return card;
  });
  refreshCards();
}

function refreshCards() {
  cards.forEach((card) => { card.resolved = resolveCard(card.config); });

  const curves = cards.map((card) => sample(card.resolved.fn));
  const range = extent(curves);
  const slowest = Math.max(...cards.map((card) => card.resolved.totalMs), 1);

  cards.forEach((card, i) => {
    const r = card.resolved;
    card.plot.setCurve(curves[i], range);
    card.label.innerHTML = `
      <h3>${r.name}</h3>
      <p class="params">${r.params}</p>
      <div class="timing">
        <span class="time">${r.settleLabel}</span>
        <span class="timebar"><i style="width:${(r.totalMs / slowest) * 100}%"></i></span>
      </div>`;
    card.article.setAttribute('aria-label', `${r.name}, ${r.params}. Press to replay.`);
    card.apply(REDUCED ? 1 : 0);
    card.plot.setProgress(REDUCED ? 1 : 0);
  });

  $('#toggle-picker').disabled = cards.length >= 6;
  save();
}

function addCard(config) {
  if (state.cards.length >= 6) return;
  state.cards = [...state.cards, config];
  buildGrid();
  playAll();
}

function removeCard(index) {
  if (state.cards.length <= 1) return;
  state.cards = state.cards.filter((_, i) => i !== index);
  buildGrid();
}

/* --------------------------------------------------------------- playback */

function stopClock() {
  if (rafId) cancelAnimationFrame(rafId);
  if (holdId) clearTimeout(holdId);
  rafId = null;
  holdId = null;
}

function activeCards() {
  return $('#view-tune').hidden ? cards : (tuneCard ? [tuneCard] : []);
}

function playAll() {
  stopClock();
  const running = activeCards();
  if (!running.length) return;
  if (REDUCED) {
    running.forEach((card) => { card.apply(1); card.plot.setProgress(1); });
    return;
  }
  startTime = performance.now();
  rafId = requestAnimationFrame(frame);
}

function frame(now) {
  const running = activeCards();
  const elapsed = (now - startTime) * state.speed;
  let done = true;
  for (const card of running) {
    const p = clamp(elapsed / card.resolved.totalMs, 0, 1);
    card.apply(card.resolved.fn(p));
    card.plot.setProgress(p);
    if (p < 1) done = false;
  }
  if (!done) { rafId = requestAnimationFrame(frame); return; }
  rafId = null;
  if (state.loop) {
    holdId = setTimeout(() => {
      running.forEach((card) => { card.apply(0); card.plot.setProgress(0); });
      holdId = setTimeout(playAll, 120);
    }, HOLD_MS);
  }
}

/* ---------------------------------------------------------------- picker */

function buildPicker() {
  const picker = $('#picker');
  const list = $('#picker-list', picker);
  list.innerHTML = '';
  const groups = [...new Set(LIBRARY.map((e) => e.group))];
  for (const group of groups) {
    const section = document.createElement('div');
    section.className = 'picker-group';
    section.innerHTML = `<h4>${group}</h4>`;
    const items = document.createElement('div');
    items.className = 'picker-items';
    for (const entry of LIBRARY.filter((e) => e.group === group)) {
      const button = document.createElement('button');
      button.className = 'picker-item';
      button.dataset.id = entry.id;
      button.dataset.search = `${entry.name} ${entry.group} ${entry.use}`.toLowerCase();
      const r = resolve({ id: entry.id, durationMs: 300 });
      const text = document.createElement('span');
      text.className = 'picker-text';
      text.innerHTML = `<strong>${entry.name}</strong><em>${entry.blurb}</em>`;
      button.append(miniCurve(r.fn), text);
      button.addEventListener('click', () => {
        addCard({ id: entry.id });
        picker.hidden = true;
        $('#toggle-picker').setAttribute('aria-expanded', 'false');
      });
      items.append(button);
    }
    section.append(items);
    list.append(section);
  }
}

function filterPicker(query) {
  const q = query.trim().toLowerCase();
  $$('#picker .picker-item').forEach((item) => {
    item.hidden = Boolean(q) && !item.dataset.search.includes(q);
  });
  $$('#picker .picker-group').forEach((group) => {
    group.hidden = !$$('.picker-item:not([hidden])', group).length;
  });
}

/* ------------------------------------------------------------------ tune */

const EDITOR = { w: 320, h: 320, pad: 30, yMin: -0.6, yMax: 1.6 };
let editorRange = [-0.08, 1.08];

const ex = (t) => EDITOR.pad + t * (EDITOR.w - EDITOR.pad * 2);
const ey = (v) => {
  const [lo, hi] = editorRange;
  return EDITOR.h - EDITOR.pad - ((v - lo) / (hi - lo || 1)) * (EDITOR.h - EDITOR.pad * 2);
};
const invX = (px) => clamp((px - EDITOR.pad) / (EDITOR.w - EDITOR.pad * 2), 0, 1);
const invY = (py) => {
  const [lo, hi] = editorRange;
  const v = lo + ((EDITOR.h - EDITOR.pad - py) / (EDITOR.h - EDITOR.pad * 2)) * (hi - lo);
  return clamp(v, EDITOR.yMin, EDITOR.yMax);
};

function buildTune() {
  const stage = $('#tune-stage');
  stage.innerHTML = '';
  const phone = makePhone('is-large');
  stage.append(phone);

  const select = $('#tune-easing');
  select.innerHTML = '';
  for (const group of [...new Set(LIBRARY.map((e) => e.group))]) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group;
    for (const entry of LIBRARY.filter((e) => e.group === group)) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.name;
      optgroup.append(option);
    }
    select.append(optgroup);
  }

  tuneCard = {
    config: state.tune,
    plot: editorPlot,
    apply: demoById(state.demo).create($('.screen', phone)),
    resolved: resolve(state.tune),
    phone,
  };
  refreshTune();
}

function refreshTune({ rebuildDemo = false } = {}) {
  if (!tuneCard) return;
  if (rebuildDemo) tuneCard.apply = demoById(state.demo).create($('.screen', tuneCard.phone));

  const config = state.tune;
  tuneCard.config = config;
  const base = byId(config.id);
  const r = resolve({ ...config, durationMs: config.durationMs ?? state.durationMs });
  tuneCard.resolved = r;

  $('#tune-easing').value = config.id;
  const points = sample(r.fn);
  editorPlot.setCurve(points);

  const isSpring = r.type === 'spring';
  $('#spring-controls').hidden = !isSpring;
  $('#bezier-controls').hidden = isSpring;
  $('#editor-svg').classList.toggle('is-dim', isSpring);

  if (!isSpring) {
    const [x1, y1, x2, y2] = r.bezier;
    setSlider('x1', x1, 2);
    setSlider('y1', y1, 2);
    setSlider('x2', x2, 2);
    setSlider('y2', y2, 2);
  }

  if (isSpring) {
    $('#tune-duration').value = r.duration;
    $('#tune-duration-out').textContent = `${r.duration.toFixed(2)}s`;
    $('#tune-bounce').value = r.bounce;
    $('#tune-bounce-out').textContent = r.bounce.toFixed(2);
  } else {
    $('#tune-ms').value = Math.round(r.totalMs);
    $('#tune-ms-out').textContent = `${Math.round(r.totalMs)}ms`;
  }

  const edited = (config.bezier && base?.bezier && config.bezier.join() !== base.bezier.join())
    || (config.duration !== undefined && config.duration !== base?.duration)
    || (config.bounce !== undefined && config.bounce !== base?.bounce);

  $('#tune-name').textContent = base ? base.name : 'Custom';
  $('#tune-edited').hidden = !edited;
  $('#tune-params').textContent = r.params;
  $('#tune-settle').textContent = r.settleLabel;
  $('#tune-blurb').textContent = base ? base.blurb : '';
  $('#use-note').textContent = base ? base.use : '';

  drawEditor(r, points);
  renderCode(r);
  save();
}

// The editor doubles as the playhead display, so the curve you are editing is
// the same one you watch run.
let editorPoints = [];
const editorPlot = {
  setCurve(points) { editorPoints = points; },
  setProgress(t) {
    const head = document.getElementById('editor-head');
    if (!head || !editorPoints.length) return;
    const p = clamp(t, 0, 1);
    const i = Math.round(p * (editorPoints.length - 1));
    const [, v] = editorPoints[i];
    head.setAttribute('cx', ex(p));
    head.setAttribute('cy', ey(v));
  },
};

function setSlider(key, value, places) {
  const input = $(`#p-${key}`);
  const output = $(`#o-${key}`);
  if (!input) return;
  input.value = value;
  output.textContent = value.toFixed(places);
}

function drawEditor(r, points) {
  const svg = $('#editor-svg');
  const curve = $('#editor-curve', svg);

  // Fit the drawing to whatever the curve actually does, so overshoot is never clipped.
  const values = points.map(([, v]) => v);
  if (r.type === 'bezier') values.push(r.bezier[1], r.bezier[3]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(1, ...values);
  const margin = (hi - lo) * 0.08;
  editorRange = [lo - margin, hi + margin];

  for (const [id, value] of [['#guide-one', 1], ['#guide-zero', 0]]) {
    const line = $(id, svg);
    line.setAttribute('y1', ey(value).toFixed(2));
    line.setAttribute('y2', ey(value).toFixed(2));
  }

  curve.setAttribute('d', points.map(([t, v], i) => `${i ? 'L' : 'M'}${ex(t).toFixed(1)} ${ey(v).toFixed(1)}`).join(' '));

  const v = r.type === 'bezier' ? r.bezier : null;
  $$('.editor-handle, .editor-leg', svg).forEach((node) => { node.style.display = v ? '' : 'none'; });
  if (!v) return;

  const [x1, y1, x2, y2] = v;
  setLeg($('#leg-1', svg), 0, 0, x1, y1);
  setLeg($('#leg-2', svg), 1, 1, x2, y2);
  setHandle($('#handle-1', svg), x1, y1);
  setHandle($('#handle-2', svg), x2, y2);
}

function setLeg(node, ax, ay, bx, by) {
  node.setAttribute('x1', ex(ax)); node.setAttribute('y1', ey(ay));
  node.setAttribute('x2', ex(bx)); node.setAttribute('y2', ey(by));
}

function setHandle(node, x, y) {
  node.setAttribute('cx', ex(x));
  node.setAttribute('cy', ey(y));
  node.dataset.x = x;
  node.dataset.y = y;
}

function currentBezier() {
  const base = byId(state.tune.id);
  return state.tune.bezier ?? base?.bezier ?? [0.25, 0.1, 0.25, 1];
}

function setBezier(index, x, y) {
  const next = [...currentBezier()];
  next[index * 2] = round(x, 3);
  next[index * 2 + 1] = round(y, 3);
  state.tune = { ...state.tune, bezier: next };
  refreshTune();
}

function initEditorDragging() {
  const svg = $('#editor-svg');
  for (const id of ['handle-1', 'handle-2']) {
    const handle = $(`#${id}`, svg);
    const index = id === 'handle-1' ? 0 : 1;

    const move = (event) => {
      const rect = svg.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * EDITOR.w;
      const py = ((event.clientY - rect.top) / rect.height) * EDITOR.h;
      setBezier(index, invX(px), invY(py));
    };

    handle.addEventListener('pointerdown', (event) => {
      if (state.tune.id && byId(state.tune.id)?.type === 'spring') return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      handle.classList.add('is-dragging');
      const up = () => {
        handle.classList.remove('is-dragging');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        playTune();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });

    handle.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 0.1 : 0.02;
      const [x, y] = [Number(handle.dataset.x), Number(handle.dataset.y)];
      const moves = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
      };
      const delta = moves[event.key];
      if (!delta) return;
      event.preventDefault();
      setBezier(index, clamp(x + delta[0], 0, 1), clamp(y + delta[1], EDITOR.yMin, EDITOR.yMax));
      playTune();
    });
  }
}

function playTune() {
  if ($('#view-tune').hidden) return;
  playAll();
}

function renderCode(r) {
  const code = snippets(r);
  $$('#code-tabs .tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === state.codeTab);
    tab.setAttribute('aria-selected', tab.dataset.tab === state.codeTab);
  });
  $('#code-out').textContent = code[state.codeTab] ?? code.CSS;
}

/* ----------------------------------------------------------------- views */

function setView(view) {
  stopClock();
  $('#view-compare').hidden = view !== 'compare';
  $('#view-tune').hidden = view !== 'tune';
  $$('.views button').forEach((button) => {
    const on = button.dataset.view === view;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-selected', on);
  });
  if (view === 'tune') refreshTune({ rebuildDemo: true });
  playAll();
}

/* ----------------------------------------------------------------- utils */

async function copyText(text, trigger) {
  const label = trigger?.textContent;
  try {
    await navigator.clipboard.writeText(text);
    if (trigger) { trigger.textContent = 'Copied'; setTimeout(() => { trigger.textContent = label; }, 1400); }
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'copy-fallback';
    document.body.append(area);
    area.select();
    if (trigger) { trigger.textContent = 'Select and copy'; setTimeout(() => { trigger.textContent = label; }, 2400); }
    setTimeout(() => area.remove(), 2400);
  }
}

/* ------------------------------------------------------------------ init */

function initControls() {
  const chips = $('#demo-chips');
  for (const demo of DEMOS) {
    const button = document.createElement('button');
    button.className = `chip${demo.id === state.demo ? ' is-active' : ''}`;
    button.textContent = demo.name;
    button.dataset.demo = demo.id;
    button.addEventListener('click', () => {
      state.demo = demo.id;
      $$('#demo-chips .chip').forEach((c) => c.classList.toggle('is-active', c.dataset.demo === demo.id));
      buildGrid();
      refreshTune({ rebuildDemo: true });
      playAll();
    });
    chips.append(button);
  }

  const speeds = $('#speed-chips');
  for (const speed of [1, 0.5, 0.25]) {
    const button = document.createElement('button');
    button.className = `chip${speed === state.speed ? ' is-active' : ''}`;
    button.textContent = `${speed}x`;
    button.dataset.speed = speed;
    button.addEventListener('click', () => {
      state.speed = speed;
      $$('#speed-chips .chip').forEach((c) => c.classList.toggle('is-active', Number(c.dataset.speed) === speed));
      save();
      playAll();
    });
    speeds.append(button);
  }

  const duration = $('#duration');
  duration.value = state.durationMs;
  $('#duration-out').textContent = `${state.durationMs}ms`;
  duration.addEventListener('input', () => {
    state.durationMs = Number(duration.value);
    $('#duration-out').textContent = `${state.durationMs}ms`;
    refreshCards();
    if (!$('#view-tune').hidden) refreshTune();
  });
  duration.addEventListener('change', playAll);

  const loop = $('#loop');
  loop.checked = state.loop;
  loop.disabled = REDUCED;
  loop.addEventListener('change', () => {
    state.loop = loop.checked;
    save();
    playAll();
  });

  $('#replay').addEventListener('click', playAll);
  $$('.views button').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));

  const picker = $('#picker');
  $('#toggle-picker').addEventListener('click', (event) => {
    picker.hidden = !picker.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!picker.hidden));
    if (!picker.hidden) $('#picker-search').focus();
  });
  $('#picker-search').addEventListener('input', (event) => filterPicker(event.target.value));

  $('#tune-easing').addEventListener('change', (event) => {
    state.tune = { id: event.target.value };
    refreshTune();
    playTune();
  });
  $('#tune-duration').addEventListener('input', (event) => {
    state.tune = { ...state.tune, duration: Number(event.target.value) };
    refreshTune();
  });
  $('#tune-bounce').addEventListener('input', (event) => {
    state.tune = { ...state.tune, bounce: Number(event.target.value) };
    refreshTune();
  });
  for (const [key, index, axis] of [['x1', 0, 0], ['y1', 0, 1], ['x2', 1, 0], ['y2', 1, 1]]) {
    $(`#p-${key}`).addEventListener('input', (event) => {
      const value = Number(event.target.value);
      const current = currentBezier();
      const x = axis === 0 ? value : current[index * 2];
      const y = axis === 1 ? value : current[index * 2 + 1];
      setBezier(index, x, y);
    });
  }

  $('#tune-ms').addEventListener('input', (event) => {
    state.tune = { ...state.tune, durationMs: Number(event.target.value) };
    refreshTune();
  });
  $$('#tune-panel input[type="range"]').forEach((input) => input.addEventListener('change', playTune));
  $('#tune-easing').addEventListener('keyup', playTune);

  $('#tune-reset').addEventListener('click', () => {
    state.tune = { id: state.tune.id };
    refreshTune();
    playTune();
  });
  $('#tune-add').addEventListener('click', () => {
    addCard({ ...state.tune });
    setView('compare');
  });
  $('#tune-replay').addEventListener('click', playAll);

  $$('#code-tabs .tab').forEach((tab) => tab.addEventListener('click', () => {
    state.codeTab = tab.dataset.tab;
    renderCode(tuneCard.resolved);
    save();
  }));
  $('#copy-code').addEventListener('click', (event) => copyText($('#code-out').textContent, event.currentTarget));

  document.addEventListener('keydown', (event) => {
    if (event.key !== ' ' || event.target.matches('input, select, textarea, button')) return;
    event.preventDefault();
    playAll();
  });
}

function init() {
  initControls();
  buildGrid();
  buildPicker();
  buildTune();
  initEditorDragging();
  setView('compare');
  if (REDUCED) {
    $('#reduced-note').hidden = false;
    cards.forEach((card) => { card.apply(1); card.plot.setProgress(1); });
  } else {
    setTimeout(playAll, 420);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
