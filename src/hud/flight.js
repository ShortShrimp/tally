import * as THREE from 'three';
import { makePanel, lineMat, setFont, Throttle } from './util.js';

const D = -1.6; // HUD glass distance

function ringPoints(r, segments = 64, arcs = null) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    if (arcs && !arcs(a0)) continue;
    pts.push(new THREE.Vector3(Math.cos(a0) * r, Math.sin(a0) * r, 0));
    pts.push(new THREE.Vector3(Math.cos(a1) * r, Math.sin(a1) * r, 0));
  }
  return pts;
}

export function createFlight(state, groups) {
  const { tight, rig } = groups;
  const mat = lineMat(state, 'p', 0.85);
  const matDim = lineMat(state, 'p', 0.35);
  const matAccent = lineMat(state, 'accent', 0.95);

  // --- center boresight ---
  const reticle = new THREE.Group();
  reticle.position.z = D;
  const outerPts = ringPoints(0.055, 64, a => (a % (Math.PI / 2)) > 0.25);
  reticle.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(outerPts), mat));
  reticle.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ringPoints(0.014)), mat));
  const tickPts = [];
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    tickPts.push(new THREE.Vector3(Math.cos(a) * 0.062, Math.sin(a) * 0.062, 0));
    tickPts.push(new THREE.Vector3(Math.cos(a) * 0.082, Math.sin(a) * 0.082, 0));
  }
  reticle.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tickPts), mat));
  for (const l of reticle.children) l.renderOrder = 11;
  tight.add(reticle);

  // velocity vector marker (flight-path dot)
  const fpv = new THREE.Group();
  fpv.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ringPoints(0.008)), matAccent));
  const wing = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.02, 0, 0), new THREE.Vector3(-0.009, 0, 0),
    new THREE.Vector3(0.009, 0, 0), new THREE.Vector3(0.02, 0, 0),
    new THREE.Vector3(0, 0.009, 0), new THREE.Vector3(0, 0.016, 0)
  ]);
  fpv.add(new THREE.LineSegments(wing, matAccent));
  fpv.position.z = D;
  for (const l of fpv.children) l.renderOrder = 11;
  tight.add(fpv);

  // --- pitch ladder (canvas, rolls with head) ---
  const ladder = makePanel(state, 0.62, 0.62, 512, 512);
  ladder.mesh.position.set(0, 0, D - 0.02);
  ladder.mesh.renderOrder = 9;
  tight.add(ladder.mesh);

  // --- compass tape ---
  const tape = makePanel(state, 1.05, 0.11, 1024, 108);
  tape.mesh.position.set(0, 0.44, D);
  rig.add(tape.mesh);

  // --- off-screen target arrow ---
  const arrow = new THREE.Group();
  const arrowGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.022, 0), new THREE.Vector3(-0.013, -0.01, 0),
    new THREE.Vector3(-0.013, -0.01, 0), new THREE.Vector3(0.013, -0.01, 0),
    new THREE.Vector3(0.013, -0.01, 0), new THREE.Vector3(0, 0.022, 0)
  ]);
  arrow.add(new THREE.LineSegments(arrowGeom, matAccent));
  arrow.position.z = D;
  arrow.visible = false;
  tight.add(arrow);

  const ladderTick = new Throttle(20);
  const tapeTick = new Throttle(15, 0.5);

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
    c2d.strokeStyle = t.dim;
    c2d.fillStyle = t.dim;
    setFont(c2d, 17);
    c2d.lineWidth = 2;
    for (let deg = -90; deg <= 90; deg += 10) {
      const y = cy + (pitchDeg - deg) * pxPerDeg * -1;
      if (y < -30 || y > H + 30) continue;
      const isHorizon = deg === 0;
      const half = isHorizon ? 200 : 66;
      const gap = isHorizon ? 60 : 46;
      c2d.strokeStyle = isHorizon ? t.p : t.dim;
      c2d.beginPath();
      c2d.moveTo(cx - half, y); c2d.lineTo(cx - gap, y);
      c2d.moveTo(cx + gap, y); c2d.lineTo(cx + half, y);
      if (deg < 0) { // dashed-style droop ticks for negative pitch
        c2d.moveTo(cx - gap, y); c2d.lineTo(cx - gap, y - 10);
        c2d.moveTo(cx + gap, y); c2d.lineTo(cx + gap, y - 10);
      } else if (deg > 0) {
        c2d.moveTo(cx - gap, y); c2d.lineTo(cx - gap, y + 10);
        c2d.moveTo(cx + gap, y); c2d.lineTo(cx + gap, y + 10);
      }
      c2d.stroke();
      if (!isHorizon) {
        c2d.textAlign = 'right';
        c2d.fillText(String(Math.abs(deg)), cx - half - 8, y + 6);
        c2d.textAlign = 'left';
        c2d.fillText(String(Math.abs(deg)), cx + half + 8, y + 6);
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
    c2d.fillStyle = t.p;
    c2d.lineWidth = 2;
    c2d.beginPath();
    c2d.moveTo(60, H - 30); c2d.lineTo(W - 60, H - 30);
    c2d.stroke();
    setFont(c2d, 20);
    c2d.textAlign = 'center';
    const cards = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -70; d <= 70; d += 5) {
      let deg = Math.round((heading + d) / 5) * 5;
      const x = cx + (deg - heading) * pxPerDeg;
      if (x < 55 || x > W - 55) continue;
      const norm = ((deg % 360) + 360) % 360;
      const major = norm % 15 === 0;
      c2d.strokeStyle = t.dim;
      c2d.beginPath();
      c2d.moveTo(x, H - 30); c2d.lineTo(x, H - (major ? 44 : 38));
      c2d.stroke();
      if (major) {
        c2d.fillStyle = cards[norm] !== undefined ? t.p : t.dim;
        c2d.fillText(cards[norm] !== undefined ? cards[norm] : String(norm).padStart(3, '0'), x, H - 52);
      }
    }
    // target bearing carets
    c2d.fillStyle = t.accent;
    for (const tgt of state.targets) {
      let rel = ((tgt.bearing - heading + 540) % 360) - 180;
      const x = cx + THREE.MathUtils.clamp(rel, -68, 68) * pxPerDeg;
      c2d.beginPath();
      c2d.moveTo(x, H - 26); c2d.lineTo(x - 7, H - 14); c2d.lineTo(x + 7, H - 14);
      c2d.closePath();
      c2d.fill();
    }
    // current heading box
    c2d.fillStyle = t.p;
    setFont(c2d, 24, true);
    c2d.fillText(String(Math.round(heading) % 360).padStart(3, '0'), cx, 26);
    c2d.strokeStyle = t.p;
    c2d.strokeRect(cx - 36, 4, 72, 30);
    c2d.beginPath();
    c2d.moveTo(cx, H - 22); c2d.lineTo(cx - 8, H - 8); c2d.lineTo(cx + 8, H - 8);
    c2d.closePath();
    c2d.fill();
    tape.commit();
  }

  const _v = new THREE.Vector3();

  return {
    update(dt) {
      const visible = state.phase !== 'BOOT';
      reticle.visible = fpv.visible = ladder.mesh.visible = tape.mesh.visible = visible;
      if (!visible) { arrow.visible = false; return; }

      // roll the ladder opposite head roll
      ladder.mesh.rotation.z = state.roll;
      if (ladderTick.ready(dt)) drawLadder();
      if (tapeTick.ready(dt)) drawTape();

      // flight-path marker drifts with camera-space velocity
      _v.copy(state.velocity);
      _v.applyQuaternion(state.camQuatInv);
      fpv.position.x = THREE.MathUtils.clamp(_v.x * 0.12, -0.28, 0.28);
      fpv.position.y = THREE.MathUtils.clamp(_v.y * 0.12, -0.28, 0.28);

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
