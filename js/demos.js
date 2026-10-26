// The UI blocks shown inside the phone. Each demo builds its own markup and
// exposes apply(v), where v is the eased progress and may overshoot past 1.

const lerp = (a, b, t) => a + (b - a) * t;

const SCREEN = `
  <div class="ui-status"><span>9:41</span><span class="ui-status-dots"><i></i><i></i><i></i></span></div>
  <div class="ui-hero"></div>
  <div class="ui-row">
    <div class="ui-avatar"></div>
    <div class="ui-lines"><span style="width:72%"></span><span style="width:46%"></span></div>
  </div>
  <div class="ui-row">
    <div class="ui-avatar"></div>
    <div class="ui-lines"><span style="width:58%"></span><span style="width:64%"></span></div>
  </div>`;

function build(screen, html) {
  screen.innerHTML = SCREEN + html;
  return (sel) => screen.querySelector(sel);
}

export const DEMOS = [
  {
    id: 'sheet',
    name: 'Bottom sheet',
    hint: 'Travels a long distance. Overshoot reads clearly at the top edge.',
    create(screen) {
      const q = build(screen, `
        <div class="ui-scrim"></div>
        <div class="ui-sheet">
          <div class="ui-grabber"></div>
          <div class="ui-lines"><span style="width:40%"></span></div>
          <div class="ui-block"></div>
          <div class="ui-lines"><span style="width:84%"></span><span style="width:62%"></span></div>
          <div class="ui-button"></div>
        </div>`);
      const scrim = q('.ui-scrim');
      const sheet = q('.ui-sheet');
      return (v) => {
        sheet.style.transform = `translate3d(0, ${(1 - v) * 100}%, 0)`;
        scrim.style.opacity = Math.min(1, Math.max(0, v)) * 0.5;
      };
    },
  },
  {
    id: 'modal',
    name: 'Dialog',
    hint: 'Scale plus fade. Watch how late each curve hands over the last 10%.',
    create(screen) {
      const q = build(screen, `
        <div class="ui-scrim"></div>
        <div class="ui-dialog">
          <div class="ui-lines"><span style="width:66%"></span><span style="width:88%"></span><span style="width:52%"></span></div>
          <div class="ui-dialog-actions"><div class="ui-chip"></div><div class="ui-chip is-primary"></div></div>
        </div>`);
      const scrim = q('.ui-scrim');
      const dialog = q('.ui-dialog');
      return (v) => {
        const clamped = Math.min(1, Math.max(0, v));
        dialog.style.transform = `translate3d(0,0,0) scale(${lerp(0.82, 1, v)})`;
        dialog.style.opacity = clamped;
        scrim.style.opacity = clamped * 0.55;
      };
    },
  },
  {
    id: 'toast',
    name: 'Toast',
    hint: 'Short travel at the top of the screen, where overshoot is cheap.',
    create(screen) {
      const q = build(screen, `
        <div class="ui-toast">
          <div class="ui-dot"></div>
          <div class="ui-lines"><span style="width:70%"></span><span style="width:44%"></span></div>
        </div>`);
      const toast = q('.ui-toast');
      return (v) => {
        toast.style.transform = `translate3d(0, ${lerp(-150, 0, v)}%, 0)`;
        toast.style.opacity = Math.min(1, Math.max(0, v * 2.5));
      };
    },
  },
  {
    id: 'list',
    name: 'Staggered list',
    hint: 'Five rows, each offset by 60ms. Slow curves smear the stagger together.',
    create(screen) {
      const rows = Array.from({ length: 5 }, () => `
        <div class="ui-item">
          <div class="ui-avatar is-sm"></div>
          <div class="ui-lines"><span style="width:62%"></span><span style="width:38%"></span></div>
        </div>`).join('');
      const q = build(screen, `<div class="ui-list">${rows}</div>`);
      const items = [...q('.ui-list').children];
      return (v) => {
        items.forEach((item, i) => {
          const offset = i * 0.12;
          const local = Math.max(0, Math.min(1.4, (v - offset) / (1 - offset * 0.5)));
          item.style.transform = `translate3d(0, ${(1 - local) * 18}px, 0)`;
          item.style.opacity = Math.min(1, Math.max(0, local * 1.6));
        });
      };
    },
  },
  {
    id: 'toggle',
    name: 'Toggle',
    hint: 'Twenty pixels of travel. Most curves look identical. Springs do not.',
    create(screen) {
      const q = build(screen, `
        <div class="ui-panel">
          <div class="ui-setting">
            <div class="ui-lines"><span style="width:54%"></span></div>
            <div class="ui-switch"><div class="ui-knob"></div></div>
          </div>
          <div class="ui-setting">
            <div class="ui-lines"><span style="width:40%"></span></div>
            <div class="ui-switch is-off"><div class="ui-knob"></div></div>
          </div>
        </div>`);
      const track = q('.ui-switch');
      const knob = q('.ui-knob');
      return (v) => {
        knob.style.transform = `translate3d(${v * 20}px, 0, 0)`;
        track.style.setProperty('--on', Math.min(1, Math.max(0, v)));
      };
    },
  },
  {
    id: 'tabs',
    name: 'Tab switch',
    hint: 'An indicator moving between two points, starting and ending on screen.',
    create(screen) {
      const q = build(screen, `
        <div class="ui-panel">
          <div class="ui-tabs">
            <div class="ui-tab">Today</div>
            <div class="ui-tab">Week</div>
            <div class="ui-indicator"></div>
          </div>
          <div class="ui-pane">
            <div class="ui-block is-short"></div>
            <div class="ui-lines"><span style="width:76%"></span><span style="width:58%"></span></div>
          </div>
        </div>`);
      const indicator = q('.ui-indicator');
      const pane = q('.ui-pane');
      return (v) => {
        indicator.style.transform = `translate3d(${v * 100}%, 0, 0)`;
        pane.style.transform = `translate3d(${lerp(14, 0, v)}px, 0, 0)`;
        pane.style.opacity = Math.min(1, Math.max(0.15, v));
      };
    },
  },
];

export const demoById = (id) => DEMOS.find((d) => d.id === id) || DEMOS[0];
