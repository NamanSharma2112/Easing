// Variant 2, Throw: no gesture. Choose where the finger lets go and how fast it was
// moving, then fire identical throws, so the curve is the only thing that differs.
import { header, buildGrid, releaseAll, decide, describe, syntheticHistory, el } from './shared.js';

const SPEEDS = [
  { label: 'Still', px: 0 },
  { label: 'Gentle', px: 250 },
  { label: 'Firm', px: 450 },
  { label: 'Flick', px: 1100 },
];

export function throwVariant(stage) {
  header(stage, 'Throw it',
    'Pick where the finger lets go and how fast it was moving down, then throw. Every throw is identical, so the only difference between the cards is the curve.');
  const cards = buildGrid(stage);

  const controls = el('div', 'playback proto-controls', `
    <div class="slider-row is-inline">
      <label for="throw-at">Let go at</label>
      <input type="range" id="throw-at" min="20" max="100" step="1" value="75" />
      <output id="throw-at-out" for="throw-at">75%</output>
    </div>
    <div class="playback-end">
      <div class="filters" id="throw-speed" role="group" aria-label="Speed when letting go"></div>
      <button type="button" class="text-btn is-strong" id="throw-go">Throw</button>
    </div>`);
  const readout = el('p', 'proto-readout', 'Firm stays under the 500 px/s flick threshold, so the sheet snaps back. Flick dismisses.');
  const legend = el('p', 'proto-legend',
    '<span class="key-finger"></span>the finger <span class="key-curve"></span>the curve after it lets go');
  stage.append(controls, readout, legend);

  const at = controls.querySelector('#throw-at');
  const atOut = controls.querySelector('#throw-at-out');
  const sync = () => {
    at.style.setProperty('--f', ((at.value - at.min) / (at.max - at.min)).toFixed(4));
    atOut.textContent = `${at.value}%`;
  };
  at.addEventListener('input', sync);
  sync();

  let speed = SPEEDS[3];
  const speedRow = controls.querySelector('#throw-speed');
  for (const option of SPEEDS) {
    const button = el('button', `filter${option === speed ? ' is-active' : ''}`, option.label);
    button.type = 'button';
    button.title = option.px ? `${option.px} px/s` : 'Let go without moving';
    button.addEventListener('click', () => {
      speed = option;
      speedRow.querySelectorAll('.filter').forEach((b) => b.classList.toggle('is-active', b === button));
    });
    speedRow.append(button);
  }

  let stop = null;
  let reopen = 0;
  const halt = () => { stop?.(); stop = null; clearTimeout(reopen); };
  const present = () => { halt(); stop = releaseAll(cards, { from: 0, velocity: 0, to: 1 }); };

  controls.querySelector('#throw-go').addEventListener('click', () => {
    halt();
    const h = cards[0].sheet.offsetHeight;
    const p = Number(at.value) / 100;
    const velocity = -speed.px / h;
    // The finger was moving at that speed into the release; it cannot have been above fully open.
    const history = syntheticHistory(p, velocity).map((s) => ({ ...s, p: Math.min(1, s.p) }));
    const to = decide(p, velocity, h);
    readout.textContent = describe(p, velocity, h, to);
    stop = releaseAll(cards, { from: p, velocity, to, history }, () => {
      if (to === 0) reopen = setTimeout(present, 700);
    });
  });

  present();
  return halt;
}
