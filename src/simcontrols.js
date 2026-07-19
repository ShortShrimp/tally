import * as THREE from 'three';

export function createSimControls(state, camera, dom, actions) {
  let yaw = 0, pitch = 0;
  let dragging = false, lastX = 0, lastY = 0;
  const keys = new Set();
  const pos = new THREE.Vector3(0, 1.7, 0);
  const has = (...names) => names.some(n => keys.has(n));

  dom.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * 0.0032;
    pitch -= (e.clientY - lastY) * 0.0032;
    pitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);
    lastX = e.clientX; lastY = e.clientY;
  });
  dom.addEventListener('click', () => { actions.tap(); });

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = (e.key || '').toLowerCase();
    keys.add(e.code);
    keys.add(k);
    if (k === 'm') actions.toggleMap();
    else if (k === 't') actions.cycleMode();
    else if (k === 'p') actions.toggleWrist();
    else if (k === 'n') actions.toggleNorthUp();
    else if (k === 'c') actions.cycleTheme();
    else if (k === 'f') actions.tap();
    else if (k === ' ' || e.code === 'Space') actions.skipBoot();
    else if (/^[1-9]$/.test(k)) actions.pressButton(Number(k) - 1);
  });
  window.addEventListener('keyup', e => {
    keys.delete(e.code);
    keys.delete((e.key || '').toLowerCase());
  });

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();

  return {
    update(dt) {
      const speed = has('ShiftLeft', 'shift') ? 3.4 : 1.6;
      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      if (has('KeyW', 'w')) pos.addScaledVector(fwd, speed * dt);
      if (has('KeyS', 's')) pos.addScaledVector(fwd, -speed * dt);
      if (has('KeyA', 'a')) pos.addScaledVector(right, -speed * dt);
      if (has('KeyD', 'd')) pos.addScaledVector(right, speed * dt);
      if (has('KeyQ', 'q')) pos.y = Math.max(0.4, pos.y - 1.2 * dt);
      if (has('KeyE', 'e')) pos.y = Math.min(3.0, pos.y + 1.2 * dt);
      camera.position.copy(pos);
      camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    }
  };
}
