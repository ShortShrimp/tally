import * as THREE from 'three';
import { Throttle } from './util.js';

// Live environment sensing.
//
// XR source: a fan of WebXR hit-test sources, each with its own offsetRay
// spread across the FOV. On Quest 3/3S with Horizon Browser 40.4+, hit-test is
// backed by Meta's Depth API and lands on real surfaces in UNSCANNED rooms —
// no Space Setup. Range is roughly 5 m. This is sparse (a few dozen samples a
// second), not a depth image: Quest Browser does not expose depth buffers to
// web pages at all.
//
// Sim source: a ray fan cast at the placeholder room objects. This is a
// stand-in for development only and proves nothing about the headset.
//
// Hits land in a decaying world-space cell grid; the minimap paints them as
// sonar traces and the pulse scan lights them up.

const FAN = [];
for (let gy = -1; gy <= 1; gy++) {
  for (let gx = -2; gx <= 2; gx++) {
    FAN.push([gx * 15 * Math.PI / 180, gy * 14 * Math.PI / 180]);
  }
}

export function createSense(state, simMeshes, camera) {
  const tick = new Throttle(12);
  const cell = 0.35, ttl = 1.4;
  const cells = new Map();
  const returns = [];
  state.liveReturns = returns;

  const sources = [];       // {src, live}
  let requested = 0;
  let hitCount = 0, hitAcc = 0, rateWin = 0;

  state.sense = { sources: 0, live: 0, rate: 0, ready: false, mode: state.sim ? 'SIM' : 'HIT' };

  function addPoint(x, y, z) {
    if (y < 0.15 || y > 2.6) return; // drop floor/ceiling returns
    const dx = x - state.camPos.x, dz = z - state.camPos.z;
    if (dx * dx + dz * dz > 49) return;
    const k = `${Math.round(x / cell)}:${Math.round(z / cell)}`;
    const e = cells.get(k);
    if (e) { e.seen = state.time; e.p.set(x, y, z); }
    else cells.set(k, { p: new THREE.Vector3(x, y, z), seen: state.time });
    hitCount++;
  }

  function commitReturns() {
    returns.length = 0;
    for (const [k, v] of cells) {
      if (state.time - v.seen > ttl) { cells.delete(k); continue; }
      returns.push(v);
    }
  }

  // --- XR: build the hit-test fan once, against viewer space ---
  async function initFan(session) {
    if (!session.requestHitTestSource) return;
    let viewerSpace;
    try { viewerSpace = await session.requestReferenceSpace('viewer'); } catch (e) { return; }
    for (const [yaw, pitch] of FAN) {
      requested++;
      const dir = {
        x: Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: -Math.cos(yaw) * Math.cos(pitch),
        w: 0
      };
      try {
        const src = await session.requestHitTestSource({
          space: viewerSpace,
          offsetRay: new XRRay({ x: 0, y: 0, z: 0, w: 1 }, dir)
        });
        if (src) sources.push({ src, live: false });
      } catch (e) { /* browser refused this source; count stays honest */ }
    }
    state.sense.sources = sources.length;
    state.sense.ready = sources.length > 0;
  }

  const _p = new THREE.Vector3();
  function xrScan(frame, refSpace) {
    let live = 0;
    for (const s of sources) {
      let results;
      try { results = frame.getHitTestResults(s.src); } catch (e) { continue; }
      if (!results || !results.length) { s.live = false; continue; }
      const pose = results[0].getPose(refSpace);
      if (!pose) { s.live = false; continue; }
      s.live = true;
      live++;
      _p.copy(pose.transform.position);
      addPoint(_p.x, _p.y, _p.z);
    }
    state.sense.live = live;
    return live > 0;
  }

  // --- sim: horizontal ray fan at two heights (development stand-in) ---
  const ray = new THREE.Raycaster();
  ray.far = 7;
  const _dir = new THREE.Vector3();
  function simScan() {
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      for (const h of [-0.2, 0.12]) {
        _dir.set(Math.sin(a), h, -Math.cos(a)).normalize();
        ray.set(state.camPos, _dir);
        const hit = ray.intersectObjects(simMeshes, false)[0];
        if (hit) addPoint(hit.point.x, hit.point.y, hit.point.z);
      }
    }
    state.sense.sources = 112;
    state.sense.live = returns.length ? 112 : 0;
    state.sense.ready = true;
    return true;
  }

  return {
    initFan,
    update(dt, frame, refSpace) {
      if (state.phase === 'BOOT') return;

      // hit rate over a rolling second, so the readout reflects reality
      rateWin += dt;
      if (rateWin >= 1) {
        state.sense.rate = Math.round(hitCount / rateWin);
        hitCount = 0; rateWin = 0;
      }

      if (!tick.ready(dt)) return;
      if (state.sim) simScan();
      else if (frame && refSpace) xrScan(frame, refSpace);
      commitReturns();
    }
  };
}
