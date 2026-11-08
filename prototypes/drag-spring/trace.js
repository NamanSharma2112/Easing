// Variant 3, Trace: one large sheet and its speed over time. The hand-off is read
// as numbers: the speed your finger let go at, against the speed each curve starts at.
import { CURVES, makePhone, trackDrag, releaseMotion, speedAt, decide, describe, run, header, el, shortParams } from './shared.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 480;
const H = 260;
const PAD = { l: 58, r: 14, t: 18, b: 30 };
const PRE = 160;

const svgEl = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
const fmt = (n) => Math.round(n).toLocaleString().replace('-', '−');

export function trace(stage) {
  header(stage, 'Follow the speed',
    'One sheet, measured. Drag it down and let go: the chart shows how fast your finger was moving, then how fast each curve starts. A line that carries on is a seamless hand-off; a step is the stutter.');

  const layout = el('div', 'trace-layout');
  const { phone, screen, sheet, apply } = makePhone({ large: true });
  const left = el('div', 'trace-phone');
  left.append(phone);
  const side = el('div', 'trace-side');
  const chart = el('div', 'speed-chart');
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'speed-svg', role: 'img', 'aria-label': 'Speed over time around the release' });
  chart.append(svg);
  const list = el('div', 'speed-list', '');
  const readout = el('p', 'proto-readout', '');
  side.append(chart, list, readout);
  layout.append(left, side);
  stage.append(layout);

  let selected = 1;
  let position = 0;
  let lastThrow = null;
  let stop = null;
  let reopen = 0;
  let playhead = null;
  const set = (v) => { position = v; apply(v); };
  const halt = () => { stop?.(); stop = null; clearTimeout(reopen); };
  set(0);

  // Curve rows double as the selector; after a throw they show each start speed.
  const rows = CURVES.map((r, i) => {
    const row = el('button', 'speed-row', `<strong>${r.name}</strong><span class="speed-params">${shortParams(r)}</span><span class="speed-start"></span>`);
    row.type = 'button';
    row.addEventListener('click', () => {
      selected = i;
      paintRows();
      if (lastThrow) play(lastThrow); else present();
    });
    list.append(row);
    return row;
  });

  function paintRows(starts) {
    rows.forEach((row, i) => {
      row.classList.toggle('is-active', i === selected);
      row.setAttribute('aria-pressed', String(i === selected));
      const cell = row.querySelector('.speed-start');
      if (!starts) { cell.textContent = ''; return; }
      const { start, finger } = starts[i];
      const gap = Math.abs(start - finger);
      const matches = gap <= Math.max(60, Math.abs(finger) * 0.12);
      cell.innerHTML = `starts at ${fmt(start)} px/s <em class="${matches ? 'is-match' : 'is-step'}">${matches ? 'carries on' : `step of ${fmt(gap)}`}</em>`;
    });
  }

  function emptyChart() {
    svg.replaceChildren(svgEl('rect', { x: 0.5, y: 0.5, width: W - 1, height: H - 1, rx: 8, class: 'speed-frame' }));
    const hint = svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'speed-hint' });
    hint.textContent = 'Drag the sheet down and let go';
    svg.append(hint);
    playhead = null;
  }

  function drawChart({ history, motions, h, to }) {
    const T = Math.min(1200, Math.max(...motions.map((m) => m.totalMs)));
    // finger speed, smoothed over neighbouring samples
    const finger = [];
    for (let i = 1; i < history.length; i++) {
      const dt = history[i].t - history[i - 1].t;
      if (dt <= 0) continue;
      finger.push([(history[i].t + history[i - 1].t) / 2, ((history[i].p - history[i - 1].p) / dt) * 1000 * h]);
    }
    const smooth = finger.map(([t], i) => {
      const win = finger.slice(Math.max(0, i - 1), i + 2);
      return [t, win.reduce((s, [, v]) => s + v, 0) / win.length];
    });
    const series = motions.map((m) => {
      const pts = [];
      for (let k = 0; k <= 180; k++) { const t = (T * k) / 180; pts.push([t, speedAt(m, t) * h]); }
      return pts;
    });
    let lo = 0;
    let hi = 0;
    for (const [, v] of [...smooth, ...series.flat()]) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = (hi - lo) * 0.1 || 100;
    lo -= pad; hi += pad;
    const x = (t) => PAD.l + ((t + PRE) / (T + PRE)) * (W - PAD.l - PAD.r);
    const y = (v) => PAD.t + ((hi - v) / (hi - lo)) * (H - PAD.t - PAD.b);
    const path = (pts) => pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

    svg.replaceChildren(svgEl('rect', { x: 0.5, y: 0.5, width: W - 1, height: H - 1, rx: 8, class: 'speed-frame' }));
    svg.append(svgEl('line', { x1: PAD.l, x2: W - PAD.r, y1: y(0), y2: y(0), class: 'speed-zero' }));
    svg.append(svgEl('line', { x1: x(0), x2: x(0), y1: PAD.t - 6, y2: H - PAD.b, class: 'speed-release' }));
    const label = (text, attrs) => { const t = svgEl('text', attrs); t.textContent = text; svg.append(t); };
    label('let go', { x: x(0) + 6, y: PAD.t + 4, class: 'speed-axis' });
    label('opening', { x: 10, y: PAD.t + 6, class: 'speed-axis' });
    label('closing', { x: 10, y: H - PAD.b, class: 'speed-axis' });
    label('0', { x: PAD.l - 8, y: y(0) + 4, 'text-anchor': 'end', class: 'speed-axis' });
    label('px/s', { x: PAD.l - 8, y: y(0) + 17, 'text-anchor': 'end', class: 'speed-axis is-faint' });
    for (let t = 250; t <= T; t += 250) label(`+${t}ms`, { x: x(t), y: H - 10, 'text-anchor': 'middle', class: 'speed-axis' });

    series.forEach((pts, i) => {
      if (i === selected) return;
      svg.append(svgEl('path', { d: path(pts), class: 'speed-other', fill: 'none' }));
      svg.append(svgEl('circle', { cx: x(0), cy: y(pts[0][1]), r: 3, class: 'speed-dot-other' }));
    });
    svg.append(svgEl('path', { d: path(smooth), class: 'speed-finger', fill: 'none' }));
    svg.append(svgEl('path', { d: path(series[selected]), class: 'speed-selected', fill: 'none' }));
    svg.append(svgEl('circle', { cx: x(0), cy: y(series[selected][0][1]), r: 4.5, class: 'speed-dot' }));
    playhead = svgEl('line', { x1: x(0), x2: x(0), y1: PAD.t, y2: H - PAD.b, class: 'speed-playhead' });
    svg.append(playhead);
    playhead.dataset.scale = JSON.stringify({ T, PRE, l: PAD.l, w: W - PAD.l - PAD.r });

    readout.textContent = describe(lastThrow.p, lastThrow.velocity, h, to);
  }

  const movePlayhead = (ms) => {
    if (!playhead) return;
    const { T, PRE: pre, l, w } = JSON.parse(playhead.dataset.scale);
    const px = l + ((Math.min(ms, T) + pre) / (T + pre)) * w;
    playhead.setAttribute('x1', px); playhead.setAttribute('x2', px);
  };

  function play(t) {
    halt();
    const to = decide(t.p, t.velocity, t.h);
    const motions = CURVES.map((r) => releaseMotion(r, t.p, t.velocity, to));
    const finger = t.velocity * t.h;
    paintRows(motions.map((m) => ({ start: speedAt(m, 0) * t.h, finger })));
    drawChart({ history: t.history, motions, h: t.h, to });
    set(t.p);
    stop = run([{ set, motion: motions[selected], onFrame: movePlayhead }], () => {
      if (to === 0) reopen = setTimeout(present, 700);
    });
  }

  function present() {
    halt();
    stop = run([{ set, motion: releaseMotion(CURVES[selected], 0, 0, 1) }]);
  }

  trackDrag(screen, {
    sheetPx: () => sheet.offsetHeight,
    start: () => { halt(); return position; },
    move: set,
    release: (p, velocity, h, history) => {
      lastThrow = { p, velocity, h, history };
      play(lastThrow);
    },
  });

  paintRows();
  emptyChart();
  readout.textContent = 'Pick a curve, then drag. Picking another curve replays your last throw with it.';
  present();
  return halt;
}
