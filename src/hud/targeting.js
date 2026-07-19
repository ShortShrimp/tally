import * as THREE from 'three';
import { lineMat } from './util.js';
import { sfx } from '../audio.js';

export function createTargeting(state, groups, scene) {
  const matAccent = lineMat(state, 'accent', 1);
  const matP = lineMat(state, 'p', 0.8);

  // --- designated target template ---
  const diamondGeom = new THREE.OctahedronGeometry(0.06);
  function makeTargetMesh() {
    const m = new THREE.LineSegments(new THREE.WireframeGeometry(diamondGeom), matAccent);
    const ringPts = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1));
    }
    m.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), matAccent));
    return m;
  }

  // --- scan pulse ---
  const pulsePts = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pulsePts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const pulse = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pulsePts), matP);
  pulse.visible = false;
  scene.add(pulse);
  let pulseT = 0;

  const _fwd = new THREE.Vector3();
  const _to = new THREE.Vector3();

  function place(worldPos) {
    if (state.targets.length >= 8) { sfx.deny(); return; }
    const mesh = makeTargetMesh();
    mesh.position.copy(worldPos);
    scene.add(mesh);
    state.targets.push({ pos: worldPos.clone(), mesh, bearing: 0, born: state.time });
    sfx.designate();
    state.callout = { text: 'TGT PLACED', until: state.time + 1.4 };
  }

  function remove(tgt) {
    state.targets = state.targets.filter(t => t !== tgt);
    scene.remove(tgt.mesh);
    sfx.remove();
    state.callout = { text: 'TGT REMOVED', until: state.time + 1.4 };
  }

  // one action: remove the target you're looking at, otherwise place a new one
  function toggleAtGaze(hitPoint) {
    if (state.phase === 'BOOT') return;
    _fwd.set(0, 0, -1).applyQuaternion(state.camQuat);
    let best = null, bestAngle = 0.1;
    for (const tgt of state.targets) {
      _to.copy(tgt.pos).sub(state.camPos).normalize();
      const a = _fwd.angleTo(_to);
      if (a < bestAngle) { bestAngle = a; best = tgt; }
    }
    if (best) { remove(best); return; }
    const p = hitPoint ? hitPoint.clone()
      : state.camPos.clone().addScaledVector(_fwd, 2.6);
    p.y = Math.max(0.15, p.y);
    place(p);
  }

  return {
    toggleAtGaze,
    update(dt) {
      // designated target maintenance
      for (const tgt of state.targets) {
        const dx = tgt.pos.x - state.camPos.x;
        const dz = tgt.pos.z - state.camPos.z;
        tgt.bearing = ((Math.atan2(dx, -dz) * 180 / Math.PI) - state.northOffset + 360) % 360;
        tgt.mesh.rotation.y += dt * 1.2;
        const bob = Math.sin(state.time * 2 + tgt.pos.x) * 0.01;
        tgt.mesh.position.y = tgt.pos.y + bob;
      }

      // scan pulse
      if (state.mode === 'SCAN' && state.phase !== 'BOOT') {
        pulseT += dt;
        const period = 3.2, r = (pulseT % period) / period * 6 + 0.05;
        if ((pulseT % period) < dt) sfx.scanPulse();
        pulse.visible = true;
        pulse.position.set(state.camPos.x, 0.02, state.camPos.z);
        pulse.scale.setScalar(r);
        matP.opacity = 0.8 * (1 - r / 6);
        state.scanR = r;
      } else {
        pulse.visible = false;
        matP.opacity = 0.8;
        state.scanR = 0;
      }
    }
  };
}
