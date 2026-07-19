import * as THREE from 'three';
import { Throttle } from './util.js';

// Live environment sensing — works in ANY space, no room capture needed.
// XR source: WebXR depth sensing (Quest 3 real-time depth, CPU access),
// sampled on a coarse grid and reprojected to world points.
// Sim source: a ray fan cast against the placeholder room objects.
// Points land in a decaying world-space cell grid; the minimap paints them
// as live sonar returns and the pulse scan lights them up.

export function createDepthSense(state, simMeshes, camera) {
  const tick = new Throttle(10);
  const cell = 0.35, ttl = 1.4;
  const cells = new Map();
  const returns = [];
  state.liveReturns = returns;
  state.depthLive = false;

  function addPoint(x, y, z) {
    if (y < 0.15 || y > 2.6) return; // drop floor/ceiling returns
    const dx = x - state.camPos.x, dz = z - state.camPos.z;
    if (dx * dx + dz * dz > 49) return;
    const k = `${Math.round(x / cell)}:${Math.round(z / cell)}`;
    const e = cells.get(k);
    if (e) { e.seen = state.time; e.p.set(x, y, z); }
    else cells.set(k, { p: new THREE.Vector3(x, y, z), seen: state.time });
  }

  function commitReturns() {
    returns.length = 0;
    for (const [k, v] of cells) {
      if (state.time - v.seen > ttl) { cells.delete(k); continue; }
      returns.push(v);
    }
  }

  // --- sim: horizontal ray fan at two heights ---
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
    return true;
  }

  // --- XR: coarse grid over the live depth map ---
  const _v = new THREE.Vector3();
  function xrScan(frame, refSpace) {
    if (!frame.getDepthInformation) return false;
    const pose = frame.getViewerPose(refSpace);
    if (!pose || !pose.views.length) return false;
    let depth = null;
    try { depth = frame.getDepthInformation(pose.views[0]); } catch (e) { return false; }
    if (!depth || !depth.getDepthInMeters) return false;
    const GX = 16, GY = 10;
    for (let gy = 0; gy < GY; gy++) {
      for (let gx = 0; gx < GX; gx++) {
        let d;
        try { d = depth.getDepthInMeters((gx + 0.5) / GX, (gy + 0.5) / GY); } catch (e) { continue; }
        if (!d || d < 0.35 || d > 7) continue;
        _v.set(((gx + 0.5) / GX) * 2 - 1, 1 - ((gy + 0.5) / GY) * 2, 0.5).unproject(camera);
        _v.sub(state.camPos).normalize().multiplyScalar(d).add(state.camPos);
        addPoint(_v.x, _v.y, _v.z);
      }
    }
    return true;
  }

  return {
    update(dt, frame, refSpace) {
      if (state.phase === 'BOOT') return;
      if (!tick.ready(dt)) return;
      state.depthLive = state.sim
        ? simScan()
        : !!(frame && refSpace && xrScan(frame, refSpace));
      commitReturns();
    }
  };
}
