// Shared by every variant: the curves, the physics of letting go, drag tracking,
// and the position trace. Imports from the site are read-only.
import { resolve, springMotion, springSettleTime, clamp } from '../../js/easings.js';
import { demoById } from '../../js/demos.js';

export const CURVES = ['ease-out', 'spring-smooth', 'spring-bouncy'].map((id) => resolve({ id, durationMs: 300 }));

// A flick faster than this dismisses whatever the distance (gesture-ui: ~500px/s).
export const FLICK_PX_PER_S = 500;
const ELASTIC = 0.2;       // resistance past fully open
const HISTORY_MS = 160;    // how much of the finger's path the trace shows
const NS = 'http://www.w3.org/2000/svg';

export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function shortParams(r) {
  return r.type === 'spring'
    ? `${r.duration}s · bounce ${r.bounce}`
    : `${r.bezier.join(', ')} · ${Math.round(r.totalMs)}ms`;
}

/* ------------------------------------------------------------ physics */

// What happens after the finger lifts. A spring is solved from the position and
// velocity the finger left it with. A CSS transition has no way to accept a
// starting velocity, so a timing curve runs its curve from the start.
export function releaseMotion(r, from, velocity, to) {
  if (r.type === 'spring') {
    const state = { from, velocity, to };
    const spring = springMotion(r.duration, r.bounce, state);
    const totalMs = springSettleTime(r.duration, r.bounce, state) * 1000;
    return { totalMs, to, pos: (ms) => (ms >= totalMs ? to : spring(clamp(ms, 0, totalMs) / 1000)) };
  }
  const totalMs = r.totalMs;
  return { totalMs, to, pos: (ms) => from + (to - from) * r.fn(clamp(ms / totalMs, 0, 1)) };
}

// Progress per second at ms, from a central difference.
export function speedAt(motion, ms) {
  const a = Math.max(0, ms - 0.5);
  const b = ms + 0.5;
  return ((motion.pos(b) - motion.pos(a)) / (b - a)) * 1000;
}

// Dismiss on distance or speed: past halfway closes, and so does a fast flick down
// from anywhere; a fast flick up reopens from anywhere.
export function decide(p, velocity, sheetPx) {
  const px = velocity * sheetPx;
  if (px <= -FLICK_PX_PER_S) return 0;
  if (px >= FLICK_PX_PER_S) return 1;
  return p < 0.5 ? 0 : 1;
}

export function describe(p, velocity, sheetPx, to) {
  const px = Math.round(Math.abs(velocity * sheetPx));
  const how = px < 40 ? 'from a standstill' : `moving ${velocity < 0 ? 'down' : 'up'} at ${px.toLocaleString()} px/s`;
  const flicked = (to === 0 && p >= 0.5) || (to === 1 && p < 0.5);
  const outcome = to === 0 ? 'dismissed' : 'snapped back open';
  return `Let go ${Math.round(clamp(p, 0, 1) * 100)}% open, ${how}: ${outcome}${flicked ? ' by the flick' : ''}.`;
}

/* --------------------------------------------------------------- phone */

export function makePhone({ large = false } = {}) {
  const phone = el('div', `phone${large ? ' is-large' : ''}`, '<div class="phone-notch"></div><div class="screen"></div>');
  const screen = phone.querySelector('.screen');
  const apply = demoById('sheet').create(screen);
  const sheet = screen.querySelector('.ui-sheet');
  return { phone, screen, sheet, apply };
}

/* ---------------------------------------------------------------- drag */

// Track phase: the sheet is the finger, 1:1, with no easing and no spring.
// Release phase: hand position, velocity and the finger's recent path to `release`.
export function trackDrag(target, { sheetPx, start, move, release }) {
  target.addEventListener('pointerdown', (down) => {
    if (down.button !== 0) return;
    down.preventDefault();
    target.setPointerCapture(down.pointerId);
    target.classList.add('is-dragging');
    const h = sheetPx();
    const p0 = start();
    let samples = [{ t: down.timeStamp, p: p0 }];

    const onMove = (event) => {
      const raw = p0 - (event.clientY - down.clientY) / h;
      const p = raw > 1 ? 1 + (raw - 1) * ELASTIC : Math.max(0, raw);
      samples.push({ t: event.timeStamp, p });
      samples = samples.filter((s) => event.timeStamp - s.t <= 400);
      move(p);
    };

    const onUp = (event) => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      target.classList.remove('is-dragging');
      const last = samples[samples.length - 1];
      // Velocity over the last ~80ms; a finger that stopped before lifting threw nothing.
      const recent = samples.filter((s) => last.t - s.t <= 80);
      const first = recent[0];
      const idle = event.timeStamp - last.t > 50;
      const dt = (last.t - first.t) / 1000;
      const velocity = !idle && dt > 0.008 ? clamp((last.p - first.p) / dt, -14, 14) : 0;
      const history = samples
        .filter((s) => last.t - s.t <= HISTORY_MS)
        .map((s) => ({ t: s.t - last.t, p: s.p }));
      release(last.p, velocity, h, history);
    };

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  });
}

// A finger moving at a constant speed into the release, for throws with no drag.
export function syntheticHistory(p, velocity) {
  const points = [];
  for (let t = -HISTORY_MS; t <= 0; t += 8) points.push({ t, p: p + velocity * (t / 1000) });
  return points;
}

/* --------------------------------------------------------------- trace */

// Position over time around the release: grey for the finger, blue for the curve.
// If the blue line leaves at the grey line's angle, the hand-off was seamless.
export function createTrace({ width = 260, height = 64 } = {}) {
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'plot', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const base = svgEl('line', { class: 'plot-base' });
  const target = svgEl('line', { class: 'plot-target' });
  const mark = svgEl('line', { class: 'plot-marker' });
  const finger = svgEl('path', { class: 'trace-finger', fill: 'none' });
  const ghost = svgEl('path', { class: 'plot-line', fill: 'none' });
  const traced = svgEl('path', { class: 'plot-traced', fill: 'none' });
  const head = svgEl('circle', { class: 'plot-head', r: 3.5 });
  svg.append(base, target, mark, finger, ghost, traced, head);

  let view = { pre: 0, T: 1, lo: 0, hi: 1 };
  let motion = null;
  const x = (ms) => 4 + ((ms + view.pre) / (view.T + view.pre)) * (width - 8);
  const y = (v) => height - 4 - ((v - view.lo) / (view.hi - view.lo || 1)) * (height - 8);
  const pathOf = (pts) => pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
  const sampleMotion = (upTo) => {
    const pts = [];
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const t = (upTo * i) / steps;
      pts.push([t, motion.pos(t)]);
    }
    return pts;
  };

  function set({ history = [], motion: m, T, range, pre }) {
    motion = m;
    view = { pre, T, lo: range[0], hi: range[1] };
    for (const [line, v] of [[base, 0], [target, 1]]) {
      line.setAttribute('x1', 0); line.setAttribute('x2', width);
      line.setAttribute('y1', y(v)); line.setAttribute('y2', y(v));
    }
    mark.setAttribute('visibility', pre ? 'visible' : 'hidden');
    mark.setAttribute('x1', x(0)); mark.setAttribute('x2', x(0));
    mark.setAttribute('y1', 0); mark.setAttribute('y2', height);
    finger.setAttribute('d', history.length ? pathOf(history.map((s) => [s.t, s.p])) : '');
    ghost.setAttribute('d', pathOf(sampleMotion(T)));
    progress(0);
  }

  function progress(ms) {
    if (!motion) return;
    const t = clamp(ms, 0, view.T);
    traced.setAttribute('d', t > 0 ? pathOf(sampleMotion(t)) : '');
    head.setAttribute('cx', x(t));
    head.setAttribute('cy', y(motion.pos(t)));
  }

  return { svg, set, progress };
}

// One vertical scale and one time axis for every card, so shapes compare honestly.
export function sharedView(motions, history) {
  const T = Math.max(...motions.map((m) => m.totalMs));
  let lo = 0;
  let hi = 1;
  for (const m of motions) {
    for (let i = 0; i <= 120; i++) {
      const v = m.pos((T * i) / 120);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  for (const s of history) { lo = Math.min(lo, s.p); hi = Math.max(hi, s.p); }
  const pad = (hi - lo) * 0.08;
  return { T, range: [lo - pad, hi + pad], pre: history.length ? HISTORY_MS : 0 };
}

/* -------------------------------------------------------------- runner */

// Drive each item's motion on one clock until the slowest settles.
export function run(items, onDone) {
  const start = performance.now();
  const T = Math.max(...items.map((i) => i.motion.totalMs));
  let raf = requestAnimationFrame(function frame(now) {
    const ms = now - start;
    for (const item of items) {
      item.set(item.motion.pos(ms));
      item.trace?.progress(ms);
      item.onFrame?.(ms);
    }
    if (ms < T) raf = requestAnimationFrame(frame);
    else { raf = 0; onDone?.(); }
  });
  return () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
}

/* --------------------------------------------------------- card grid */

export function header(stage, title, text) {
  stage.append(el('div', 'proto-head', `<h2>${title}</h2><p>${text}</p>`));
}

export function buildGrid(stage) {
  const grid = el('div', 'grid proto-grid');
  const cards = CURVES.map((r) => {
    const article = el('article', 'card');
    const box = el('div', 'card-box');
    const { phone, screen, sheet, apply } = makePhone();
    const trace = createTrace();
    const wrap = el('div', 'plot-wrap');
    wrap.append(trace.svg);
    box.append(phone, wrap);
    const label = el('div', 'card-label', `<h3>${r.name}</h3><p>${shortParams(r)}</p>`);
    article.append(box, label);
    grid.append(article);
    const card = { r, screen, sheet, trace, p: 0 };
    card.set = (p) => { card.p = p; apply(p); };
    card.set(0);
    return card;
  });
  stage.append(grid);
  return cards;
}

// Release every card from the same position and speed, each with its own curve.
export function releaseAll(cards, { from, velocity, to, history = [] }, onDone) {
  const motions = cards.map((card) => releaseMotion(card.r, from, velocity, to));
  const view = sharedView(motions, history);
  cards.forEach((card, i) => card.trace.set({ history, motion: motions[i], ...view }));
  return run(cards.map((card, i) => ({ set: card.set, trace: card.trace, motion: motions[i] })), onDone);
}
