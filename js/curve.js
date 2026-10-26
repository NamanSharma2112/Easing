// SVG plot of a curve: faint full path, bright traced path, moving head.
import { clamp } from './easings.js';

const NS = 'http://www.w3.org/2000/svg';
const SAMPLES = 120;

function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function sample(fn, count = SAMPLES) {
  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push([t, fn(t)]);
  }
  return points;
}

export function extent(curves) {
  let min = 0, max = 1;
  for (const points of curves) {
    for (const [, y] of points) {
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

// Builds a plot and returns handles to update it without rebuilding the DOM.
export function createPlot({ width = 260, height = 96, inset = 8 } = {}) {
  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'plot',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });

  const target = el('line', { class: 'plot-target', x1: inset, x2: width - inset });
  const base = el('line', { class: 'plot-base', x1: inset, x2: width - inset });
  const ghost = el('path', { class: 'plot-ghost', d: '', fill: 'none' });
  const full = el('path', { class: 'plot-line', d: '', fill: 'none' });
  const traced = el('path', { class: 'plot-traced', d: '', fill: 'none' });
  const head = el('circle', { class: 'plot-head', r: 3.5, cx: inset, cy: height - inset });
  svg.append(base, target, ghost, full, traced, head);

  let points = [];
  let range = [0, 1];

  const x = (t) => inset + t * (width - inset * 2);
  const y = (v) => {
    const [lo, hi] = range;
    const norm = (v - lo) / (hi - lo || 1);
    return height - inset - norm * (height - inset * 2);
  };
  const path = (pts) => pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');

  function setCurve(nextPoints, nextRange, ghostPoints) {
    points = nextPoints;
    range = nextRange || [0, 1];
    base.setAttribute('y1', y(0));
    base.setAttribute('y2', y(0));
    target.setAttribute('y1', y(1));
    target.setAttribute('y2', y(1));
    full.setAttribute('d', path(points));
    ghost.setAttribute('d', ghostPoints ? path(ghostPoints) : '');
    setProgress(1);
  }

  function setProgress(t) {
    const p = clamp(t, 0, 1);
    const cut = Math.max(1, Math.round(p * (points.length - 1)));
    traced.setAttribute('d', path(points.slice(0, cut + 1)));
    const [, v] = points[cut] || [0, 0];
    head.setAttribute('cx', x(p));
    head.setAttribute('cy', y(v));
  }

  return { svg, setCurve, setProgress };
}

// Small static curve used in the picker and the library list.
export function miniCurve(fn, { width = 44, height = 26 } = {}) {
  const pts = sample(fn, 32);
  const [lo, hi] = extent([pts]);
  const x = (t) => 2 + t * (width - 4);
  const y = (v) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6);
  const d = pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'mini', 'aria-hidden': 'true' });
  svg.append(el('path', { d, class: 'mini-line', fill: 'none' }));
  return svg;
}
