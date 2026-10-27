// The UI blocks shown inside the phone. Each demo builds its own markup and
// returns apply(v, at): v is the current position (it may overshoot past 1), and
// at(ms) gives the position that many ms earlier, for demos that stagger.
//
// Overlay demos (sheet, dialog, toast) sit on top of a full app screen. In-flow
// demos (list, toggle, tabs) own the screen below the status bar, so nothing
// they draw can land on top of unrelated content.

const lerp = (a, b, t) => a + (b - a) * t;
const STAGGER_MS = 50;
const LIST_ROWS = 5;
const unit = (v) => Math.min(1, Math.max(0, v));

const STATUS = `
  <div class="ui-status"><span>9:41</span><span class="ui-status-dots"><i></i><i></i><i></i></span></div>`;

const APP = `${STATUS}
  <div class="ui-hero"></div>
  <div class="ui-row">
    <div class="ui-avatar"></div>
    <div class="ui-lines"><span style="width:72%"></span><span style="width:46%"></span></div>
  </div>
  <div class="ui-row">
    <div class="ui-avatar"></div>
    <div class="ui-lines"><span style="width:58%"></span><span style="width:64%"></span></div>
  </div>`;

function build(screen, html, { overlay = false } = {}) {
  screen.innerHTML = (overlay ? APP : STATUS) + html;
  return (sel) => screen.querySelector(sel);
}

export const DEMOS = [
  {
    id: 'sheet',
    name: 'Sheet',
    create(screen) {
      const q = build(screen, `
        <div class="ui-scrim"></div>
        <div class="ui-sheet">
          <div class="ui-grabber"></div>
          <div class="ui-lines"><span style="width:40%"></span></div>
          <div class="ui-block"></div>
          <div class="ui-lines"><span style="width:84%"></span><span style="width:62%"></span></div>
          <div class="ui-button"></div>
        </div>`, { overlay: true });
      const scrim = q('.ui-scrim');
      const sheet = q('.ui-sheet');
      return (v) => {
        sheet.style.transform = `translate3d(0, ${(1 - v) * 100}%, 0)`;
        scrim.style.opacity = unit(v) * 0.5;
      };
    },
  },
  {
    id: 'modal',
    name: 'Dialog',
    create(screen) {
      const q = build(screen, `
        <div class="ui-scrim"></div>
        <div class="ui-dialog">
          <div class="ui-dialog-icon"></div>
          <div class="ui-lines is-center"><span style="width:62%"></span><span style="width:84%"></span></div>
          <div class="ui-dialog-actions"><div class="ui-chip"></div><div class="ui-chip is-primary"></div></div>
        </div>`, { overlay: true });
      const scrim = q('.ui-scrim');
      const dialog = q('.ui-dialog');
      // Enter from 0.9, not from nothing. Opacity is clamped; scale is free to overshoot.
      return (v) => {
        dialog.style.transform = `translate3d(0, -50%, 0) scale(${lerp(0.9, 1, v)})`;
        dialog.style.opacity = unit(v);
        scrim.style.opacity = unit(v) * 0.5;
      };
    },
  },
  {
    id: 'toast',
    name: 'Toast',
    create(screen) {
      const q = build(screen, `
        <div class="ui-toast">
          <div class="ui-dot"></div>
          <div class="ui-lines"><span style="width:70%"></span><span style="width:44%"></span></div>
        </div>`, { overlay: true });
      const toast = q('.ui-toast');
      return (v) => {
        toast.style.transform = `translate3d(0, ${lerp(-140, 0, v)}%, 0)`;
        toast.style.opacity = unit(v * 2);
      };
    },
  },
  {
    id: 'list',
    name: 'List',
    // The last row starts this much later, so a run lasts this much longer.
    lagMs: STAGGER_MS * (LIST_ROWS - 1),
    create(screen) {
      const widths = [[64, 38], [52, 44], [70, 30], [48, 40], [58, 34]].slice(0, LIST_ROWS);
      const rows = widths.map(([a, b]) => `
        <div class="ui-item">
          <div class="ui-avatar"></div>
          <div class="ui-lines"><span style="width:${a}%"></span><span style="width:${b}%"></span></div>
        </div>`).join('');
      const q = build(screen, `
        <div class="ui-heading"><span style="width:46%"></span></div>
        <div class="ui-list">${rows}</div>`);
      const items = [...q('.ui-list').children];
      // Every row runs the whole motion, each one 50ms behind the last. Sampling
      // the motion in time (rather than offsetting the eased value) means rows
      // land exactly, and an interruption reverses each row from where it is.
      return (v, at) => {
        items.forEach((item, i) => {
          const local = at ? at(i * STAGGER_MS) : v;
          item.style.transform = `translate3d(0, ${(1 - local) * 16}px, 0)`;
          item.style.opacity = unit(local * 1.5);
        });
      };
    },
  },
  {
    id: 'toggle',
    name: 'Toggle',
    create(screen) {
      const q = build(screen, `
        <div class="ui-hero is-short"></div>
        <div class="ui-group">
          <div class="ui-setting">
            <div class="ui-lines"><span style="width:54%"></span></div>
            <div class="ui-switch" data-live><div class="ui-knob"></div></div>
          </div>
          <div class="ui-setting">
            <div class="ui-lines"><span style="width:40%"></span></div>
            <div class="ui-switch"><div class="ui-knob"></div></div>
          </div>
          <div class="ui-setting">
            <div class="ui-lines"><span style="width:62%"></span></div>
            <div class="ui-switch is-on"><div class="ui-knob"></div></div>
          </div>
        </div>`);
      const track = q('[data-live]');
      const knob = q('[data-live] .ui-knob');
      return (v) => {
        knob.style.transform = `translate3d(${v * 18}px, 0, 0)`;
        track.style.setProperty('--on', unit(v));
      };
    },
  },
  {
    id: 'tabs',
    name: 'Tabs',
    create(screen) {
      const q = build(screen, `
        <div class="ui-tabs">
          <div class="ui-indicator"></div>
          <div class="ui-tab" data-from>Today</div>
          <div class="ui-tab" data-to>Week</div>
        </div>
        <div class="ui-pane">
          <div class="ui-chart">
            <i style="height:38%"></i><i style="height:62%"></i><i style="height:48%"></i>
            <i style="height:80%"></i><i style="height:56%"></i><i style="height:70%"></i><i style="height:44%"></i>
          </div>
          <div class="ui-row">
            <div class="ui-avatar"></div>
            <div class="ui-lines"><span style="width:66%"></span><span style="width:40%"></span></div>
          </div>
          <div class="ui-row">
            <div class="ui-avatar"></div>
            <div class="ui-lines"><span style="width:54%"></span><span style="width:48%"></span></div>
          </div>
        </div>`);
      const tabs = q('.ui-tabs');
      const indicator = q('.ui-indicator');
      const pane = q('.ui-pane');
      // The indicator moves; the content crossfades with a short directional hint
      // rather than a full slide, which keeps the pane readable throughout.
      return (v) => {
        indicator.style.transform = `translate3d(${v * 100}%, 0, 0)`;
        tabs.style.setProperty('--t', unit(v));
        pane.style.transform = `translate3d(${lerp(10, 0, v)}px, 0, 0)`;
        pane.style.opacity = lerp(0.2, 1, unit(v));
      };
    },
  },
];

export const demoById = (id) => DEMOS.find((d) => d.id === id) || DEMOS[0];
