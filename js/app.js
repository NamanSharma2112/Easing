import { LIBRARY, byId, resolve, snippets, round, clamp } from './easings.js';
import { createPlot, sample, extent, miniCurve } from './curve.js';
import { DEMOS, demoById } from './demos.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORE_KEY = 'easing-lab-state-v2';
const HOLD_MS = 700;
const MAX_CARDS = 6;
const GROUPS = ['All', ...new Set(LIBRARY.map((e) => e.group))];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const defaults = () => ({
  view: 'compare',
  demo: 'sheet',
  durationMs: 300,
  speed: 1,
  loop: false,
  cards: [{ id: 'ease' }, { id: 'spring-smooth' }, { id: 'spring-bouncy' }],
  tune: { id: 'spring-bouncy' },
  codeTab: 'CSS',
  pickerGroup: 'All',
});

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch {
    return defaults();
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

const state = load();
let cards = [];       // live card instances in the compare grid
let tuneCard = null;  // the single preview on the tuning bench
let rafId = null;
let holdId = null;
let startTime = 0;

/* ---------------------------------------------------------------- inputs */

// The slider track is a gradient that fills up to the thumb; it needs the
// value as a 0..1 fraction because CSS cannot read an input's value.
function syncRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  input.style.setProperty('--f', ((Number(input.value) - min) / (max - min)).toFixed(4));
}

function setRange(input, value) {
  input.value = value;
  syncRange(input);
}

function renderFilters(container, items, active, onPick) {
  container.innerHTML = '';
  for (const { value, label } of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter${value === active ? ' is-active' : ''}`;
    button.textContent = label;
    button.setAttribute('aria-pressed', String(value === active));
    button.addEventListener('click', () => {
      $$('.filter', container).forEach((b) => {
        const on = b === button;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      onPick(value);
    });
    container.append(button);
  }
}

/* ---------------------------------------------------------------- phones */

function makePhone(size = '') {
  const phone = document.createElement('div');
  phone.className = `phone ${size}`.trim();
  phone.innerHTML = '<div class="phone-notch"></div><div class="screen"></div>';
  return phone;
}

function shortParams(r) {
  if (r.type === 'spring') return `${round(r.duration, 2)}s · bounce ${round(r.bounce, 2)}`;
  return `${r.bezier.map((n) => round(n, 2)).join(', ')} · ${Math.round(r.totalMs)}ms`;
}

/* --------------------------------------------------------------- compare */

function resolveCard(config) {
  return resolve({ ...config, durationMs: config.durationMs ?? state.durationMs });
}

function toolButton(act, icon, label) {
  return `<button type="button" class="tool-btn" data-act="${act}" aria-label="${label}" title="${label}">
    <svg><use href="#${icon}" /></svg></button>`;
}

function buildGrid() {
  const grid = $('#grid');
  grid.innerHTML = '';

  cards = state.cards.map((config, index) => {
    const article = document.createElement('article');
    article.className = 'card';

    const box = document.createElement('div');
    box.className = 'card-box';
    const phone = makePhone();
    const plot = createPlot({ width: 260, height: 56, inset: 4 });
    const plotWrap = document.createElement('div');
    plotWrap.className = 'plot-wrap';
    plotWrap.append(plot.svg);
    const tools = document.createElement('div');
    tools.className = 'card-tools';
    tools.innerHTML = toolButton('copy', 'i-copy', 'Copy CSS')
      + toolButton('tune', 'i-tune', 'Open in Tune')
      + (state.cards.length > 1 ? toolButton('remove', 'i-close', 'Remove') : '');
    box.append(tools, phone, plotWrap);

    const label = document.createElement('div');
    label.className = 'card-label';
    label.innerHTML = '<h3></h3><p></p>';

    article.append(box, label);
    grid.append(article);

    const card = {
      config, index, article, plot, label,
      apply: demoById(state.demo).create($('.screen', phone)),
      resolved: resolveCard(config),
    };

    article.addEventListener('click', (event) => {
      const tool = event.target.closest('[data-act]');
      if (!tool) { playAll(); return; }
      const act = tool.dataset.act;
      if (act === 'remove') removeCard(index);
      if (act === 'tune') { state.tune = { ...config }; setView('tune'); }
      if (act === 'copy') copyText(snippets(card.resolved).CSS, () => flashDone(tool));
    });

    return card;
  });

  $('#add-easing').disabled = cards.length >= MAX_CARDS;
  refreshCards();
}

function refreshCards() {
  cards.forEach((card) => { card.resolved = resolveCard(card.config); });

  // One vertical scale for every card, so a spring's overshoot reads as larger
  // than a timing curve's flat finish when they sit side by side.
  const curves = cards.map((card) => sample(card.resolved.fn));
  const range = extent(curves);

  cards.forEach((card, i) => {
    const r = card.resolved;
    card.plot.setCurve(curves[i], range);
    $('h3', card.label).textContent = r.name;
    $('p', card.label).textContent = shortParams(r);
    card.apply(REDUCED ? 1 : 0);
    card.plot.setProgress(REDUCED ? 1 : 0);
  });
  save();
}

function addCard(config) {
  if (state.cards.length >= MAX_CARDS) return;
  state.cards = [...state.cards, config];
  buildGrid();
  if (!REDUCED) cards.at(-1).article.classList.add('is-new');
  playAll();
}

function removeCard(index) {
  if (state.cards.length <= 1) return;
  state.cards = state.cards.filter((_, i) => i !== index);
  buildGrid();
}

function flashDone(button) {
  const use = $('use', button);
  const previous = use.getAttribute('href');
  use.setAttribute('href', '#i-check');
  button.classList.add('is-done');
  setTimeout(() => {
    use.setAttribute('href', previous);
    button.classList.remove('is-done');
  }, 1200);
}

/* -------------------------------------------------------------- playback */

function stopClock() {
  if (rafId) cancelAnimationFrame(rafId);
  if (holdId) clearTimeout(holdId);
  rafId = null;
  holdId = null;
}

function activeCards() {
  if (state.view === 'tune') return tuneCard ? [tuneCard] : [];
  return cards;
}

function showEnd(list) {
  list.forEach((card) => { card.apply(1); card.plot.setProgress(1); });
}

// Reduced motion stops anything starting by itself. An explicit Replay still
// plays, because watching the curve is the whole reason the page exists.
function playAll({ auto = false } = {}) {
  stopClock();
  const running = activeCards();
  if (!running.length) return;
  if (REDUCED && auto) { showEnd(running); return; }
  startTime = performance.now();
  rafId = requestAnimationFrame(frame);
}

function frame(now) {
  const running = activeCards();
  const elapsed = (now - startTime) * state.speed;
  let done = true;
  for (const card of running) {
    const p = clamp(elapsed / card.resolved.totalMs, 0, 1);
    card.apply(card.resolved.fn(p), p, card.resolved);
    card.plot.setProgress(p);
    if (p < 1) done = false;
  }
  if (!done) { rafId = requestAnimationFrame(frame); return; }
  rafId = null;
  if (state.loop && !REDUCED) {
    holdId = setTimeout(() => {
      running.forEach((card) => { card.apply(0); card.plot.setProgress(0); });
      holdId = setTimeout(() => playAll({ auto: true }), 140);
    }, HOLD_MS);
  }
}

/* ---------------------------------------------------------------- picker */

function buildPicker() {
  renderFilters(
    $('#picker-filters'),
    GROUPS.map((g) => ({ value: g, label: g })),
    state.pickerGroup,
    (group) => { state.pickerGroup = group; renderPickerTiles(); save(); },
  );
  renderPickerTiles();
}

function renderPickerTiles() {
  const grid = $('#picker-grid');
  grid.innerHTML = '';
  const entries = LIBRARY.filter((e) => state.pickerGroup === 'All' || e.group === state.pickerGroup);
  for (const entry of entries) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    tile.title = `${entry.blurb} ${entry.use}`;
    const box = document.createElement('span');
    box.className = 'tile-box';
    box.append(miniCurve(resolve({ id: entry.id, durationMs: 300 }).fn));
    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = entry.name;
    tile.append(box, name);
    tile.addEventListener('click', () => {
      closePicker();
      if (state.view === 'tune') {
        state.tune = { id: entry.id };
        refreshTune();
        playAll();
      } else {
        addCard({ id: entry.id });
      }
    });
    grid.append(tile);
  }
}

function openPicker() {
  $('#picker').hidden = false;
  $('#add-easing').setAttribute('aria-expanded', 'true');
  $('#picker .filter.is-active')?.focus();
}

function closePicker() {
  if ($('#picker').hidden) return;
  $('#picker').hidden = true;
  $('#add-easing').setAttribute('aria-expanded', 'false');
}

/* ------------------------------------------------------------------ tune */

const EDITOR = { w: 320, h: 320, pad: 34, yMin: -0.6, yMax: 1.6 };
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

// The editor doubles as the playhead display, so the curve you edit is the one you watch run.
let editorPoints = [];
const editorPlot = {
  setCurve(points) { editorPoints = points; },
  setProgress(t) {
    if (!editorPoints.length) return;
    const p = clamp(t, 0, 1);
    const [, v] = editorPoints[Math.round(p * (editorPoints.length - 1))];
    const head = $('#editor-head');
    head.setAttribute('cx', ex(p));
    head.setAttribute('cy', ey(v));
  },
};

function buildTune() {
  const stage = $('#tune-stage');
  stage.innerHTML = '';
  const phone = makePhone('is-large');
  stage.append(phone);
  stage.addEventListener('click', () => playAll());

  tuneCard = {
    config: state.tune,
    plot: editorPlot,
    phone,
    apply: demoById(state.demo).create($('.screen', phone)),
    resolved: resolve(state.tune),
  };
  refreshTune();
}

function refreshTune({ rebuildDemo = false } = {}) {
  if (!tuneCard) return;
  if (rebuildDemo) tuneCard.apply = demoById(state.demo).create($('.screen', tuneCard.phone));

  const config = state.tune;
  const base = byId(config.id);
  const r = resolve({ ...config, durationMs: config.durationMs ?? state.durationMs });
  tuneCard.config = config;
  tuneCard.resolved = r;

  const isSpring = r.type === 'spring';
  $('#spring-controls').hidden = !isSpring;
  $('#bezier-controls').hidden = isSpring;

  if (isSpring) {
    setRange($('#tune-duration'), r.duration);
    $('#tune-duration-out').textContent = r.duration.toFixed(2);
    setRange($('#tune-bounce'), r.bounce);
    $('#tune-bounce-out').textContent = r.bounce.toFixed(2);
  } else {
    ['x1', 'y1', 'x2', 'y2'].forEach((key, i) => {
      setRange($(`#p-${key}`), r.bezier[i]);
      $(`#o-${key}`).textContent = r.bezier[i].toFixed(2);
    });
    setRange($('#tune-ms'), Math.round(r.totalMs));
    $('#tune-ms-out').textContent = Math.round(r.totalMs);
  }

  const edited = (config.bezier && base?.bezier && config.bezier.join() !== base.bezier.join())
    || (config.duration !== undefined && config.duration !== base?.duration)
    || (config.bounce !== undefined && config.bounce !== base?.bounce);

  $('#tune-name').textContent = base ? base.name : 'Custom';
  $('#tune-edited').hidden = !edited;
  $('#tune-params').textContent = isSpring
    ? `${r.duration.toFixed(2)}s, bounce ${r.bounce.toFixed(2)}`
    : `${Math.round(r.totalMs)}ms`;
  $('#tune-settle').textContent = isSpring ? r.settleLabel : '';
  $('#tune-settle').previousElementSibling.hidden = !isSpring;
  $('#tune-blurb').textContent = base ? base.blurb : '';
  $('#use-note').textContent = base ? base.use : '';

  const points = sample(r.fn);
  editorPlot.setCurve(points);
  drawEditor(r, points);
  editorPlot.setProgress(REDUCED || !rafId ? 1 : 0);
  if (!rafId) tuneCard.apply(1);
  renderCode(r);
  save();
}

function drawEditor(r, points) {
  const svg = $('#editor-svg');

  // Fit the drawing to whatever the curve does, so overshoot is never clipped.
  const values = points.map(([, v]) => v);
  if (r.type === 'bezier') values.push(r.bezier[1], r.bezier[3]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(1, ...values);
  const margin = (hi - lo) * 0.06;
  editorRange = [lo - margin, hi + margin];

  for (const [id, value] of [['#guide-one', 1], ['#guide-zero', 0]]) {
    const line = $(id, svg);
    line.setAttribute('y1', ey(value).toFixed(2));
    line.setAttribute('y2', ey(value).toFixed(2));
  }

  $('#editor-curve', svg).setAttribute('d',
    points.map(([t, v], i) => `${i ? 'L' : 'M'}${ex(t).toFixed(1)} ${ey(v).toFixed(1)}`).join(' '));

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
  node.setAttribute('aria-valuetext', `${round(x, 2)}, ${round(y, 2)}`);
}

function currentBezier() {
  return state.tune.bezier ?? byId(state.tune.id)?.bezier ?? [0.25, 0.1, 0.25, 1];
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
  for (const [id, index] of [['handle-1', 0], ['handle-2', 1]]) {
    const handle = $(`#${id}`, svg);

    const move = (event) => {
      const rect = svg.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * EDITOR.w;
      const py = ((event.clientY - rect.top) / rect.height) * EDITOR.h;
      setBezier(index, invX(px), invY(py));
    };

    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      stopClock();
      handle.setPointerCapture(event.pointerId);
      handle.classList.add('is-dragging');
      const up = () => {
        handle.classList.remove('is-dragging');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        playAll();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });

    handle.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 0.1 : 0.01;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      const delta = moves[event.key];
      if (!delta) return;
      event.preventDefault();
      const x = Number(handle.dataset.x) + delta[0];
      const y = Number(handle.dataset.y) + delta[1];
      setBezier(index, clamp(x, 0, 1), clamp(y, EDITOR.yMin, EDITOR.yMax));
    });
    handle.addEventListener('keyup', (event) => { if (event.key.startsWith('Arrow')) playAll(); });
  }
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Dim bare numbers the way easing.dev does, so the curve values stand apart from the syntax.
function highlight(code) {
  return escapeHtml(code).replace(/(^|[^\w#.-])(-?\d*\.?\d+)(?![\w.])/g, '$1<span class="num">$2</span>');
}

function renderCode(r) {
  const code = snippets(r);
  $$('#code-tabs .code-tab').forEach((tab) => {
    const on = tab.dataset.tab === state.codeTab;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', String(on));
  });
  $('#code-out').innerHTML = highlight(code[state.codeTab] ?? code.CSS);
}

/* ----------------------------------------------------------------- views */

function setView(view) {
  stopClock();
  closePicker();
  state.view = view;
  $('#view-compare').hidden = view !== 'compare';
  $('#view-tune').hidden = view !== 'tune';
  $$('.tabs .tab').forEach((tab) => {
    const on = tab.dataset.view === view;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', String(on));
  });
  $('#add-easing').firstChild.textContent = view === 'tune' ? 'Change easing' : 'Add easing';
  $('#add-easing').disabled = view === 'compare' && cards.length >= MAX_CARDS;
  if (view === 'tune') refreshTune({ rebuildDemo: true });
  save();
  playAll();
}

/* ----------------------------------------------------------------- utils */

async function copyText(text, onDone) {
  try {
    await navigator.clipboard.writeText(text);
    onDone?.();
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'copy-fallback';
    document.body.append(area);
    area.select();
    try { document.execCommand('copy'); onDone?.(); } catch { /* the text stays selected for a manual copy */ }
    setTimeout(() => area.remove(), 2000);
  }
}

/* ------------------------------------------------------------------ init */

function initControls() {
  renderFilters($('#demo-chips'), DEMOS.map((d) => ({ value: d.id, label: d.name })), state.demo, (id) => {
    state.demo = id;
    buildGrid();
    refreshTune({ rebuildDemo: true });
    playAll();
  });

  renderFilters($('#speed-chips'), [1, 0.5, 0.25].map((s) => ({ value: s, label: `${s}×` })), state.speed, (speed) => {
    state.speed = speed;
    save();
    playAll();
  });

  const duration = $('#duration');
  setRange(duration, state.durationMs);
  $('#duration-out').textContent = `${state.durationMs}ms`;
  duration.addEventListener('input', () => {
    syncRange(duration);
    state.durationMs = Number(duration.value);
    $('#duration-out').textContent = `${state.durationMs}ms`;
    stopClock();
    refreshCards();
    showEnd(cards);
  });
  duration.addEventListener('change', () => playAll());

  const loop = $('#loop');
  loop.setAttribute('aria-pressed', String(state.loop && !REDUCED));
  loop.disabled = REDUCED;
  loop.addEventListener('click', () => {
    state.loop = !state.loop;
    loop.setAttribute('aria-pressed', String(state.loop));
    save();
    playAll();
  });

  $('#replay').addEventListener('click', () => playAll());
  $('#tune-replay').addEventListener('click', () => playAll());
  $$('.tabs .tab').forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));

  const addButton = $('#add-easing');
  addButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if ($('#picker').hidden) openPicker(); else closePicker();
  });
  $('#picker').addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', closePicker);

  for (const [key, index, axis] of [['x1', 0, 0], ['y1', 0, 1], ['x2', 1, 0], ['y2', 1, 1]]) {
    $(`#p-${key}`).addEventListener('input', (event) => {
      const value = Number(event.target.value);
      const current = currentBezier();
      setBezier(index, axis === 0 ? value : current[index * 2], axis === 1 ? value : current[index * 2 + 1]);
    });
  }
  $('#tune-ms').addEventListener('input', (event) => {
    state.tune = { ...state.tune, durationMs: Number(event.target.value) };
    refreshTune();
  });
  $('#tune-duration').addEventListener('input', (event) => {
    state.tune = { ...state.tune, duration: Number(event.target.value) };
    refreshTune();
  });
  $('#tune-bounce').addEventListener('input', (event) => {
    state.tune = { ...state.tune, bounce: Number(event.target.value) };
    refreshTune();
  });
  $$('#tune-panel input[type="range"]').forEach((input) => {
    input.addEventListener('pointerdown', stopClock);
    input.addEventListener('change', () => playAll());
  });

  $('#tune-reset').addEventListener('click', () => {
    state.tune = { id: state.tune.id };
    refreshTune();
    playAll();
  });
  $('#tune-add').addEventListener('click', () => {
    const config = { ...state.tune };
    setView('compare');
    addCard(config);
  });

  $$('#code-tabs .code-tab').forEach((tab) => tab.addEventListener('click', () => {
    state.codeTab = tab.dataset.tab;
    renderCode(tuneCard.resolved);
    save();
  }));
  $('#copy-code').addEventListener('click', (event) => {
    const button = event.currentTarget;
    copyText($('#code-out').textContent, () => {
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy'; }, 1200);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closePicker(); return; }
    if (event.key !== ' ' || event.target.matches('input, select, textarea, button, [tabindex]')) return;
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
  setView(state.view === 'tune' ? 'tune' : 'compare');
  if (REDUCED) {
    $('#reduced-note').hidden = false;
    showEnd(activeCards());
  } else {
    stopClock();
    activeCards().forEach((card) => { card.apply(0); card.plot.setProgress(0); });
    setTimeout(() => playAll({ auto: true }), 400);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
