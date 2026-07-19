import * as THREE from 'three';
import { makePanel, setFont, Throttle } from './util.js';
import { sfx } from '../audio.js';

// Environment scanner: acquires real-world geometry as tracked "contacts".
// XR source: WebXR plane/mesh detection with semantic labels (Quest Space Setup).
// Sim source: the placeholder room objects. Acquisition happens when the SCAN
// pulse sweeps past an object; contacts stay tracked until cleared or stale.

export function createContacts(state, scene) {
  function meshMat(kind, op) {
    const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: op, depthTest: false });
    m.color.setHex(kind === 'accent' ? state.theme.accentHex : state.theme.hex);
    state.themedMats.push({ mat: m, kind, baseOp: op });
    return m;
  }
  const matLow = meshMat('p', 0.7);
  const matWatch = meshMat('accent', 0.9);

  const contacts = [];
  state.contacts = contacts;
  const simCandidates = [];   // {center, size, quat, label}
  const xrTracked = new Map(); // XRPlane/XRMesh -> contact or candidate record
  let nextId = 1;

  const labelTick = new Throttle(2);
  const xrTick = new Throttle(2, 0.5);

  // corner brackets: 8 corners x 3 legs, built from thin box struts
  function bracketGroup(size, material) {
    const g = new THREE.Group();
    const t = 0.014;
    const legLen = axis => Math.min(size[axis] * 0.3, 0.22);
    const [lx, ly, lz] = [legLen('x'), legLen('y'), legLen('z')];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * size.x / 2, cy = sy * size.y / 2, cz = sz * size.z / 2;
      const legs = [
        [lx, t, t, cx - sx * lx / 2, cy, cz],
        [t, ly, t, cx, cy - sy * ly / 2, cz],
        [t, t, lz, cx, cy, cz - sz * lz / 2],
      ];
      for (const [w, h, d, px, py, pz] of legs) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        m.position.set(px, py, pz);
        m.renderOrder = 8;
        g.add(m);
      }
    }
    return g;
  }

  function assess(cnt) {
    const range = cnt.center.distanceTo(state.camPos);
    if (range < 1.1) return 'CLOSE';
    const unknown = cnt.label === 'OBJECT' || cnt.label === 'UNKNOWN' || cnt.label === 'GLOBAL MESH';
    if (unknown && cnt.size.y > 1.2) return 'WATCH';
    return 'LOW';
  }

  function drawLabel(cnt) {
    const { c2d, canvas } = cnt.panel;
    cnt.panel.clear();
    const t = state.theme, W = canvas.width, H = canvas.height;
    c2d.fillStyle = 'rgba(4,12,12,0.6)';
    c2d.fillRect(0, 0, W, H);
    c2d.strokeStyle = cnt.assess === 'LOW' ? t.dim : t.accent;
    c2d.lineWidth = 3;
    c2d.strokeRect(2, 2, W - 4, H - 4);
    const range = cnt.center.distanceTo(state.camPos);
    setFont(c2d, 30, true);
    c2d.textAlign = 'left';
    c2d.fillStyle = t.p;
    c2d.fillText(`CNT-${String(cnt.id).padStart(2, '0')} ${cnt.label}`, 14, 42);
    setFont(c2d, 25, true);
    c2d.fillStyle = cnt.assess === 'LOW' ? t.dim : t.accent;
    c2d.fillText(
      `${range.toFixed(1)}M · ${cnt.size.x.toFixed(1)}×${cnt.size.y.toFixed(1)} · ${cnt.assess}`,
      14, 78
    );
    cnt.panel.commit();
  }

  function acquire(cand) {
    const cnt = {
      id: nextId++,
      label: cand.label,
      center: cand.center.clone(),
      size: cand.size.clone(),
      quat: cand.quat ? cand.quat.clone() : new THREE.Quaternion(),
      assess: 'LOW',
      seen: state.time,
      src: cand.src,
    };
    cnt.assess = assess(cnt);
    cnt.group = bracketGroup(cnt.size, cnt.assess === 'LOW' ? matLow : matWatch);
    cnt.group.position.copy(cnt.center);
    cnt.group.quaternion.copy(cnt.quat);
    scene.add(cnt.group);
    cnt.panel = makePanel(state, 0.30, 0.085, 448, 128);
    cnt.panel.mesh.renderOrder = 12;
    scene.add(cnt.panel.mesh);
    drawLabel(cnt);
    contacts.push(cnt);
    sfx.pip();
    return cnt;
  }

  function dispose(cnt) {
    scene.remove(cnt.group);
    scene.remove(cnt.panel.mesh);
    cnt.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }

  function setAssess(cnt, a) {
    if (a === cnt.assess) return;
    cnt.assess = a;
    const mat = a === 'LOW' ? matLow : matWatch;
    cnt.group.traverse(o => { if (o.isMesh) o.material = mat; });
  }

  // --- one-shot pulse scan (wrist panel): shockwave + fading highlights ---
  const ringPts = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const ringMat = new THREE.LineBasicMaterial({
    transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), ringMat);
  ring.renderOrder = 7;
  ring.visible = false;
  scene.add(ring);
  let wave = null; // {r, prevR}
  const highlights = [];
  const _iq = new THREE.Quaternion();

  function spawnHighlight(center, size, quat) {
    const hex = state.theme.hex;
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const fillMat = new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity: 0.2, depthTest: false, blending: THREE.AdditiveBlending });
    const edgeMat = new THREE.LineBasicMaterial({
      color: hex, transparent: true, opacity: 0.9, depthTest: false });
    const fill = new THREE.Mesh(geo, fillMat);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    for (const o of [fill, edges]) {
      o.position.copy(center);
      o.quaternion.copy(quat || _iq);
      o.renderOrder = 7;
      scene.add(o);
    }
    highlights.push({ objs: [fill, edges], mats: [fillMat, edgeMat], baseOps: [0.2, 0.9], born: state.time });
    sfx.tick();
  }

  function pulseScan() {
    if (wave || state.phase === 'BOOT') return;
    ringMat.color.setHex(state.theme.hex);
    wave = { r: 0.05, prevR: 0 };
    ring.visible = true;
    sfx.ping();
    state.callout = { text: 'PULSE SCAN', until: state.time + 1.2 };
  }

  function updatePulse(dt) {
    if (wave) {
      wave.prevR = wave.r;
      wave.r += dt * 4.2;
      ring.position.set(state.camPos.x, 0.02, state.camPos.z);
      ring.scale.setScalar(wave.r);
      ringMat.opacity = Math.max(0, 0.9 * (1 - wave.r / 8));
      const crossed = c => {
        const d = c.distanceTo(state.camPos);
        return d > wave.prevR && d <= wave.r;
      };
      for (const cand of simCandidates) if (crossed(cand.center)) spawnHighlight(cand.center, cand.size, cand.quat);
      for (const rec of xrTracked.values()) if (crossed(rec.center)) spawnHighlight(rec.center, rec.size, rec.quat);
      if (wave.r > 8) { wave = null; ring.visible = false; }
    }
    for (let i = highlights.length - 1; i >= 0; i--) {
      const h = highlights[i];
      const f = 1 - (state.time - h.born) / 2.4;
      if (f <= 0) {
        for (const o of h.objs) { scene.remove(o); if (o.geometry) o.geometry.dispose(); }
        for (const m of h.mats) m.dispose();
        highlights.splice(i, 1);
        continue;
      }
      const e = f < 0.7 ? f / 0.7 : 1; // hold, then fade out
      h.mats.forEach((m, k) => { m.opacity = h.baseOps[k] * e; });
    }
  }

  // true when the expanding sweep crossed this range since the last frame
  let lastScanR = 0;
  function sweepHits(center) {
    const r = state.scanR || 0;
    if (r <= 0) return false;
    const d = center.distanceTo(state.camPos);
    return r >= lastScanR
      ? (d > lastScanR && d <= r)
      : (d > lastScanR || d <= r); // sweep wrapped to a new cycle
  }

  // --- XR plane/mesh ingestion (records only; acquisition happens per-frame) ---
  const _m4 = new THREE.Matrix4();
  function xrIngest(frame, refSpace) {
    const seen = new Set();
    let planes = 0, meshes = 0;
    const handle = (item, space, computeBox, labelOf) => {
      seen.add(item);
      const pose = frame.getPose(space, refSpace);
      if (!pose) return;
      let rec = xrTracked.get(item);
      if (!rec) {
        const box = computeBox(item);
        if (!box) return;
        const label = labelOf(item);
        if (label === 'FLOOR' || label === 'CEILING') return; // room-sized boxes are noise
        rec = {
          src: 'xr',
          label,
          center: new THREE.Vector3(),
          size: box.size,
          local: box.center,
          quat: new THREE.Quaternion(),
          contact: null,
        };
        xrTracked.set(item, rec);
      }
      _m4.fromArray(pose.transform.matrix);
      rec.center.copy(rec.local).applyMatrix4(_m4);
      rec.quat.setFromRotationMatrix(_m4);
      rec.lastSeen = state.time;
      if (rec.contact) {
        rec.contact.center.copy(rec.center);
        rec.contact.quat.copy(rec.quat);
        rec.contact.group.position.copy(rec.center);
        rec.contact.group.quaternion.copy(rec.quat);
        rec.contact.seen = state.time;
      }
    };

    if (frame.detectedPlanes) {
      for (const plane of frame.detectedPlanes) {
        planes++;
        handle(plane, plane.planeSpace, p => {
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (const pt of p.polygon) {
            minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
            minZ = Math.min(minZ, pt.z); maxZ = Math.max(maxZ, pt.z);
          }
          if (!isFinite(minX)) return null;
          return {
            size: new THREE.Vector3(Math.max(0.05, maxX - minX), 0.05, Math.max(0.05, maxZ - minZ)),
            center: new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
          };
        }, p => (p.semanticLabel || 'PLANE').toUpperCase().replace(/_/g, ' '));
      }
    }
    if (frame.detectedMeshes) {
      for (const mesh of frame.detectedMeshes) {
        meshes++;
        handle(mesh, mesh.meshSpace, m => {
          const v = m.vertices;
          if (!v || v.length < 9) return null;
          let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
          for (let i = 0; i < v.length; i += 3) {
            for (let k = 0; k < 3; k++) {
              if (v[i + k] < min[k]) min[k] = v[i + k];
              if (v[i + k] > max[k]) max[k] = v[i + k];
            }
          }
          return {
            size: new THREE.Vector3(
              Math.max(0.05, max[0] - min[0]),
              Math.max(0.05, max[1] - min[1]),
              Math.max(0.05, max[2] - min[2])),
            center: new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2),
          };
        }, m => (m.semanticLabel || 'GLOBAL MESH').toUpperCase().replace(/_/g, ' '));
      }
    }

    // stale XR items no longer reported
    for (const [item, rec] of xrTracked) {
      if (!seen.has(item) && state.time - (rec.lastSeen || 0) > 5) {
        if (rec.contact) {
          const i = contacts.indexOf(rec.contact);
          if (i >= 0) contacts.splice(i, 1);
          dispose(rec.contact);
        }
        xrTracked.delete(item);
      }
    }

    state.sensor = { planes, meshes, supported: !!(frame.detectedPlanes || frame.detectedMeshes) };
  }

  return {
    pulseScan,
    registerSim(mesh, size, label = 'OBJECT') {
      simCandidates.push({
        src: 'sim', label,
        center: mesh.position.clone(),
        size: new THREE.Vector3(size.x, size.y, size.z),
        quat: mesh.quaternion.clone(),
        contact: null,
      });
    },
    clear() {
      for (const cnt of contacts) dispose(cnt);
      contacts.length = 0;
      for (const cand of simCandidates) cand.contact = null;
      for (const rec of xrTracked.values()) rec.contact = null;
    },
    update(dt, frame, refSpace) {
      const active = state.phase !== 'BOOT';
      const show = active && state.mode === 'SCAN';
      updatePulse(dt);

      if (frame && refSpace && active && xrTick.ready(dt)) xrIngest(frame, refSpace);

      // acquisition on sweep pass — every frame, both sources
      if (show) {
        for (const cand of simCandidates) {
          if (!cand.contact && sweepHits(cand.center)) {
            cand.contact = acquire(cand);
          }
        }
        for (const rec of xrTracked.values()) {
          if (!rec.contact && sweepHits(rec.center)) {
            rec.contact = acquire(rec);
            rec.contact.seen = state.time;
          }
        }
      }
      lastScanR = state.scanR || 0;

      const doLabels = labelTick.ready(dt);
      for (const cnt of contacts) {
        cnt.group.visible = show;
        cnt.panel.mesh.visible = show;
        if (!show) continue;
        setAssess(cnt, assess(cnt));
        cnt.panel.mesh.position.set(
          cnt.center.x,
          cnt.center.y + cnt.size.y / 2 + 0.12,
          cnt.center.z
        );
        cnt.panel.mesh.quaternion.copy(state.camQuat);
        const range = cnt.center.distanceTo(state.camPos);
        const s = THREE.MathUtils.clamp(range / 2.2, 0.7, 2.2);
        cnt.panel.mesh.scale.setScalar(s);
        if (doLabels) drawLabel(cnt);
      }
    }
  };
}
