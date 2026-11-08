import { LIBRARY, byId, resolve, snippets, round, clamp } from './easings.js';
import { createPlot, sample, extent, miniCurve } from './curve.js';
import { DEMOS, demoById } from './demos.js';
import { forwardMotion, interruptMotion, traceOf } from './motion.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORE_KEY = 'easing-lab-state-v2';
const HOLD_MS = 700;
const STEPS = 6;          // frames shown in stepped (reduced motion) playback
const STEP_MS = 280;      // how long each of those frames holds
const FULL_MESSAGE = 'Compare holds six curves. Remove one to add another.';
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
  cards: [{ id: 'ease-out' }, { id: 'spring-smooth' }, { id: 'spring-bouncy' }],
  tune: { id: 'spring-bouncy' },
  codeTab: 'CSS',
  pickerGroup: 'All',
  smooth: false,
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
let running = [];     // cards in the current run
let rafId = null;
let holdId = null;
let startTime = 0;
let pendingInterrupt = null; // ms into the run at which to reverse, if scheduled
let lastRun = 'replay';

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

// A single choice: one Tab stop, arrow keys move the choice (the ARIA radio pattern).
function renderFilters(container, items, active, onPick) {
  container.innerHTML = '';
  const options = items.map(({ value, label, name }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter';
    button.setAttribute('role', 'radio');
    button.textContent = label;
    if (name) button.setAttribute('aria-label', name);
    container.append(button);
    return { button, value };
  });
  const select = (index, focus = false) => {
    options.forEach(({ button }, i) => {
      const on = i === index;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    });
    if (focus) options[index].button.focus();
  };
  select(Math.max(0, options.findIndex((o) => o.value === active)));
  options.forEach(({ button, value }, i) => {
    button.addEventListener('click', () => { select(i); onPick(value); });
    button.addEventListener('keydown', (event) => {
      const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: options.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const j = (next + options.length) % options.length;
      select(j, true);
      onPick(options[j].value);
    });
  });
}

// Arrow keys move between tabs and open them (the ARIA tabs pattern).
function wireTabs(tabs) {
  tabs.forEach((tab, i) => tab.addEventListener('keydown', (event) => {
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    target.click();
    target.focus();
  }));
}

function markTabs(tabs, isOn) {
  tabs.forEach((tab) => {
    const on = isOn(tab);
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
}

// Spoken feedback for changes that otherwise only show on screen.
function announce(message) {
  const region = $('#announcer');
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = message; });
}

/* ---------------------------------------------------------------- phones */

function makePhone(size = '') {
  const phone = document.createElement('div');
  phone.className = `phone ${size}`.trim();
  phone.setAttribute('aria-hidden', 'true');
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
  stopClock();
  const grid = $('#grid');
  grid.innerHTML = '';

  cards = state.cards.map((config, index) => {
    const article = document.createElement('article');
    article.className = 'card';
    article.setAttribute('aria-labelledby', `card-${index}-name`);
    article.setAttribute('aria-describedby', `card-${index}-about`);

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
    label.innerHTML = `<h3 id="card-${index}-name"></h3><p></p><p class="sr-only" id="card-${index}-about"></p>`;

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
      if (act === 'copy') {
        copyText(snippets(card.resolved).CSS, () => {
          flashDone(tool);
          announce(`Copied the CSS for ${card.resolved.name}`);
        });
      }
    });

    return card;
  });

  refreshCards();
  updateAddState();
}

function refreshCards() {
  cards.forEach((card) => {
    card.resolved = resolveCard(card.config);
    card.motion = forwardMotion(card.resolved);
  });
  plotRun(cards);
  cards.forEach((card) => {
    const r = card.resolved;
    $('h3', card.label).textContent = r.name;
    $('p', card.label).textContent = shortParams(r);
    $('.sr-only', card.label).textContent = r.def?.blurb ?? '';
    // Name the curve in each button, so three cards don't read as three identical "Remove"s.
    for (const [act, text] of [['copy', `Copy the CSS for ${r.name}`], ['tune', `Open ${r.name} in Tune`], ['remove', `Remove ${r.name}`]]) {
      const button = card.article.querySelector(`[data-act="${act}"]`);
      if (button) { button.setAttribute('aria-label', text); button.title = text; }
    }
    card.apply(REDUCED ? 1 : 0);
    card.plot.setProgress(REDUCED ? 1 : 0);
  });
  save();
}

function addCard(config) {
  if (state.cards.length >= MAX_CARDS) { announce(FULL_MESSAGE); return false; }
  state.cards = [...state.cards, config];
  buildGrid();
  const card = cards.at(-1);
  if (!REDUCED) card.article.classList.add('is-new');
  announce(`Added ${card.resolved.name}. ${cards.length} of ${MAX_CARDS} in Compare.`);
  playAll();
  return true;
}

function removeCard(index) {
  if (state.cards.length <= 1) return;
  const name = cards[index].resolved.name;
  state.cards = state.cards.filter((_, i) => i !== index);
  buildGrid();
  announce(`Removed ${name}. ${cards.length} of ${MAX_CARDS} in Compare.`);
  // Keep focus in the grid, on the card that took this one's place.
  const next = cards[Math.min(index, cards.length - 1)].article;
  (next.querySelector('[data-act="remove"]') || next.querySelector('[data-act="copy"]')).focus();
}

// The Add button stays usable when Compare is full, and says why instead of going dead.
function updateAddState() {
  const full = cards.length >= MAX_CARDS;
  const inCompare = state.view === 'compare';
  $('#picker-count').textContent = inCompare ? `${cards.length} of ${MAX_CARDS} in Compare` : '';
  $('#picker-full').hidden = !(inCompare && full);
  $('#tune-add').setAttribute('aria-disabled', String(full));
  $('#tune-add').title = full ? FULL_MESSAGE : 'Add to Compare';
  if (!$('#picker').hidden) renderPickerTiles();
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

// Every card plays a motion: where it is at each ms of the run. Plain playback
// is the curve from 0 to 1; an interruption joins a reversal onto it.

function stopClock() {
  if (rafId) cancelAnimationFrame(rafId);
  if (holdId) clearTimeout(holdId);
  rafId = null;
  holdId = null;
  pendingInterrupt = null;
}

function activeCards() {
  if (state.view === 'tune') return tuneCard ? [tuneCard] : [];
  return cards;
}

function showEnd(list) {
  list.forEach((card) => { card.apply(1); card.plot.setProgress(1); });
}

// Plot what each card will actually do over the run, on one shared vertical
// scale, so a spring's overshoot reads as larger than a flat finish next to it.
function plotRun(list, markerMs = null) {
  const traces = list.map((card) => traceOf(card.motion));
  const range = extent(traces);
  list.forEach((card, i) => {
    card.plot.setCurve(traces[i], range);
    card.plot.setMarker?.(markerMs === null ? null : markerMs / card.motion.totalMs);
  });
}

// Timing curves are interrupted halfway through, the textbook case.
const interruptPoint = () => Math.round(state.durationMs / 2);

// Reduced motion stops anything starting by itself. An explicit Replay still
// plays, because watching the curve is the whole reason the page exists.
function playAll({ auto = false, interruptAt = null } = {}) {
  stopClock();
  running = activeCards();
  if (!running.length) return;
  lastRun = interruptAt === null ? 'replay' : 'interrupt';
  running.forEach((card) => {
    card.motion = forwardMotion(card.resolved);
    card.target = 1;
  });
  plotRun(running);
  if (REDUCED && auto) { showEnd(running); return; }
  // Stepped playback can't land an interruption mid-step, so it plans the reversal up front.
  if (stepped() && interruptAt !== null) { reverseAt(interruptAt); interruptAt = null; }
  pendingInterrupt = interruptAt;
  startTime = performance.now();
  rafId = requestAnimationFrame(frame);
}

function reverseAt(ms) {
  running.forEach((card) => {
    const to = card.target === 1 ? 0 : 1;
    card.motion = interruptMotion(card.motion, card.resolved, ms, to);
    card.target = to;
  });
  plotRun(running, ms);
  $('#interrupt-note').hidden = false;
  announce('Reversed halfway. Timing curves turn a sharp corner; springs keep their speed and turn smoothly.');
}

// Under reduced motion the page jumps between frames instead of moving, unless the
// visitor chose smooth playback. The meaning (where each curve is at each moment) stays.
const stepped = () => REDUCED && !state.smooth;

// Mid-run, reverse right now; press again to send it back. From rest, play and
// reverse automatically at the halfway point of the timing curves.
function interrupt() {
  if (state.view !== 'compare') return;
  if (!rafId || stepped()) { playAll({ interruptAt: interruptPoint() }); return; }
  pendingInterrupt = null;
  reverseAt((performance.now() - startTime) * state.speed);
}

function frame(now) {
  const elapsed = (now - startTime) * state.speed;
  const step = stepped() ? Math.min(STEPS, Math.floor((now - startTime) / STEP_MS)) : 0;
  if (!stepped() && pendingInterrupt !== null && elapsed >= pendingInterrupt) {
    reverseAt(pendingInterrupt);
    pendingInterrupt = null;
  }
  const lag = state.view === 'tune' ? 0 : demoById(state.demo).lagMs ?? 0;
  let done = true;
  for (const card of running) {
    const { motion } = card;
    const t = stepped() ? (step / STEPS) * (motion.totalMs + lag) : elapsed;
    card.apply(motion.pos(t), (delay) => motion.pos(t - delay));
    card.plot.setProgress(t / motion.totalMs);
    if (stepped() ? step < STEPS : elapsed < motion.totalMs + lag) done = false;
  }
  if (!done) { rafId = requestAnimationFrame(frame); return; }
  rafId = null;
  if (state.loop && !REDUCED) {
    const again = lastRun === 'interrupt' ? interruptPoint() : null;
    holdId = setTimeout(() => {
      running.forEach((card) => { card.apply(0); card.plot.setProgress(0); });
      holdId = setTimeout(() => playAll({ auto: true, interruptAt: again }), 140);
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
  const compare = state.view === 'compare';
  const full = compare && state.cards.length >= MAX_CARDS;
  // Library curves already in Compare, untouched; an edited copy counts as a different curve.
  const added = new Set(state.cards
    .filter((c) => !c.custom && !c.bezier && c.duration === undefined && c.bounce === undefined && c.durationMs === undefined)
    .map((c) => c.id));
  const entries = LIBRARY.filter((e) => state.pickerGroup === 'All' || e.group === state.pickerGroup);
  for (const entry of entries) {
    const isAdded = compare && added.has(entry.id);
    const blocked = isAdded || full;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `tile${isAdded ? ' is-added' : ''}${full && !isAdded ? ' is-blocked' : ''}`;
    tile.title = `${entry.blurb} ${entry.use}`;
    tile.setAttribute('aria-label', `${entry.name}${isAdded ? ', already in Compare' : ''}. ${entry.blurb}`);
    if (blocked) tile.setAttribute('aria-disabled', 'true');
    const box = document.createElement('span');
    box.className = 'tile-box';
    box.append(miniCurve(resolve({ id: entry.id, durationMs: 300 }).fn));
    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = isAdded ? `${entry.name} · added` : entry.name;
    tile.append(box, name);
    tile.addEventListener('click', () => {
      if (blocked) { announce(isAdded ? `${entry.name} is already in Compare.` : FULL_MESSAGE); return; }
      closePicker({ returnFocus: true });
      if (compare) {
        addCard({ id: entry.id });
      } else {
        state.tune = { id: entry.id };
        refreshTune();
        announce(`Tuning ${entry.name}`);
        playAll();
      }
    });
    grid.append(tile);
  }
}

function openPicker() {
  $('#picker').hidden = false;
  updateAddState();
  $('#add-easing').setAttribute('aria-expanded', 'true');
  $('#picker [role="radio"][aria-checked="true"]')?.focus();
}

function closePicker({ returnFocus = false } = {}) {
  if ($('#picker').hidden) return;
  $('#picker').hidden = true;
  $('#add-easing').setAttribute('aria-expanded', 'false');
  if (returnFocus) $('#add-easing').focus();
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
    $('#tune-duration-out').value = r.duration.toFixed(2);
    $('#tune-duration').setAttribute('aria-valuetext', `${r.duration.toFixed(2)} seconds`);
    setRange($('#tune-bounce'), r.bounce);
    $('#tune-bounce-out').value = r.bounce.toFixed(2);
  } else {
    ['x1', 'y1', 'x2', 'y2'].forEach((key, i) => {
      setRange($(`#p-${key}`), r.bezier[i]);
      $(`#o-${key}`).value = String(round(r.bezier[i], 3));
    });
    setRange($('#tune-ms'), Math.round(r.totalMs));
    $('#tune-ms-out').value = Math.round(r.totalMs);
    $('#tune-ms').setAttribute('aria-valuetext', `${Math.round(r.totalMs)} milliseconds`);
    // Don't rewrite the text while someone is typing in it.
    if (document.activeElement !== $('#bezier-text')) $('#bezier-text').value = r.bezier.map((n) => round(n, 3)).join(', ');
  }

  const edited = (config.bezier && base?.bezier && config.bezier.join() !== base.bezier.join())
    || (config.duration !== undefined && config.duration !== base?.duration)
    || (config.bounce !== undefined && config.bounce !== base?.bounce);

  $('#tune-name').textContent = base ? base.name : 'Custom curve';
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
  const which = node.id === 'handle-1' ? 'First' : 'Second';
  node.setAttribute('aria-label', `${which} control point, x ${round(x, 2)}, y ${round(y, 2)}`);
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
  return escapeHtml(code).replace(/(^|[^\w#.-])(-?\d*\.?\d+f?)(?![\w.])/g, '$1<span class="num">$2</span>');
}

function renderCode(r) {
  const code = snippets(r);
  markTabs($$('#code-tabs .code-tab'), (tab) => tab.dataset.tab === state.codeTab);
  $('#code-panel').setAttribute('aria-labelledby', `code-tab-${state.codeTab}`);
  $('#code-out').innerHTML = highlight(code[state.codeTab] ?? code.CSS);
}

/* ----------------------------------------------------------------- views */

function setView(view) {
  stopClock();
  closePicker();
  state.view = view;
  $('#view-compare').hidden = view !== 'compare';
  $('#view-tune').hidden = view !== 'tune';
  markTabs($$('.tabs .tab'), (tab) => tab.dataset.view === view);
  $('#add-easing').firstChild.textContent = view === 'tune' ? 'Change easing' : 'Add easing';
  updateAddState();
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

  const speedNames = { 1: 'Full speed', 0.5: 'Half speed', 0.25: 'Quarter speed' };
  renderFilters($('#speed-chips'), [1, 0.5, 0.25].map((s) => ({ value: s, label: `${s}×`, name: speedNames[s] })), state.speed, (speed) => {
    state.speed = speed;
    save();
    playAll();
  });

  const duration = $('#duration');
  setRange(duration, state.durationMs);
  $('#duration-out').textContent = `${state.durationMs}ms`;
  duration.setAttribute('aria-valuetext', `${state.durationMs} milliseconds`);
  duration.addEventListener('input', () => {
    syncRange(duration);
    state.durationMs = Number(duration.value);
    $('#duration-out').textContent = `${state.durationMs}ms`;
    duration.setAttribute('aria-valuetext', `${state.durationMs} milliseconds`);
    stopClock();
    refreshCards();
    showEnd(cards);
  });
  duration.addEventListener('change', () => playAll());

  const loop = $('#loop');
  loop.setAttribute('aria-pressed', String(state.loop && !REDUCED));
  loop.disabled = REDUCED;
  if (REDUCED) loop.title = 'Looping is off while your system asks for reduced motion';
  loop.addEventListener('click', () => {
    state.loop = !state.loop;
    loop.setAttribute('aria-pressed', String(state.loop));
    save();
    playAll();
  });

  $('#replay').addEventListener('click', () => playAll());
  $('#interrupt').addEventListener('click', interrupt);
  $('#tune-replay').addEventListener('click', () => playAll());
  $$('.tabs .tab').forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
  wireTabs($$('.tabs .tab'));

  const addButton = $('#add-easing');
  addButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if ($('#picker').hidden) openPicker(); else closePicker();
  });
  $('#picker').addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => closePicker());
  // Tabbing out of the dropdown closes it, as a disclosure should.
  $('.bar-end').addEventListener('focusout', (event) => {
    if (event.relatedTarget && !$('.bar-end').contains(event.relatedTarget)) closePicker();
  });

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
  // Typed values apply on Enter or when the field loses focus; anything unusable reverts.
  const commit = (input, apply) => input.addEventListener('change', () => {
    const value = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(value)) { refreshTune(); return; }
    apply(clamp(value, Number(input.min), Number(input.max)));
    playAll();
  });
  for (const [key, index, axis] of [['x1', 0, 0], ['y1', 0, 1], ['x2', 1, 0], ['y2', 1, 1]]) {
    commit($(`#o-${key}`), (value) => {
      const current = currentBezier();
      setBezier(index, axis === 0 ? value : current[index * 2], axis === 1 ? value : current[index * 2 + 1]);
    });
  }
  commit($('#tune-ms-out'), (value) => { state.tune = { ...state.tune, durationMs: Math.round(value) }; refreshTune(); });
  commit($('#tune-duration-out'), (value) => { state.tune = { ...state.tune, duration: value }; refreshTune(); });
  commit($('#tune-bounce-out'), (value) => { state.tune = { ...state.tune, bounce: value }; refreshTune(); });

  const bezierText = $('#bezier-text');
  const help = $('#bezier-help');
  const helpText = help.textContent;
  help.dataset.text = helpText;
  bezierText.addEventListener('change', () => {
    const values = parseBezier(bezierText.value);
    bezierText.setAttribute('aria-invalid', String(!values));
    help.textContent = values ? helpText : 'That isn’t a cubic-bezier. It needs four numbers, and x1 and x2 must be between 0 and 1.';
    help.classList.toggle('is-error', !values);
    if (!values) return;
    loadBezier(values);
    // Show what was understood, e.g. ease-out as its four numbers.
    bezierText.value = values.map((n) => round(n, 3)).join(', ');
  });
  document.addEventListener('paste', (event) => {
    if (state.view !== 'tune' || event.target.matches('input, textarea')) return;
    const values = parseBezier(event.clipboardData?.getData('text') ?? '');
    if (!values) return;
    event.preventDefault();
    loadBezier(values);
  });

  $$('#tune-panel input[type="range"]').forEach((input) => {
    input.addEventListener('pointerdown', stopClock);
    input.addEventListener('change', () => playAll());
  });

  $('#tune-reset').addEventListener('click', () => {
    if (state.tune.custom) { announce('A pasted curve has no original to go back to.'); return; }
    state.tune = { id: state.tune.id };
    refreshTune();
    announce(`Reset ${byId(state.tune.id)?.name ?? 'the curve'}`);
    playAll();
  });
  $('#tune-add').addEventListener('click', () => {
    if (cards.length >= MAX_CARDS) { announce(FULL_MESSAGE); return; }
    const config = { ...state.tune };
    setView('compare');
    addCard(config);
  });

  $$('#code-tabs .code-tab').forEach((tab) => tab.addEventListener('click', () => {
    state.codeTab = tab.dataset.tab;
    renderCode(tuneCard.resolved);
    save();
  }));
  wireTabs($$('#code-tabs .code-tab'));
  $('#copy-code').addEventListener('click', (event) => {
    const button = event.currentTarget;
    copyText($('#code-out').textContent, () => {
      announce(`Copied the ${state.codeTab} code`);
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy'; }, 1200);
    });
  });

  const smooth = $('#smooth');
  const paintSmooth = () => {
    smooth.setAttribute('aria-pressed', String(state.smooth));
    $('#reduced-text').textContent = state.smooth
      ? 'Reduced motion is on. You chose smooth playback; nothing plays by itself.'
      : 'Reduced motion is on, so playback steps through frames instead of moving, and nothing plays by itself.';
  };
  smooth.addEventListener('click', () => { state.smooth = !state.smooth; paintSmooth(); save(); });
  paintSmooth();

  // Two presses, so a stray click can't wipe someone's cards.
  const restore = $('#restore');
  let armed = 0;
  const disarm = () => { clearTimeout(armed); armed = 0; restore.textContent = 'Restore default cards'; };
  restore.addEventListener('click', () => {
    if (!armed) {
      restore.textContent = 'Press again to restore';
      announce('Press again to replace your cards with the defaults.');
      armed = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    state.cards = defaults().cards;
    if (state.view !== 'compare') setView('compare');
    buildGrid();
    announce('Restored the default cards: Ease out, Smooth spring and Bouncy spring.');
    playAll();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closePicker({ returnFocus: !$('#picker').hidden }); return; }
    if (event.key !== ' ' || event.altKey || event.ctrlKey || event.metaKey) return;
    // Space replays from anywhere that doesn't already use it.
    if (event.target.closest('input, select, textarea, button, a, pre, [role="radio"], [role="tab"], [role="button"]')) return;
    event.preventDefault();
    playAll();
  });
}

// Accepts a whole CSS line such as `transition: transform 300ms cubic-bezier(0.17, 0.89,
// 0.32, 1.1)`, Compose's CubicBezierEasing(0.17f, ...), an array, or just four numbers.
// When the text names the curve, only the numbers inside its brackets count, so the
// 300 in 300ms is never mistaken for x1.
const CSS_KEYWORDS = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

function parseBezier(text) {
  const keyword = CSS_KEYWORDS[text.trim().replace(/;$/, '').toLowerCase()];
  if (keyword) return [...keyword];
  const named = text.match(/cubic-?bezier(?:easing)?\s*\(([^)]*)\)/i);
  const numbers = ((named ? named[1] : text).match(/-?\d*\.?\d+/g) || []).map(Number);
  if (numbers.length !== 4) return null;
  const values = numbers;
  if (values.some((n) => !Number.isFinite(n))) return null;
  if (values[0] < 0 || values[0] > 1 || values[2] < 0 || values[2] > 1) return null;
  return values.map((n) => clamp(n, EDITOR.yMin, EDITOR.yMax));
}

// Edits a library timing curve in place; anything else becomes a custom curve.
function loadBezier(values) {
  const help = $('#bezier-help');
  help.classList.remove('is-error');
  help.textContent = help.dataset.text ?? help.textContent;
  $('#bezier-text').setAttribute('aria-invalid', 'false');
  const current = tuneCard.resolved;
  const ms = current.type === 'bezier' ? Math.round(current.totalMs) : state.durationMs;
  const key = (v) => v.map((n) => round(n, 3)).join();
  const known = LIBRARY.find((e) => e.type === 'bezier' && key(e.bezier) === key(values));
  if (known) {
    state.tune = { id: known.id, durationMs: ms };
  } else if (current.type === 'bezier' && !state.tune.custom) {
    state.tune = { ...state.tune, bezier: values };
  } else {
    state.tune = {
      id: 'custom', custom: true, type: 'bezier', name: 'Custom curve', blurb: '', use: '',
      bezier: values, durationMs: ms,
    };
  }
  refreshTune();
  announce(known ? `Loaded ${known.name}` : `Loaded cubic-bezier(${values.join(', ')})`);
  playAll();
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
