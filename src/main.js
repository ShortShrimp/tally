import * as THREE from 'three';
import { THEMES, retheme, applyBrightness } from './hud/util.js';
import { initAudio, sfx } from './audio.js';
import { createRig, updateRig } from './hud/rig.js';
import { createFlight } from './hud/flight.js';
import { createMinimap } from './hud/minimap.js';
import { createTargeting } from './hud/targeting.js';
import { createContacts } from './hud/contacts.js';
import { createPanels } from './hud/panels.js';
import { createBoot } from './hud/boot.js';
import { createSimControls } from './simcontrols.js';

const MODES = ['NAV', 'SCAN'];

export async function start(sim) {
  initAudio();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 80);
  camera.position.set(0, 1.7, 0);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- state ----------
  const state = {
    sim,
    phase: 'BOOT',
    mode: 'NAV',
    time: 0,
    theme: THEMES.teal,
    themeName: 'teal',
    themedMats: [],
    panelMats: [],
    brightness: 1,
    minimapOn: true,
    mapNorthUp: false,
    wristOpen: false,
    wristHover: -1,
    wristAnchor: null,
    hands: { left: null, right: null },
    palmPos: null,
    northOffset: 0,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, alt: 1.7, g: 1,
    camPos: new THREE.Vector3(),
    camQuat: new THREE.Quaternion(),
    camQuatInv: new THREE.Quaternion(),
    camMatrixInv: new THREE.Matrix4(),
    velocity: new THREE.Vector3(),
    core: 87,
    hasBattery: false,
    fps: 72,
    shake: 0,
    alerts: new Map(),
    callout: null,
    crumbs: [],
    targets: [],
  };

  window.TALLY = state; // debug handle

  if (navigator.getBattery) {
    navigator.getBattery().then(b => {
      state.hasBattery = true;
      const sync = () => { state.core = Math.round(b.level * 100); };
      sync();
      b.addEventListener('levelchange', sync);
    }).catch(() => {});
  }

  state.cycleMode = () => {
    if (state.phase === 'BOOT') return;
    const i = MODES.indexOf(state.mode);
    state.mode = MODES[(i + 1) % MODES.length];
    state.phase = state.mode;
    sfx.confirm();
    state.callout = { text: `MODE ${state.mode}`, until: state.time + 1.2 };
  };
  state.cycleTheme = () => {
    const names = Object.keys(THEMES);
    state.themeName = names[(names.indexOf(state.themeName) + 1) % names.length];
    state.theme = THEMES[state.themeName];
    retheme(state);
    sfx.pip();
  };
  state.rezeroNorth = () => {
    state.northOffset = (state.heading + state.northOffset + 360) % 360;
    state.callout = { text: 'NORTH RE-ZEROED', until: state.time + 1.4 };
  };
  state.clearTargets = () => {
    for (const t of state.targets) scene.remove(t.mesh);
    state.targets = [];
    if (state.clearContacts) state.clearContacts();
  };
  state.resetSession = () => {
    state.clearTargets();
    state.crumbs = [];
    if (!state.hasBattery) state.core = 87;
    state.time = 0;
    state.callout = { text: 'SESSION RESET', until: 1.4 };
  };

  // ---------- sim environment ----------
  const simObjects = [];
  if (sim) {
    scene.background = new THREE.Color(0x0a0f13);
    scene.fog = new THREE.Fog(0x0a0f13, 6, 26);
    const grid = new THREE.GridHelper(30, 30, 0x1c3a38, 0x142226);
    scene.add(grid);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0x16242a, wireframe: false });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x2b4a4e });
    const simLabels = ['TABLE', 'STORAGE', 'SCREEN', 'OBJECT', 'COUCH', 'OBJECT', 'SHELF', 'OBJECT'];
    for (let i = 0; i < 14; i++) {
      const w = 0.5 + Math.random() * 1.4, h = 0.6 + Math.random() * 2.4, d = 0.5 + Math.random() * 1.4;
      const geo = new THREE.BoxGeometry(w, h, d);
      const box = new THREE.Mesh(geo, boxMat);
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 9;
      box.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      box.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
      scene.add(box);
      simObjects.push({ mesh: box, size: { x: w, y: h, z: d }, label: simLabels[i % simLabels.length] });
    }
  }

  // ---------- HUD modules ----------
  const groups = createRig(scene);
  const flight = createFlight(state, groups);
  const minimap = createMinimap(state, groups);
  const targeting = createTargeting(state, groups, scene);
  const contacts = createContacts(state, scene);
  for (const o of simObjects) contacts.registerSim(o.mesh, o.size, o.label);
  state.clearContacts = contacts.clear;
  const panels = createPanels(state, groups);
  const boot = createBoot(state, groups);
  state.applyBrightness = () => applyBrightness(state);

  // ---------- input ----------
  let simControls = null;
  let latestHit = null;
  let hitTestSource = null;
  let xrSession = null;

  const actions = {
    tap: () => { if (state.phase === 'BOOT') boot.skip(); else targeting.toggleAtGaze(latestHit); },
    toggleMap: () => { state.minimapOn = !state.minimapOn; sfx.pip(); },
    cycleMode: () => state.cycleMode(),
    toggleWrist: () => { state.wristOpen = !state.wristOpen; sfx.pip(); },
    toggleNorthUp: () => { state.mapNorthUp = !state.mapNorthUp; sfx.pip(); },
    cycleTheme: () => state.cycleTheme(),
    pressButton: (i) => { if (state.wristOpen) panels.pressButton(i); },
    skipBoot: () => boot.skip(),
  };

  if (sim) {
    simControls = createSimControls(state, camera, renderer.domElement, actions);
  } else {
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'hit-test', 'anchors', 'plane-detection', 'mesh-detection']
    });
    await renderer.xr.setSession(xrSession);
    xrSession.addEventListener('end', () => location.reload());

    xrSession.addEventListener('select', () => actions.tap());
    xrSession.addEventListener('squeeze', (e) => {
      if (e.inputSource.handedness === 'left') actions.toggleMap();
      else actions.cycleMode();
    });

    if (xrSession.requestHitTestSource) {
      try {
        const viewerSpace = await xrSession.requestReferenceSpace('viewer');
        hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
      } catch (e) { hitTestSource = null; }
    }
  }

  // ---------- XR hands ----------
  const JOINTS = ['wrist', 'thumb-tip', 'index-finger-tip'];
  let wristLookTimer = 0;
  let wristPressCooldown = 0;

  function pollHands(frame, refSpace, dt) {
    state.hands.left = state.hands.right = null;
    state.palmPos = null;
    state.wristAnchor = null;
    let leftWristPose = null, rightIndexTip = null;

    for (const source of xrSession.inputSources) {
      if (!source.hand) continue;
      const wristJoint = source.hand.get('wrist');
      if (!wristJoint) continue;
      const pose = frame.getJointPose ? frame.getJointPose(wristJoint, refSpace) : null;
      if (!pose) continue;
      const p = new THREE.Vector3().copy(pose.transform.position);
      state.hands[source.handedness] = p;
      if (source.handedness === 'left') leftWristPose = p;
      if (source.handedness === 'right') {
        state.palmPos = p;
        const tip = source.hand.get('index-finger-tip');
        const tipPose = tip && frame.getJointPose(tip, refSpace);
        if (tipPose) rightIndexTip = new THREE.Vector3().copy(tipPose.transform.position);
      }
    }

    // wrist panel auto-open: look at left wrist
    if (leftWristPose) {
      state.wristAnchor = leftWristPose;
      const toWrist = leftWristPose.clone().sub(state.camPos).normalize();
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(state.camQuat);
      const dot = fwd.dot(toWrist);
      if (dot > 0.9) { wristLookTimer = 1.2; state.wristOpen = true; }
    }
    if (wristLookTimer > 0) wristLookTimer -= dt;
    else if (state.wristAnchor) state.wristOpen = false;

    // wrist button press with right index tip
    state.wristHover = -1;
    if (state.wristOpen && rightIndexTip && panels.wristMesh.visible) {
      const local = panels.wristMesh.worldToLocal(rightIndexTip.clone());
      const u = (local.x + 0.13) / 0.26;
      const v = (0.17 - local.y) / 0.34;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && Math.abs(local.z) < 0.05) {
        const i = panels.hitButton(u, v);
        state.wristHover = i;
        if (i >= 0 && Math.abs(local.z) < 0.015 && wristPressCooldown <= 0) {
          panels.pressButton(i);
          wristPressCooldown = 0.6;
        }
      }
    }
  }

  // ---------- main loop ----------
  const euler = new THREE.Euler();
  const prevPos = new THREE.Vector3(0, 1.7, 0);
  const smoothVel = new THREE.Vector3();
  const prevVel = new THREE.Vector3();
  let lastT = performance.now();
  let fpsAcc = 0, fpsN = 0;

  renderer.setAnimationLoop((now, frame) => {
    const dt = Math.min(0.25, Math.max(0.001, (now - lastT) / 1000));
    lastT = now;
    state.time += dt;

    if (simControls) simControls.update(dt);

    // camera pose
    camera.getWorldPosition(state.camPos);
    camera.getWorldQuaternion(state.camQuat);
    state.camQuatInv.copy(state.camQuat).invert();
    camera.updateMatrixWorld();
    state.camMatrixInv.copy(camera.matrixWorld).invert();

    euler.setFromQuaternion(state.camQuat, 'YXZ');
    const rawHeading = ((-THREE.MathUtils.radToDeg(euler.y)) % 360 + 360) % 360;
    state.heading = (rawHeading - state.northOffset + 360) % 360;
    state.pitch = euler.x;
    state.roll = euler.z;
    state.alt = state.camPos.y;

    // velocity / g
    const instVel = state.camPos.clone().sub(prevPos).divideScalar(dt);
    prevPos.copy(state.camPos);
    smoothVel.lerp(instVel, Math.min(1, dt * 8));
    state.velocity.copy(smoothVel);
    state.speed = smoothVel.length();
    const accel = smoothVel.clone().sub(prevVel).divideScalar(dt);
    prevVel.copy(smoothVel);
    state.g = Math.min(9.9, 1 + accel.length() / 9.81);

    // fps
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { state.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

    // simulated core when the battery API is unavailable
    if (!state.hasBattery) state.core = Math.min(100, state.core + dt * 0.6);

    // alerts
    const setAlert = (key, level, msg, active) => {
      if (active) state.alerts.set(key, { level, msg });
      else state.alerts.delete(key);
    };
    setAlert('core-low', 'caution', 'CORE LOW', state.core < 20 && state.core >= 10);
    setAlert('core-crit', 'warn', 'CORE CRITICAL', state.core < 10);
    setAlert('over-g', 'warn', 'OVER-G / EASE OFF', state.g > 3.2 || state.speed > 3.4);
    const hasWarn = [...state.alerts.values()].some(a => a.level === 'warn');
    if (hasWarn && state.phase !== 'BOOT') {
      state._klaxT = (state._klaxT || 0) - dt;
      if (state._klaxT <= 0) { sfx.klaxon(); state._klaxT = 1.3; }
    }

    // XR frame data
    if (!sim && frame && xrSession) {
      const refSpace = renderer.xr.getReferenceSpace();
      if (wristPressCooldown > 0) wristPressCooldown -= dt;
      pollHands(frame, refSpace, dt);
      latestHit = null;
      if (hitTestSource) {
        const hits = frame.getHitTestResults(hitTestSource);
        if (hits.length) {
          const pose = hits[0].getPose(refSpace);
          if (pose) latestHit = new THREE.Vector3().copy(pose.transform.position);
        }
      }
    }

    state.shake = Math.max(0, state.shake - dt * 3);
    updateRig(groups, camera, dt, state.shake);

    boot.update(dt);
    flight.update(dt);
    minimap.update(dt);
    targeting.update(dt);
    contacts.update(dt, (!sim && frame) ? frame : null, (!sim && frame) ? renderer.xr.getReferenceSpace() : null);
    panels.update(dt);

    if (state.callout && state.time > state.callout.until) state.callout = null;

    renderer.render(scene, camera);
  });

  return true;
}
