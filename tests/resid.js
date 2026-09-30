// 박 격자의 국소 직선 적합 잔차(ms): 템포가 일정한 녹음에서 추적 흔들림의 대리 지표
const fs = require('fs');
const Engine = require('../src/engine.js');
const { trackBeats, refineFrames, FPS } = Engine._;
function resid(b, t0, t1) {           // [t0,t1] 구간 비트에 직선 적합 → 잔차
  const idx = b.map((t, i) => [i, t]).filter(([i, t]) => t >= t0 && t <= t1);
  const n = idx.length, mx = idx.reduce((a, [i]) => a + i, 0) / n, my = idx.reduce((a, [, t]) => a + t, 0) / n;
  let sxy = 0, sxx = 0; for (const [i, t] of idx) { sxy += (i - mx) * (t - my); sxx += (i - mx) ** 2; }
  const k = sxy / sxx; const r = idx.map(([i, t]) => t - (my + k * (i - mx)));
  return { rms: Math.sqrt(r.reduce((a, x) => a + x * x, 0) / n) * 1000, max: Math.max(...r.map(Math.abs)) * 1000, period: k };
}
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  const tauQ = A.tempo.tau * 2;
  const segs = [[25, 60], [60, 100], [100, 140], [140, 180], [180, 205]];
  for (const tight of [100, 310, 600, 1000, 1600]) {
    const b = Array.from(refineFrames(trackBeats(A.O, tauQ, tight), A.O), fr => fr / FPS + 0.0065);
    const out = segs.map(([a, z]) => { const r = resid(b, a, z); return `${a}-${z}s rms ${r.rms.toFixed(0)} max ${r.max.toFixed(0)}`; });
    console.log(`tight ${String(tight).padStart(4)} | ${out.join(' | ')}`);
  }
})();
