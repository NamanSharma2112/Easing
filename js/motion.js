// A motion is where something is at any moment of a run: pos(ms) for ms since
// the run began, and totalMs, when it comes to rest. Plain playback is one
// motion; an interruption joins a second motion onto the first.
import { clamp, springMotion, springSettleTime } from './easings.js';

export function forwardMotion(r) {
  const total = r.totalMs;
  return { totalMs: total, pos: (ms) => r.fn(clamp(ms / total, 0, 1)) };
}

// Central difference, in progress units per second.
function velocityAt(motion, ms) {
  const a = Math.max(0, ms - 1);
  const b = ms + 1;
  return ((motion.pos(b) - motion.pos(a)) / (b - a)) * 1000;
}

// Reverse a motion at atMs towards `to`, the way each kind of curve really behaves.
export function interruptMotion(motion, r, atMs, to) {
  const from = motion.pos(atMs);
  let next;
  let nextTotal;

  if (r.type === 'spring') {
    // A spring carries its position and velocity into the new target, so the
    // turn is smooth.
    const start = { from, velocity: velocityAt(motion, atMs), to };
    const spring = springMotion(r.duration, r.bounce, start);
    nextTotal = springSettleTime(r.duration, r.bounce, start) * 1000;
    next = (ms) => spring(Math.min(ms, nextTotal) / 1000);
  } else {
    // A CSS transition reversed mid-flight is shortened by how far it had come,
    // then runs the same curve again from its start. It keeps none of the speed
    // it had, so velocity jumps to whatever the curve starts with; that jump is
    // what reads as a stutter.
    nextTotal = r.totalMs * clamp(Math.abs(from - to), 0.05, 1);
    next = (ms) => from + (to - from) * r.fn(clamp(ms / nextTotal, 0, 1));
  }

  return {
    totalMs: atMs + nextTotal,
    pos: (ms) => (ms < atMs ? motion.pos(ms) : next(ms - atMs)),
  };
}

// Position over the whole run, normalised to [0, 1] on the time axis for plotting.
export function traceOf(motion, count = 240) {
  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push([t, motion.pos(t * motion.totalMs)]);
  }
  return points;
}
