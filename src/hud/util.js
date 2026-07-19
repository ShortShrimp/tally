import * as THREE from 'three';

export const THEMES = {
  teal:  { name: 'TEAL',  p: '#3bffd9', dim: 'rgba(59,255,217,0.45)', faint: 'rgba(59,255,217,0.16)', accent: '#ffc857', warn: '#ff5050', hex: 0x3bffd9, accentHex: 0xffc857, warnHex: 0xff5050 },
  amber: { name: 'AMBER', p: '#ffc14d', dim: 'rgba(255,193,77,0.45)',  faint: 'rgba(255,193,77,0.16)',  accent: '#6df2ff', warn: '#ff5050', hex: 0xffc14d, accentHex: 0x6df2ff, warnHex: 0xff5050 },
  red:   { name: 'NIGHT', p: '#ff5f5f', dim: 'rgba(255,95,95,0.45)',   faint: 'rgba(255,95,95,0.16)',   accent: '#ffc857', warn: '#ffffff', hex: 0xff5f5f, accentHex: 0xffc857, warnHex: 0xffffff }
};

export function makePanel(state, wMeters, hMeters, pxW, pxH) {
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const c2d = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wMeters, hMeters), material);
  mesh.renderOrder = 10;
  if (state.panelMats) state.panelMats.push(material);
  return { canvas, c2d, texture, mesh,
    clear() { c2d.clearRect(0, 0, pxW, pxH); },
    commit() { texture.needsUpdate = true; }
  };
}

export function lineMat(state, kind = 'p', opacity = 0.9) {
  const t = state.theme;
  const color = kind === 'accent' ? t.accentHex : kind === 'warn' ? t.warnHex : t.hex;
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
  state.themedMats.push({ mat: m, kind, baseOp: opacity });
  return m;
}

export function retheme(state) {
  const t = state.theme;
  for (const { mat, kind } of state.themedMats) {
    mat.color.setHex(kind === 'accent' ? t.accentHex : kind === 'warn' ? t.warnHex : t.hex);
  }
}

export function applyBrightness(state) {
  for (const m of state.panelMats) m.opacity = state.brightness;
  for (const { mat, baseOp } of state.themedMats) mat.opacity = baseOp * state.brightness;
}

export function setFont(c2d, px, bold = false) {
  c2d.font = `${bold ? '600 ' : ''}${px}px "SF Mono", Menlo, Consolas, monospace`;
}

export class Throttle {
  constructor(hz, phase = 0) { this.interval = 1 / hz; this.acc = phase * this.interval; }
  ready(dt) {
    this.acc += dt;
    if (this.acc >= this.interval) { this.acc %= this.interval; return true; }
    return false;
  }
}
