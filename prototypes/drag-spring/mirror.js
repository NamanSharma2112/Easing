// Variant 1, Mirror: one finger drives all three cards; letting go hands the same
// position and speed to three different curves.
import { header, buildGrid, trackDrag, releaseAll, decide, describe, el } from './shared.js';

export function mirror(stage) {
  header(stage, 'Drag any sheet',
    'All three sheets follow your finger. Let go and each one finishes on its own curve, from the same place at the same speed.');
  const cards = buildGrid(stage);
  const readout = el('p', 'proto-readout', 'Drag a sheet down and let go, or flick it.');
  const legend = el('p', 'proto-legend',
    '<span class="key-finger"></span>your finger <span class="key-curve"></span>the curve after you let go. A spring leaves at the angle of the grey line; a timing curve bends at the dashed mark.');
  stage.append(readout, legend);

  let stop = null;
  let reopen = 0;
  const halt = () => { stop?.(); stop = null; clearTimeout(reopen); };
  const present = () => { halt(); stop = releaseAll(cards, { from: 0, velocity: 0, to: 1 }); };

  for (const card of cards) {
    trackDrag(card.screen, {
      sheetPx: () => card.sheet.offsetHeight,
      start: () => { halt(); return card.p; },
      move: (p) => cards.forEach((c) => c.set(p)),
      release: (p, velocity, h, history) => {
        const to = decide(p, velocity, h);
        readout.textContent = describe(p, velocity, h, to);
        stop = releaseAll(cards, { from: p, velocity, to, history }, () => {
          if (to === 0) reopen = setTimeout(present, 700);
        });
      },
    });
  }

  present();
  return halt;
}
