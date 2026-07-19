import * as THREE from 'three';
import { makePanel, setFont, Throttle } from './util.js';

const D = -1.6; // HUD glass distance

export function createFlight(state, groups) {
  const { tight, rig } = groups;

  // --- center boresight (canvas for thick strokes) ---
  const reticle = makePanel(state, 0.26, 0.26, 320, 320);
  reticle.mesh.position.set(0, 0, D);
  reticle.mesh.renderOrder = 11;
  tight.add(reticle.mesh);

  // flight-path marker (drifts with velocity)
  const fpv = makePanel(state, 0.09, 0.09, 112, 112);
  fpv.mesh.position.set(0, 0, D + 0.01);
  fpv.mesh.renderOrder = 12;
  tight.add(fpv.mesh);

  // --- live gaze rangefinder (under the boresight) ---
  const rng = makePanel(state, 0.17, 0.05, 256, 76);
  rng.mesh.position.set(0, -0.15, D);
  rng.mesh.renderOrder = 11;
  tight.add(rng.mesh);
  const rngTick = new Throttle(10, 0.3);

  function drawRng() {
    rng.clear();
    if (state.gazeRange != null) {
      const { c2d, canvas } = rng;
      setFont(c2d, 32, true);
      c2d.textAlign = 'center';
      c2d.fillStyle = state.theme.p;
      c2d.fillText(`RNG ${state.gazeRange.toFixed(1)}M`, canvas.width / 2, 50);
    }
    rng.commit();
  }

  // --- pitch ladder ---
  const ladder = makePanel(state, 0.62, 0.62, 512, 512);
  ladder.mesh.position.set(0, 0, D - 0.02);
  ladder.mesh.renderOrder = 9;
  tight.add(ladder.mesh);

  // --- compass tape ---
  const tape = makePanel(state, 1.05, 0.12, 1024, 118);
  tape.mesh.position.set(0, 0.44, D);
  rig.add(tape.mesh);

  // --- off-screen target arrow (filled mesh so it stays visible) ---
  const arrowGeom = new THREE.BufferGeometry();
  arrowGeom.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.03, 0, -0.018, -0.014, 0, 0.018, -0.014, 0
  ], 3));
  const arrowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide });
  arrowMat.color.setHex(state.theme.accentHex);
  state.themedMats.push({ mat: arrowMat, kind: 'accent', baseOp: 0.95 });
  const arrow = new THREE.Mesh(arrowGeom, arrowMat);
  arrow.renderOrder = 12;
  arrow.position.z = D;
  arrow.visible = false;
  tight.add(arrow);

  const ladderTick = new Throttle(20);
  const tapeTick = new Throttle(15, 0.5);
  const staticTick = new Throttle(2, 0.8);

  function drawReticle() {
    const { c2d, canvas } = reticle;
    reticle.clear();
    const t = state.theme, W = canvas.width, c = W / 2;
    c2d.strokeStyle = t.p;
    c2d.fillStyle = t.p;
    c2d.lineWidth = 7;
    for (let k = 0; k < 4; k++) {
      const a0 = (k * 90 + 16) * Math.PI / 180;
      const a1 = (k * 90 + 74) * Math.PI / 180;
      c2d.beginPath();
      c2d.arc(c, c, 68, a0, a1);
      c2d.stroke();
    }
    c2d.beginPath();
    c2d.arc(c, c, 7, 0, Math.PI * 2);
    c2d.fill();
    c2d.lineWidth = 8;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c2d.beginPath();
      c2d.moveTo(c + dx * 78, c + dy * 78);
      c2d.lineTo(c + dx * 104, c + dy * 104);
      c2d.stroke();
    }
    reticle.commit();
  }

  function drawFpv() {
    const { c2d, canvas } = fpv;
    fpv.clear();
    const t = state.theme, W = canvas.width, c = W / 2;
    c2d.strokeStyle = t.accent;
    c2d.lineWidth = 6;
    c2d.beginPath();
    c2d.arc(c, c, 20, 0, Math.PI * 2);
    c2d.stroke();
    c2d.beginPath();
    c2d.moveTo(c - 48, c); c2d.lineTo(c - 22, c);
    c2d.moveTo(c + 22, c); c2d.lineTo(c + 48, c);
    c2d.moveTo(c, c - 22); c2d.lineTo(c, c - 40);
    c2d.stroke();
    fpv.commit();
  }

  function drawLadder() {
    const { c2d, canvas } = ladder;
    ladder.clear();
    const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
    const pxPerDeg = 5.2;
    const pitchDeg = THREE.MathUtils.radToDeg(state.pitch);
    const t = state.theme;
    c2d.save();
    c2d.beginPath();
    c2d.arc(cx, cy, W * 0.47, 0, Math.PI * 2);
    c2d.clip();
    setFont(c2d, 21, true);
    for (let deg = -90; deg <= 90; deg += 10) {
      // world-stable: rung slides opposite head pitch so the horizon stays put
      const y = cy + (pitchDeg - deg) * pxPerDeg;
      if (y < -30 || y > H + 30) continue;
      const isHorizon = deg === 0;
      const half = isHorizon ? 200 : 66;
      const gap = isHorizon ? 60 : 46;
      c2d.strokeStyle = isHorizon ? t.p : t.dim;
      c2d.fillStyle = isHorizon ? t.p : t.dim;
      c2d.lineWidth = isHorizon ? 6 : 4;
      c2d.beginPath();
      c2d.moveTo(cx - half, y); c2d.lineTo(cx - gap, y);
      c2d.moveTo(cx + gap, y); c2d.lineTo(cx + half, y);
      if (deg < 0) {
        c2d.moveTo(cx - gap, y); c2d.lineTo(cx - gap, y - 12);
        c2d.moveTo(cx + gap, y); c2d.lineTo(cx + gap, y - 12);
      } else if (deg > 0) {
        c2d.moveTo(cx - gap, y); c2d.lineTo(cx - gap, y + 12);
        c2d.moveTo(cx + gap, y); c2d.lineTo(cx + gap, y + 12);
      }
      c2d.stroke();
      if (!isHorizon) {
        c2d.textAlign = 'right';
        c2d.fillText(String(Math.abs(deg)), cx - half - 10, y + 8);
        c2d.textAlign = 'left';
        c2d.fillText(String(Math.abs(deg)), cx + half + 10, y + 8);
      }
    }
    c2d.restore();
    ladder.commit();
  }

  function drawTape() {
    const { c2d, canvas } = tape;
    tape.clear();
    const W = canvas.width, H = canvas.height, cx = W / 2;
    const t = state.theme;
    const pxPerDeg = 4;
    const heading = state.heading;
    c2d.strokeStyle = t.dim;
    c2d.lineWidth = 3;
    c2d.beginPath();
    c2d.moveTo(60, H - 32); c2d.lineTo(W - 60, H - 32);
    c2d.stroke();
    setFont(c2d, 24, true);
    c2d.textAlign = 'center';
    const cards = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -70; d <= 70; d += 5) {
      let deg = Math.round((heading + d) / 5) * 5;
      const x = cx + (deg - heading) * pxPerDeg;
      if (x < 55 || x > W - 55) continue;
      const norm = ((deg % 360) + 360) % 360;
      const major = norm % 15 === 0;
      c2d.strokeStyle = t.dim;
      c2d.lineWidth = major ? 4 : 3;
      c2d.beginPath();
      c2d.moveTo(x, H - 32); c2d.lineTo(x, H - (major ? 48 : 40));
      c2d.stroke();
      if (major) {
        c2d.fillStyle = cards[norm] !== undefined ? t.p : t.dim;
        c2d.fillText(cards[norm] !== undefined ? cards[norm] : String(norm).padStart(3, '0'), x, H - 56);
      }
    }
    // target bearing carets
    c2d.fillStyle = t.accent;
    for (const tgt of state.targets) {
      let rel = ((tgt.bearing - heading + 540) % 360) - 180;
      const x = cx + THREE.MathUtils.clamp(rel, -68, 68) * pxPerDeg;
      c2d.beginPath();
      c2d.moveTo(x, H - 28); c2d.lineTo(x - 9, H - 12); c2d.lineTo(x + 9, H - 12);
      c2d.closePath();
      c2d.fill();
    }
    // current heading box
    c2d.fillStyle = t.p;
    setFont(c2d, 30, true);
    c2d.fillText(String(Math.round(heading) % 360).padStart(3, '0'), cx, 30);
    c2d.strokeStyle = t.p;
    c2d.lineWidth = 3;
    c2d.strokeRect(cx - 44, 4, 88, 36);
    c2d.beginPath();
    c2d.moveTo(cx, H - 24); c2d.lineTo(cx - 10, H - 8); c2d.lineTo(cx + 10, H - 8);
    c2d.closePath();
    c2d.fill();
    tape.commit();
  }

  const _v = new THREE.Vector3();

  return {
    update(dt) {
      const visible = state.phase !== 'BOOT';
      reticle.mesh.visible = fpv.mesh.visible = ladder.mesh.visible = tape.mesh.visible = rng.mesh.visible = visible;
      if (!visible) { arrow.visible = false; return; }
      if (rngTick.ready(dt)) drawRng();

      // counter-roll so the ladder stays level against the real horizon
      ladder.mesh.rotation.z = -state.roll;
      if (ladderTick.ready(dt)) drawLadder();
      if (tapeTick.ready(dt)) drawTape();
      if (staticTick.ready(dt)) { drawReticle(); drawFpv(); }

      // flight-path marker drifts with camera-space velocity
      _v.copy(state.velocity);
      _v.applyQuaternion(state.camQuatInv);
      fpv.mesh.position.x = THREE.MathUtils.clamp(_v.x * 0.12, -0.28, 0.28);
      fpv.mesh.position.y = THREE.MathUtils.clamp(_v.y * 0.12, -0.28, 0.28);

      // off-screen arrow to nearest target
      arrow.visible = false;
      let best = null, bestD = Infinity;
      for (const tgt of state.targets) {
        const d = tgt.pos.distanceTo(state.camPos);
        if (d < bestD) { bestD = d; best = tgt; }
      }
      if (best) {
        _v.copy(best.pos).applyMatrix4(state.camMatrixInv); // camera space
        const behind = _v.z > 0;
        const offAxis = Math.sqrt(_v.x * _v.x + _v.y * _v.y) / Math.max(0.001, Math.abs(_v.z));
        if (behind || offAxis > 0.55) {
          const a = Math.atan2(_v.y, _v.x);
          arrow.visible = true;
          arrow.position.x = Math.cos(a) * 0.5;
          arrow.position.y = Math.sin(a) * 0.5;
          arrow.rotation.z = a - Math.PI / 2;
        }
      }
    }
  };
}
