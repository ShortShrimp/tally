import * as THREE from 'three';
import { makePanel, setFont, Throttle } from './util.js';
import { sfx } from '../audio.js';

export function createPanels(state, groups) {
  // --- vitals column (right) ---
  const vitals = makePanel(state, 0.30, 0.42, 384, 540);
  vitals.mesh.position.set(0.52, -0.02, -1.55);
  vitals.mesh.rotation.y = -0.28;
  groups.rig.add(vitals.mesh);

  // --- alerts + callouts (top center) ---
  const alerts = makePanel(state, 0.5, 0.16, 640, 208);
  alerts.mesh.position.set(0, 0.28, -1.58);
  groups.rig.add(alerts.mesh);

  // --- wrist / control panel ---
  const wrist = makePanel(state, 0.26, 0.34, 384, 500);
  wrist.mesh.visible = false;
  groups.rig.add(wrist.mesh); // sim: fixed placement; XR: repositioned to wrist each frame

  const vitalsTick = new Throttle(10);
  const alertsTick = new Throttle(15, 0.3);
  const wristTick = new Throttle(10, 0.6);

  const buttons = [
    { label: () => `MODE: ${state.mode}`, act: () => state.cycleMode() },
    { label: () => `MINIMAP: ${state.minimapOn ? 'ON' : 'OFF'}`, act: () => { state.minimapOn = !state.minimapOn; sfx.pip(); } },
    { label: () => `MAP: ${state.mapNorthUp ? 'NORTH-UP' : 'HDG-UP'}`, act: () => { state.mapNorthUp = !state.mapNorthUp; sfx.pip(); } },
    { label: () => `THEME: ${state.theme.name}`, act: () => state.cycleTheme() },
    { label: () => `BRIGHT: ${Math.round(state.brightness * 100)}%`, act: () => { state.brightness = state.brightness >= 1 ? 0.4 : Math.min(1, state.brightness + 0.2); state.applyBrightness(); sfx.pip(); } },
    { label: () => 'RE-ZERO NORTH', act: () => { state.rezeroNorth(); sfx.confirm(); } },
    { label: () => 'CLEAR TARGETS', act: () => { state.clearTargets(); sfx.confirm(); } },
    { label: () => 'RESET SESSION', act: () => { state.resetSession(); sfx.confirm(); } },
  ];
  const BTN_H = 48, BTN_STEP = 56, BTN_TOP = 50;

  function drawVitals() {
    const { c2d, canvas } = vitals;
    vitals.clear();
    const t = state.theme, W = canvas.width;
    const num = (v, d = 1) => Number(v).toFixed(d);
    c2d.textAlign = 'left';

    let y = 44;
    const row = (label, value, unit = '', color = t.p) => {
      setFont(c2d, 22, true);
      c2d.fillStyle = t.dim;
      c2d.fillText(label, 18, y);
      setFont(c2d, 36, true);
      c2d.fillStyle = color;
      c2d.fillText(value, 110, y);
      if (unit) {
        setFont(c2d, 19, true);
        c2d.fillStyle = t.dim;
        c2d.fillText(unit, 110 + c2d.measureText(value).width + value.length * 15, y);
      }
      y += 52;
    };

    row('SPD', num(state.speed, 2), 'M/S');
    row('ALT', num(state.alt, 2), 'M');
    row('G', num(state.g, 1), '', state.g > 2.5 ? t.warn : t.p);

    // core bar
    y += 4;
    setFont(c2d, 22, true);
    c2d.fillStyle = t.dim;
    c2d.fillText('CORE', 18, y);
    const coreColor = state.core < 20 ? t.warn : t.p;
    setFont(c2d, 32, true);
    c2d.fillStyle = coreColor;
    c2d.fillText(`${Math.round(state.core)}%`, 110, y);
    y += 16;
    c2d.strokeStyle = t.dim;
    c2d.lineWidth = 3;
    c2d.strokeRect(18, y, W - 60, 16);
    c2d.fillStyle = coreColor;
    c2d.fillRect(21, y + 3, (W - 66) * state.core / 100, 10);
    y += 52;

    const clock = new Date();
    const pad = n => String(n).padStart(2, '0');
    row('CLK', `${pad(clock.getHours())}:${pad(clock.getMinutes())}:${pad(clock.getSeconds())}`);
    row('MSN', `${pad(Math.floor(state.time / 60))}:${pad(Math.floor(state.time % 60))}`);

    setFont(c2d, 22, true);
    c2d.fillStyle = t.dim;
    c2d.fillText('MODE', 18, y);
    setFont(c2d, 32, true);
    c2d.fillStyle = state.mode === 'SCAN' ? t.accent : t.p;
    c2d.fillText(state.mode, 110, y);
    y += 46;

    setFont(c2d, 22, true);
    c2d.fillStyle = t.dim;
    c2d.fillText('CNT', 18, y);
    setFont(c2d, 32, true);
    c2d.fillStyle = t.p;
    c2d.fillText(String((state.contacts || []).length), 110, y);
    c2d.fillStyle = t.dim;
    setFont(c2d, 20, true);
    c2d.fillText(`FPS ${Math.round(state.fps)}`, 210, y);
    vitals.commit();
  }

  function drawAlerts() {
    const { c2d, canvas } = alerts;
    alerts.clear();
    const t = state.theme, W = canvas.width;
    c2d.textAlign = 'center';
    const warns = [...state.alerts.values()].filter(a => a.level === 'warn');
    const cautions = [...state.alerts.values()].filter(a => a.level === 'caution');
    let y = 8;
    if (warns.length && Math.floor(state.time * 3) % 2 === 0) {
      setFont(c2d, 40, true);
      c2d.fillStyle = t.warn;
      c2d.fillText('MASTER CAUTION', W / 2, y + 42);
      c2d.strokeStyle = t.warn;
      c2d.lineWidth = 3;
      c2d.strokeRect(W / 2 - 190, y, 380, 56);
    }
    y += 74;
    setFont(c2d, 26, true);
    for (const a of [...warns, ...cautions].slice(0, 3)) {
      c2d.fillStyle = a.level === 'warn' ? t.warn : t.accent;
      c2d.fillText(a.msg, W / 2, y);
      y += 32;
    }
    if (state.callout && state.time < state.callout.until) {
      setFont(c2d, 30, true);
      c2d.fillStyle = t.accent;
      c2d.fillText(state.callout.text, W / 2, canvas.height - 16);
    }
    alerts.commit();
  }

  function drawWrist(hover = -1) {
    const { c2d, canvas } = wrist;
    wrist.clear();
    const t = state.theme, W = canvas.width;
    c2d.fillStyle = 'rgba(4,12,12,0.6)';
    c2d.fillRect(0, 0, W, canvas.height);
    c2d.strokeStyle = t.dim;
    c2d.lineWidth = 2;
    c2d.strokeRect(2, 2, W - 4, canvas.height - 4);
    setFont(c2d, 24, true);
    c2d.fillStyle = t.p;
    c2d.textAlign = 'center';
    c2d.fillText('TALLY // SYS', W / 2, 36);
    buttons.forEach((b, i) => {
      const yTop = BTN_TOP + i * BTN_STEP;
      c2d.fillStyle = i === hover ? t.faint : 'rgba(255,255,255,0.03)';
      c2d.fillRect(14, yTop, W - 28, BTN_H);
      c2d.strokeStyle = t.dim;
      c2d.strokeRect(14, yTop, W - 28, BTN_H);
      setFont(c2d, 22, true);
      c2d.fillStyle = t.p;
      c2d.fillText(`${i + 1} · ${b.label()}`, W / 2, yTop + 31);
    });
    wrist.commit();
  }

  function pressButton(i) {
    if (i >= 0 && i < buttons.length) buttons[i].act();
  }

  // u,v in [0,1], v measured from top of the panel texture
  function hitButton(u, v) {
    const x = u * 384, y = v * 500;
    if (x < 14 || x > 370) return -1;
    const i = Math.floor((y - BTN_TOP) / BTN_STEP);
    if (i < 0 || i >= buttons.length) return -1;
    return (y - BTN_TOP) - i * BTN_STEP <= BTN_H ? i : -1;
  }

  return {
    pressButton,
    hitButton,
    buttonCount: buttons.length,
    wristMesh: wrist.mesh,
    update(dt) {
      const show = state.phase !== 'BOOT';
      vitals.mesh.visible = show;
      alerts.mesh.visible = show;
      if (!show) { wrist.mesh.visible = false; return; }

      if (vitalsTick.ready(dt)) drawVitals();
      if (alertsTick.ready(dt)) drawAlerts();

      wrist.mesh.visible = state.wristOpen;
      if (state.wristOpen) {
        if (state.wristAnchor) {
          // XR: hover above left wrist, facing the user
          wrist.mesh.position.copy(groups.rig.worldToLocal(state.wristAnchor.clone().add(new THREE.Vector3(0, 0.18, 0))));
          wrist.mesh.lookAt(state.camPos);
        } else {
          wrist.mesh.position.set(0.24, -0.08, -1.2);
          wrist.mesh.rotation.set(0, -0.15, 0);
        }
        if (wristTick.ready(dt)) drawWrist(state.wristHover);
      }
    }
  };
}
