// Easing math and the curve library.
// Every curve is exposed the same way: a pure function of normalised time t in [0,1]
// that returns a progress value (which may overshoot past 1 or dip below 0).

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ---------------------------------------------------------------- beziers */

// Standard CSS cubic-bezier with fixed endpoints at (0,0) and (1,1).
// Newton-Raphson with a bisection fallback, the same approach browsers use.
export function cubicBezier(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a;
  const B = (a, b) => 3 * b - 6 * a;
  const C = (a) => 3 * a;
  const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);

  if (x1 === y1 && x2 === y2) return (t) => t; // linear

  return function bezier(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const slp = slope(u, x1, x2);
      if (slp === 0) break;
      const err = calc(u, x1, x2) - t;
      if (Math.abs(err) < 1e-6) return calc(u, y1, y2);
      u -= err / slp;
    }
    let lo = 0, hi = 1;
    u = t;
    for (let i = 0; i < 24; i++) {
      const err = calc(u, x1, x2) - t;
      if (Math.abs(err) < 1e-6) break;
      if (err > 0) hi = u; else lo = u;
      u = (lo + hi) / 2;
    }
    return calc(u, y1, y2);
  };
}

/* ---------------------------------------------------------------- springs */

// Duration + bounce, the parameterisation used by SwiftUI's Spring(duration:bounce:)
// and by Motion's spring({ duration, bounce }). It is friendlier than
// stiffness/damping/mass because both numbers mean something you can see.
//
//   bounce  > 0  underdamped, overshoots and settles back
//   bounce == 0  critically damped, the fastest approach with no overshoot
//   bounce  < 0  overdamped, slides in slowly with no overshoot
//
// springMotion solves the general case: start anywhere, at any speed, heading for
// any target. That is what makes a spring interruptible: when the target changes
// mid-flight it carries its current position and velocity into the new motion.
// Time is in seconds, velocity in progress units per second.
export function springMotion(duration, bounce, { from = 0, velocity = 0, to = 1 } = {}) {
  const d = Math.max(0.05, duration);
  const zeta = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
  const w0 = (2 * Math.PI) / d;
  const y0 = from - to;
  const v0 = velocity;
  let offset;

  if (Math.abs(zeta - 1) < 1e-4) {
    const b = v0 + w0 * y0;
    offset = (tau) => (y0 + b * tau) * Math.exp(-w0 * tau);
  } else if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const b = (v0 + zeta * w0 * y0) / wd;
    offset = (tau) => Math.exp(-zeta * w0 * tau) * (y0 * Math.cos(wd * tau) + b * Math.sin(wd * tau));
  } else {
    const r = w0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * w0 + r;
    const r2 = -zeta * w0 - r;
    const c1 = (v0 - r2 * y0) / (r1 - r2);
    const c2 = y0 - c1;
    offset = (tau) => c1 * Math.exp(r1 * tau) + c2 * Math.exp(r2 * tau);
  }
  return (tau) => to + offset(tau);
}

// The plain 0 to 1 spring, starting at rest.
export const springFunction = (duration, bounce) => springMotion(duration, bounce);

// The spring keeps moving after its nominal duration. Find the point where it is
// close enough to the target to stop drawing and stop animating.
export function springSettleTime(duration, bounce, state = {}, epsilon = 0.001) {
  const motion = springMotion(duration, bounce, state);
  const to = state.to ?? 1;
  const limit = Math.max(duration * 4, duration + 2);
  const step = limit / 600;
  let settled = 0;
  for (let tau = 0; tau <= limit; tau += step) {
    if (Math.abs(motion(tau) - to) > epsilon) settled = tau;
  }
  return Math.min(limit, settled + step * 2);
}

/* ------------------------------------------------------------ the library */

const bez = (name, group, v, blurb, use) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name, group, type: 'bezier', bezier: v, blurb, use,
});

const spr = (id, name, duration, bounce, blurb, use) => ({
  id, name, group: 'Springs', type: 'spring', duration, bounce, blurb, use,
});

export const LIBRARY = [
  bez('Linear', 'Standard', [0, 0, 1, 1],
    'Constant speed from start to finish.',
    'Loading spinners, progress bars, anything mechanical. Almost never for things that move on screen.'),
  bez('Ease', 'Standard', [0.25, 0.1, 0.25, 1],
    'The CSS default. Quick to get going, long slow tail.',
    'A safe fallback, but the asymmetry is stronger than most people expect.'),
  bez('Ease in', 'Standard', [0.42, 0, 1, 1],
    'Starts still, ends at full speed.',
    'Only for things leaving the screen. Used on an entrance it feels like a stall.'),
  bez('Ease out', 'Standard', [0, 0, 0.58, 1],
    'Starts at full speed, glides to a stop.',
    'The workhorse for anything arriving: menus, sheets, hovers, newly inserted rows.'),
  bez('Ease in out', 'Standard', [0.42, 0, 0.58, 1],
    'Symmetric: eases away and eases back in.',
    'Movement that starts and ends on screen, like a card sliding across a carousel.'),

  bez('Sine in', 'Power', [0.12, 0, 0.39, 0], 'The gentlest acceleration.', 'Barely-there motion on small elements.'),
  bez('Sine out', 'Power', [0.61, 1, 0.88, 1], 'The gentlest deceleration.', 'Subtle fades and short travel.'),
  bez('Sine in out', 'Power', [0.37, 0, 0.63, 1], 'Soft on both ends.', 'Ambient loops and slow transitions.'),
  bez('Quad in', 'Power', [0.11, 0, 0.5, 0], 'Mild acceleration.', 'Short exits.'),
  bez('Quad out', 'Power', [0.5, 1, 0.89, 1], 'Mild deceleration.', 'Small entrances where ease out feels too soft.'),
  bez('Quad in out', 'Power', [0.45, 0, 0.55, 1], 'Mild on both ends.', 'A calmer ease-in-out.'),
  bez('Cubic in', 'Power', [0.32, 0, 0.67, 0], 'Noticeable build-up.', 'Dismissals that should feel decisive.'),
  bez('Cubic out', 'Power', [0.33, 1, 0.68, 1], 'Strong arrival, clean stop.', 'The most reliable entrance curve after ease out.'),
  bez('Cubic in out', 'Power', [0.65, 0, 0.35, 1], 'Confident both ways.', 'Page and view transitions.'),
  bez('Quart in', 'Power', [0.5, 0, 0.75, 0], 'Slow start, fast finish.', 'Elements thrown off screen.'),
  bez('Quart out', 'Power', [0.25, 1, 0.5, 1], 'Very fast arrival then a long settle.', 'Large surfaces that need to feel light.'),
  bez('Quart in out', 'Power', [0.76, 0, 0.24, 1], 'Long hold at both ends, fast middle.', 'Travel over a long distance.'),
  bez('Expo in', 'Power', [0.7, 0, 0.84, 0], 'Almost nothing, then everything.', 'Exits that should disappear.'),
  bez('Expo out', 'Power', [0.16, 1, 0.3, 1], 'Snaps to near-final position immediately.', 'Reveals that should feel instant but not harsh.'),
  bez('Expo in out', 'Power', [0.87, 0, 0.13, 1], 'Extreme hold, extreme rush.', 'Dramatic full-screen moves. Easy to overdo.'),
  bez('Circ in', 'Power', [0.55, 0, 1, 0.45], 'Arc-shaped build-up.', 'Mechanical exits.'),
  bez('Circ out', 'Power', [0, 0.55, 0.45, 1], 'Arc-shaped stop.', 'Motion that should feel weighty.'),
  bez('Circ in out', 'Power', [0.85, 0, 0.15, 1], 'Heavy at the ends, quick through the middle.', 'Big objects with mass.'),

  bez('Back in', 'Expressive', [0.36, 0, 0.66, -0.56],
    'Pulls back before moving, like winding up.',
    'An element bracing itself before it exits.'),
  bez('Back out', 'Expressive', [0.34, 1.56, 0.64, 1],
    'Overshoots the target, then returns.',
    'Playful entrances. The cheapest way to fake a spring with plain CSS.'),
  bez('Back in out', 'Expressive', [0.68, -0.6, 0.32, 1.6],
    'Anticipation and overshoot together.',
    'Toys, games, mascots. Too much for most product UI.'),

  bez('Material standard', 'System', [0.2, 0, 0, 1],
    'Material 3 standard. Sharp start, very long settle.',
    'Android default for most transitions.'),
  bez('Material decelerate', 'System', [0.05, 0.7, 0.1, 1],
    'Material 3 emphasized decelerate.',
    'Elements entering the screen on Android.'),
  bez('Material accelerate', 'System', [0.3, 0, 0.8, 0.15],
    'Material 3 emphasized accelerate.',
    'Elements leaving the screen on Android.'),

  spr('spring-smooth', 'Smooth spring', 0.5, 0,
    'Critically damped. Reaches the target as fast as possible without passing it.',
    'The default for interface motion. Looks like ease out but keeps velocity if interrupted.'),
  spr('spring-subtle', 'Subtle spring', 0.4, 0.15,
    'A hint of overshoot you feel more than see.',
    'Buttons, toggles, small state changes.'),
  spr('spring-bouncy', 'Bouncy spring', 0.5, 0.3,
    'Clear overshoot and one visible settle.',
    'Sheets, popovers and anything that should feel physical.'),
  spr('spring-snappy', 'Snappy spring', 0.3, 0.15,
    'Short duration with a light bounce.',
    'Direct manipulation: drag release, swipe to dismiss.'),
  spr('spring-playful', 'Playful spring', 0.6, 0.5,
    'Large overshoot and several oscillations.',
    'Onboarding, empty states, celebration moments.'),
  spr('spring-heavy', 'Heavy spring', 0.9, 0.2,
    'Slow and massive, with a late bounce.',
    'Large surfaces where the weight is the point.'),
  spr('spring-damped', 'Damped spring', 0.5, -0.25,
    'Overdamped. Creeps towards the target and never passes it.',
    'Dismissals that should feel like they are being absorbed.'),
];

export const byId = (id) => LIBRARY.find((e) => e.id === id);

/* ------------------------------------------------- resolving to a function */

// Turns a card config into everything the renderer needs:
// a function over normalised time, the total time it occupies, and a label.
export function resolve(config) {
  const base = config.custom ? config : byId(config.id);
  if (!base) return resolve({ id: 'ease' });

  if (base.type === 'spring') {
    const duration = config.duration ?? base.duration;
    const bounce = config.bounce ?? base.bounce;
    const settle = springSettleTime(duration, bounce);
    const motion = springFunction(duration, bounce);
    return {
      def: base,
      name: base.name,
      type: 'spring',
      duration, bounce,
      totalMs: settle * 1000,
      params: `duration ${duration.toFixed(2)}s · bounce ${bounce.toFixed(2)}`,
      settleLabel: `settles ${settle.toFixed(2)}s`,
      fn: (t) => motion(t * settle),
    };
  }

  const v = config.bezier ?? base.bezier;
  const duration = (config.durationMs ?? 300) / 1000;
  const fn = cubicBezier(v[0], v[1], v[2], v[3]);
  return {
    def: base,
    name: base.name,
    type: 'bezier',
    bezier: v,
    totalMs: duration * 1000,
    params: `cubic-bezier(${v.map((n) => round(n, 2)).join(', ')})`,
    settleLabel: `${Math.round(duration * 1000)}ms`,
    fn,
  };
}

export const round = (n, places = 3) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/* -------------------------------------------------------- code generation */

// CSS linear() lets a spring run as a real CSS transition. Sample the curve and
// emit the stops; browsers interpolate between them.
export function toLinearEasing(fn, steps = 28, { wrap = false } = {}) {
  const stops = [];
  for (let i = 0; i <= steps; i++) stops.push(round(fn(i / steps), 4));
  if (!wrap) return `linear(${stops.join(', ')})`;
  const lines = [];
  for (let i = 0; i < stops.length; i += 8) lines.push(`    ${stops.slice(i, i + 8).join(', ')}`);
  return `linear(\n${lines.join(',\n')}\n  )`;
}

export function snippets(r, property = 'transform') {
  if (r.type === 'spring') {
    const ms = Math.round(r.totalMs);
    return {
      CSS: `/* ${r.name} as a sampled CSS easing */\n.element {\n  transition: ${property} ${ms}ms ${toLinearEasing(r.fn, 28, { wrap: true })};\n}`,
      Motion: `animate(element, { ${property}: "translateY(0)" }, {\n  type: "spring",\n  duration: ${round(r.duration, 2)},\n  bounce: ${round(r.bounce, 2)},\n})`,
      SwiftUI: `withAnimation(.spring(duration: ${round(r.duration, 2)}, bounce: ${round(r.bounce, 2)})) {\n    isPresented = true\n}`,
      Tailwind: `<!-- Tailwind has no spring utility. Use the sampled curve: -->\n<div class="transition-${property === 'transform' ? 'transform' : 'all'} duration-[${ms}ms] ease-[${toLinearEasing(r.fn, 16)}]">`,
    };
  }
  const v = r.bezier.map((n) => round(n, 2));
  const ms = Math.round(r.totalMs);
  return {
    CSS: `.element {\n  transition: ${property} ${ms}ms cubic-bezier(${v.join(', ')});\n}`,
    Motion: `animate(element, { ${property}: "translateY(0)" }, {\n  duration: ${round(ms / 1000, 2)},\n  ease: [${v.join(', ')}],\n})`,
    SwiftUI: `withAnimation(.timingCurve(${v.join(', ')}, duration: ${round(ms / 1000, 2)})) {\n    isPresented = true\n}`,
    Tailwind: `<div class="transition-transform duration-[${ms}ms] ease-[cubic-bezier(${v.join(',')})]">`,
  };
}
