// 실제 녹음: 이전 국소 템포와 새 템포 비터비가 어디서 다른지(창 단위, BPM)
const fs = require('fs'); const Engine = require('../src/engine.js'); const P = Engine._.P;
const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
(async () => {
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  const tau = 60 * Engine._.FPS / 68.1;
  P.TEMPO_HMM = false; const c0 = Engine._.localTempo(A.O, tau);
  P.TEMPO_HMM = true; const c1 = Engine._.localTempo(A.O, tau);
  const FPS = Engine._.FPS, out = [];
  for (let s = 0; s * FPS < c0.length; s += 4) { const t = Math.round(s * FPS); const b0 = 60 * FPS / c0[t], b1 = 60 * FPS / c1[t]; out.push(`${s}s ${b0.toFixed(0)}/${b1.toFixed(0)}${Math.abs(b1 / b0 - 1) > 0.05 ? '*' : ''}`); }
  console.log(out.join('  '));
})();
