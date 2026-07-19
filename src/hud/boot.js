import { makePanel, setFont } from './util.js';
import { sfx } from '../audio.js';

const LINES = [
  ['TALLY OS 1.0 — COLD START', 0.0],
  ['POWER CORE ............ ONLINE  87%', 0.5],
  ['INERTIAL REFERENCE .... ALIGNED', 1.1],
  ['OPTICS / PASSTHROUGH .. NOMINAL', 1.6],
  ['FLIGHT DYNAMICS ....... CALIBRATED', 2.1],
  ['SENSOR SUITE .......... SWEEP OK', 2.7],
  ['TACTICAL MAP .......... SYNCED', 3.2],
  ['SEMANTIC SCAN ......... ONLINE', 3.8],
  ['ALL SYSTEMS GO', 4.6],
];
const DONE_AT = 5.6;

export function createBoot(state, groups) {
  const panel = makePanel(state, 0.62, 0.44, 768, 544);
  panel.mesh.position.set(0, 0.02, -1.5);
  groups.rig.add(panel.mesh);

  let t = 0;
  let lastCount = 0;
  let finished = false;

  function draw() {
    const { c2d, canvas } = panel;
    panel.clear();
    const th = state.theme;
    c2d.fillStyle = 'rgba(4,12,12,0.55)';
    c2d.fillRect(0, 0, canvas.width, canvas.height);
    c2d.strokeStyle = th.dim;
    c2d.lineWidth = 2;
    c2d.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    setFont(c2d, 27, true);
    c2d.textAlign = 'left';
    let y = 64;
    let shown = 0;
    for (const [text, at] of LINES) {
      if (t < at) break;
      shown++;
      const isLast = at === LINES[LINES.length - 1][1];
      c2d.fillStyle = isLast ? th.accent : th.p;
      const reveal = Math.min(text.length, Math.floor((t - at) / 0.018));
      c2d.fillText(text.slice(0, reveal), 48, y);
      y += 44;
    }
    if (t > 0.2 && Math.floor(t * 3) % 2 === 0 && !finished) {
      c2d.fillStyle = th.dim;
      c2d.fillText('▌', 48, y);
    }
    // progress bar
    const p = Math.min(1, t / DONE_AT);
    c2d.strokeStyle = th.dim;
    c2d.strokeRect(48, canvas.height - 60, canvas.width - 96, 16);
    c2d.fillStyle = th.p;
    c2d.fillRect(50, canvas.height - 58, (canvas.width - 100) * p, 12);
    setFont(c2d, 17);
    c2d.fillStyle = th.dim;
    c2d.fillText('PINCH / CLICK TO SKIP', 48, canvas.height - 74);
    panel.commit();
    return shown;
  }

  return {
    skip() {
      if (state.phase === 'BOOT') t = DONE_AT;
    },
    update(dt) {
      if (state.phase !== 'BOOT') { panel.mesh.visible = false; return; }
      panel.mesh.visible = true;
      t += dt;
      const shown = draw();
      if (shown > lastCount) { sfx.bootLine(); lastCount = shown; }
      if (t >= DONE_AT && !finished) {
        finished = true;
        sfx.bootDone();
        state.phase = 'NAV';
        state.mode = 'NAV';
      }
    }
  };
}
