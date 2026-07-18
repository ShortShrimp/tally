import * as THREE from 'three';
import { makePanel, lineMat, setFont, Throttle } from './util.js';
import { sfx } from '../audio.js';

function bracketGroup(mat, size = 0.1) {
  const g = new THREE.Group();
  const s = size, l = size * 0.35;
  const pts = [];
  for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    pts.push(new THREE.Vector3(sx * s, sy * s, 0), new THREE.Vector3(sx * s - sx * l, sy * s, 0));
    pts.push(new THREE.Vector3(sx * s, sy * s, 0), new THREE.Vector3(sx * s, sy * s - sy * l, 0));
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
  lines.renderOrder = 12;
  g.add(lines);
  return g;
}

export function createTargeting(state, groups, scene) {
  const matAccent = lineMat(state, 'accent', 0.95);
  const matWarn = lineMat(state, 'warn', 0.95);
  const matP = lineMat(state, 'p', 0.8);

  // --- lock brackets (drone / hands) ---
  const brackets = bracketGroup(matAccent, 0.09);
  brackets.visible = false;
  scene.add(brackets);

  const lockLabel = makePanel(state, 0.22, 0.055, 320, 80);
  lockLabel.mesh.visible = false;
  scene.add(lockLabel.mesh);

  // --- practice drone ---
  const droneGeom = new THREE.OctahedronGeometry(0.09);
  const droneMesh = new THREE.LineSegments(new THREE.WireframeGeometry(droneGeom), matWarn);
  droneMesh.visible = false;
  scene.add(droneMesh);
  const drone = { mesh: droneMesh, alive: false, respawnIn: 2, seed: Math.random() * 100, base: new THREE.Vector3() };
  state.drone = drone;

  // --- designated target template ---
  const diamondGeom = new THREE.OctahedronGeometry(0.05);
  function makeTargetMesh() {
    const m = new THREE.LineSegments(new THREE.WireframeGeometry(diamondGeom), matAccent);
    const ringPts = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a) * 0.09, 0, Math.sin(a) * 0.09));
    }
    m.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), matAccent));
    return m;
  }

  // --- repulsor flash + tracer ---
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
  const flash = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), flashMat);
  flash.renderOrder = 13;
  flash.visible = false;
  scene.add(flash);
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
  const tracerGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tracer = new THREE.Line(tracerGeom, tracerMat);
  tracer.renderOrder = 13;
  scene.add(tracer);
  let flashT = 0;

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

  // splash burst
  const burst = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.1, 0)), matWarn);
  burst.visible = false;
  scene.add(burst);
  let burstT = 0;

  let lockProgress = 0;
  let locked = false;
  const seekTick = new Throttle(6);
  const labelTick = new Throttle(12);

  const _fwd = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _ray = new THREE.Raycaster();

  function spawnDrone() {
    const ang = Math.random() * Math.PI * 2;
    const dist = 1.8 + Math.random() * 1.6;
    drone.base.set(
      state.camPos.x + Math.sin(ang) * dist,
      Math.max(0.9, state.camPos.y - 0.2 + (Math.random() - 0.5) * 0.6),
      state.camPos.z - Math.cos(ang) * dist
    );
    drone.alive = true;
    droneMesh.visible = true;
  }

  function drawLockLabel(text, color) {
    const { c2d, canvas } = lockLabel;
    lockLabel.clear();
    setFont(c2d, 34, true);
    c2d.fillStyle = color;
    c2d.textAlign = 'center';
    c2d.fillText(text, canvas.width / 2, 52);
    lockLabel.commit();
  }

  function fire() {
    if (state.phase === 'BOOT') return;
    if (state.core < 3) { sfx.deny(); return; }
    state.core = Math.max(0, state.core - 2.5);
    sfx.fire();
    state.shake = 1;
    flashT = 1;

    // fire origin: palm if hand tracked, else camera low-center
    const origin = state.palmPos ? state.palmPos.clone() : state.camPos.clone().add(
      new THREE.Vector3(0.08, -0.12, 0).applyQuaternion(state.camQuat));
    _fwd.set(0, 0, -1).applyQuaternion(state.camQuat);

    let hitPoint = origin.clone().addScaledVector(_fwd, 12);
    let killedDrone = false, killedTarget = null;

    if (drone.alive) {
      _to.copy(droneMesh.position).sub(state.camPos).normalize();
      if (locked || _fwd.angleTo(_to) < 0.06) {
        hitPoint = droneMesh.position.clone();
        killedDrone = true;
      }
    }
    if (!killedDrone) {
      for (const tgt of state.targets) {
        _to.copy(tgt.pos).sub(state.camPos).normalize();
        if (_fwd.angleTo(_to) < 0.07) { hitPoint = tgt.pos.clone(); killedTarget = tgt; break; }
      }
    }

    flash.position.copy(origin);
    flash.quaternion.copy(state.camQuat);
    flash.visible = true;
    tracerGeom.setFromPoints([origin, hitPoint]);
    tracerMat.opacity = 1;

    if (killedDrone) {
      drone.alive = false;
      droneMesh.visible = false;
      drone.respawnIn = 2 + Math.random() * 2;
      state.kills++;
      state.callout = { text: 'SPLASH', until: state.time + 1.6 };
      burst.position.copy(hitPoint);
      burst.scale.setScalar(0.3);
      burst.visible = true;
      burstT = 1;
      sfx.splash();
      locked = false;
      lockProgress = 0;
    } else if (killedTarget) {
      state.targets = state.targets.filter(t => t !== killedTarget);
      scene.remove(killedTarget.mesh);
      state.kills++;
      state.callout = { text: 'TARGET DESTROYED', until: state.time + 1.6 };
      burst.position.copy(hitPoint);
      burst.scale.setScalar(0.3);
      burst.visible = true;
      burstT = 1;
      sfx.splash();
    }
  }

  function designate(worldPos) {
    if (state.phase === 'BOOT') return;
    if (state.targets.length >= 8) { sfx.deny(); return; }
    const mesh = makeTargetMesh();
    mesh.position.copy(worldPos);
    scene.add(mesh);
    const tgt = { pos: worldPos.clone(), mesh, bearing: 0, born: state.time };
    state.targets.push(tgt);
    sfx.designate();
    state.callout = { text: 'TGT DESIGNATED', until: state.time + 1.4 };
  }

  return {
    fire, designate, spawnDrone,
    update(dt) {
      const combat = state.mode === 'COMBAT' && state.phase !== 'BOOT';

      // drone lifecycle
      if (combat) {
        if (!drone.alive) {
          drone.respawnIn -= dt;
          if (drone.respawnIn <= 0) spawnDrone();
        } else {
          const s = drone.seed + state.time;
          droneMesh.position.set(
            drone.base.x + Math.sin(s * 0.6) * 0.5,
            drone.base.y + Math.sin(s * 1.1) * 0.25,
            drone.base.z + Math.cos(s * 0.45) * 0.5
          );
          droneMesh.rotation.y += dt * 1.5;
          droneMesh.rotation.x += dt * 0.7;
        }
      } else if (drone.alive) {
        drone.alive = false;
        droneMesh.visible = false;
      }

      // lock-on logic (gaze cone on drone)
      brackets.visible = false;
      lockLabel.mesh.visible = false;
      if (combat && drone.alive) {
        _fwd.set(0, 0, -1).applyQuaternion(state.camQuat);
        _to.copy(droneMesh.position).sub(state.camPos);
        const dist = _to.length();
        _to.normalize();
        const inCone = _fwd.angleTo(_to) < 0.09;
        if (inCone) {
          lockProgress = Math.min(1, lockProgress + dt / 0.6);
          if (!locked && lockProgress >= 1) { locked = true; sfx.lock(); }
          else if (!locked && seekTick.ready(dt)) sfx.seek();
        } else {
          lockProgress = Math.max(0, lockProgress - dt / 0.3);
          if (locked && lockProgress < 0.4) locked = false;
        }
        if (lockProgress > 0.05) {
          brackets.visible = true;
          brackets.position.copy(droneMesh.position);
          brackets.quaternion.copy(state.camQuat);
          const sc = 2.4 - 1.4 * lockProgress;
          brackets.scale.setScalar(sc * (dist / 2));
          brackets.rotation.z = locked ? 0 : state.time * 2;
          lockLabel.mesh.visible = true;
          lockLabel.mesh.position.copy(droneMesh.position);
          lockLabel.mesh.position.y -= 0.16 * (dist / 2);
          lockLabel.mesh.quaternion.copy(state.camQuat);
          if (labelTick.ready(dt)) {
            drawLockLabel(
              locked ? `LOCK ${dist.toFixed(1)}M` : `SEEK ${Math.round(lockProgress * 100)}%`,
              locked ? state.theme.accent : state.theme.dim
            );
          }
        }
      } else {
        lockProgress = 0;
        locked = false;
      }
      state.locked = locked;

      // designated target maintenance
      for (const tgt of state.targets) {
        const dx = tgt.pos.x - state.camPos.x;
        const dz = tgt.pos.z - state.camPos.z;
        tgt.bearing = ((Math.atan2(dx, -dz) * 180 / Math.PI) - state.northOffset + 360) % 360;
        tgt.mesh.rotation.y += dt * 1.2;
        const bob = Math.sin(state.time * 2 + tgt.pos.x) * 0.01;
        tgt.mesh.position.y = tgt.pos.y + bob;
      }

      // muzzle flash / tracer decay
      if (flashT > 0) {
        flashT = Math.max(0, flashT - dt * 6);
        flashMat.opacity = flashT;
        flash.scale.setScalar(1 + (1 - flashT) * 2.5);
        tracerMat.opacity = flashT * 0.9;
        if (flashT === 0) flash.visible = false;
      }
      if (burstT > 0) {
        burstT = Math.max(0, burstT - dt * 2.2);
        burst.scale.setScalar(0.3 + (1 - burstT) * 1.6);
        matWarn.opacity = 0.95;
        burst.visible = burstT > 0;
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
      } else {
        pulse.visible = false;
        matP.opacity = 0.8;
      }
    }
  };
}
