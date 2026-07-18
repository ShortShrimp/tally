let ac = null;
let master = null;

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain();
  master.gain.value = 0.5;
  master.connect(ac.destination);
}

function env(node, t0, attack, hold, release, peak = 1) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  node.gain.setValueAtTime(peak, t0 + attack + hold);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

function tone({ freq = 880, type = 'sine', dur = 0.08, gain = 0.25, slideTo = null, delay = 0 }) {
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  env(g, t0, 0.005, dur * 0.4, dur * 0.6, gain);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.1);
}

function noiseBurst({ dur = 0.25, gain = 0.4, delay = 0, lowpass = 2200 }) {
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(lowpass, t0);
  f.frequency.exponentialRampToValueAtTime(200, t0 + dur);
  const g = ac.createGain();
  env(g, t0, 0.003, dur * 0.2, dur * 0.8, gain);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  tick()  { tone({ freq: 1400, type: 'square', dur: 0.03, gain: 0.08 }); },
  pip()   { tone({ freq: 980, dur: 0.06, gain: 0.15 }); },
  confirm() {
    tone({ freq: 740, dur: 0.07, gain: 0.18 });
    tone({ freq: 1180, dur: 0.09, gain: 0.18, delay: 0.08 });
  },
  deny()  { tone({ freq: 240, type: 'square', dur: 0.14, gain: 0.16 }); },
  seek()  { tone({ freq: 620, type: 'triangle', dur: 0.05, gain: 0.1 }); },
  lock()  {
    tone({ freq: 880, type: 'triangle', dur: 0.05, gain: 0.2 });
    tone({ freq: 880, type: 'triangle', dur: 0.05, gain: 0.2, delay: 0.07 });
    tone({ freq: 1320, type: 'triangle', dur: 0.16, gain: 0.22, delay: 0.14 });
  },
  designate() {
    tone({ freq: 520, dur: 0.06, gain: 0.16 });
    tone({ freq: 780, dur: 0.1, gain: 0.16, delay: 0.06 });
  },
  fire() {
    tone({ freq: 1900, type: 'sawtooth', dur: 0.18, gain: 0.22, slideTo: 140 });
    noiseBurst({ dur: 0.28, gain: 0.35 });
  },
  charge() { tone({ freq: 300, type: 'sawtooth', dur: 0.25, gain: 0.1, slideTo: 1200 }); },
  splash() {
    noiseBurst({ dur: 0.4, gain: 0.4, lowpass: 1200 });
    tone({ freq: 1560, dur: 0.09, gain: 0.2, delay: 0.05 });
    tone({ freq: 2080, dur: 0.14, gain: 0.2, delay: 0.15 });
  },
  klaxon() {
    tone({ freq: 620, type: 'square', dur: 0.16, gain: 0.14 });
    tone({ freq: 460, type: 'square', dur: 0.16, gain: 0.14, delay: 0.18 });
  },
  bootLine() { tone({ freq: 1100 + Math.random() * 500, type: 'square', dur: 0.025, gain: 0.07 }); },
  bootDone() {
    tone({ freq: 520, dur: 0.1, gain: 0.2 });
    tone({ freq: 780, dur: 0.1, gain: 0.2, delay: 0.1 });
    tone({ freq: 1040, dur: 0.22, gain: 0.22, delay: 0.2 });
  },
  scanPulse() { tone({ freq: 440, type: 'sine', dur: 0.5, gain: 0.08, slideTo: 880 }); },
};
