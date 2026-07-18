import * as THREE from 'three';
import { makePanel, setFont, Throttle } from './util.js';

export function createMinimap(state, groups) {
  const panel = makePanel(state, 0.34, 0.38, 512, 576);
  panel.mesh.position.set(-0.52, -0.33, -1.55);
  panel.mesh.rotation.y = 0.28;
  groups.rig.add(panel.mesh);

  const tick = new Throttle(20, 0.25);
  let sweep = 0;
  const crumbTick = new Throttle(4);

  function draw() {
    const { c2d, canvas } = panel;
    panel.clear();
    const W = canvas.width, cx = W / 2, cy = W / 2, R = W * 0.44;
    const t = state.theme;
    const rangeM = 4; // radar radius in meters
    const scale = R / rangeM;
    const rot = state.mapNorthUp ? 0 : -THREE.MathUtils.degToRad(state.heading);

    c2d.save();
    c2d.beginPath();
    c2d.arc(cx, cy, R, 0, Math.PI * 2);
    c2d.fillStyle = 'rgba(4,12,12,0.55)';
    c2d.fill();
    c2d.clip();

    c2d.translate(cx, cy);
    c2d.rotate(rot);

    // grid rings + cross
    c2d.strokeStyle = t.faint;
    c2d.lineWidth = 2;
    for (const r of [1, 2, 3, 4]) {
      c2d.beginPath(); c2d.arc(0, 0, r * scale, 0, Math.PI * 2); c2d.stroke();
    }
    c2d.beginPath();
    c2d.moveTo(-R, 0); c2d.lineTo(R, 0);
    c2d.moveTo(0, -R); c2d.lineTo(0, R);
    c2d.stroke();

    // sweep
    c2d.fillStyle = t.faint;
    c2d.beginPath();
    c2d.moveTo(0, 0);
    c2d.arc(0, 0, R, sweep - 0.5, sweep);
    c2d.closePath();
    c2d.fill();

    const toMap = (wx, wz) => {
      // world XZ -> map, player-centered, north-up (accounting for re-zeroed north)
      const dx = wx - state.camPos.x;
      const dz = wz - state.camPos.z;
      const nOff = THREE.MathUtils.degToRad(state.northOffset);
      const rx = dx * Math.cos(nOff) + dz * Math.sin(nOff);
      const rz = -dx * Math.sin(nOff) + dz * Math.cos(nOff);
      return [rx * scale, rz * scale];
    };

    // breadcrumbs
    c2d.fillStyle = t.dim;
    for (let i = 0; i < state.crumbs.length; i++) {
      const cr = state.crumbs[i];
      const [x, y] = toMap(cr.x, cr.z);
      if (x * x + y * y > R * R) continue;
      const a = i / state.crumbs.length;
      c2d.globalAlpha = 0.15 + 0.45 * a;
      c2d.fillRect(x - 2, y - 2, 4, 4);
    }
    c2d.globalAlpha = 1;

    // targets
    for (const tgt of state.targets) {
      const [x, y] = toMap(tgt.pos.x, tgt.pos.z);
      const clampR = Math.min(1, (R - 12) / Math.max(1, Math.hypot(x, y)));
      const sweepAng = ((Math.atan2(y, x) - sweep + Math.PI * 8) % (Math.PI * 2));
      const flare = sweepAng < 0.6 || sweepAng > Math.PI * 2 - 0.1;
      c2d.fillStyle = t.accent;
      c2d.save();
      c2d.translate(x * clampR, y * clampR);
      c2d.rotate(Math.PI / 4);
      const s = flare ? 11 : 7;
      c2d.fillRect(-s / 2, -s / 2, s, s);
      c2d.restore();
    }

    // drone
    if (state.drone && state.drone.alive) {
      const [x, y] = toMap(state.drone.mesh.position.x, state.drone.mesh.position.z);
      if (x * x + y * y < R * R) {
        c2d.fillStyle = t.warn;
        c2d.beginPath();
        c2d.arc(x, y, 6, 0, Math.PI * 2);
        c2d.fill();
      }
    }

    c2d.restore();

    // north marker (drawn unrotated so the letter stays upright)
    const nAng = state.mapNorthUp ? 0 : -THREE.MathUtils.degToRad(state.heading);
    c2d.fillStyle = t.dim;
    setFont(c2d, 22);
    c2d.textAlign = 'center';
    c2d.fillText('N', cx + Math.sin(nAng) * (R - 24), cy - Math.cos(nAng) * (R - 24) + 8);

    // player wedge (always screen-up in heading-up mode)
    c2d.save();
    c2d.translate(cx, cy);
    if (state.mapNorthUp) c2d.rotate(THREE.MathUtils.degToRad(state.heading));
    c2d.fillStyle = t.p;
    c2d.beginPath();
    c2d.moveTo(0, -12); c2d.lineTo(-8, 9); c2d.lineTo(0, 4); c2d.lineTo(8, 9);
    c2d.closePath();
    c2d.fill();
    c2d.restore();

    // bezel
    c2d.strokeStyle = t.dim;
    c2d.lineWidth = 3;
    c2d.beginPath();
    c2d.arc(cx, cy, R, 0, Math.PI * 2);
    c2d.stroke();

    // footer
    setFont(c2d, 22);
    c2d.fillStyle = t.p;
    c2d.textAlign = 'center';
    const mode = state.mapNorthUp ? 'N-UP' : 'HDG-UP';
    c2d.fillText(`TAC MAP · ${rangeM}M · ${mode}`, cx, W + 32);
    c2d.fillStyle = t.dim;
    setFont(c2d, 18);
    c2d.fillText(`TRK ${state.crumbs.length} · TGT ${state.targets.length}`, cx, W + 58);

    panel.commit();
  }

  return {
    update(dt) {
      if (crumbTick.ready(dt) && state.phase !== 'BOOT') {
        state.crumbs.push({ x: state.camPos.x, z: state.camPos.z });
        if (state.crumbs.length > 240) state.crumbs.shift();
      }
      const show = state.minimapOn && state.phase !== 'BOOT';
      panel.mesh.visible = show;
      if (show) {
        sweep = (sweep + dt * 2.2) % (Math.PI * 2);
        if (tick.ready(dt)) draw();
      }
    }
  };
}
