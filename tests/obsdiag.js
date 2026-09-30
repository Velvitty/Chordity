// 창마다 원래 템포 주기의 점수(창 최댓값 대비): 실제 녹음의 셋잇단 구간 vs 템포 급변 곡의 빠른 구간
const fs = require('fs'); const Engine = require('../src/engine.js'); const X = require('./stress.js'); const FPS = Engine._.FPS;
function scores(O, tau, ts) {
  const n = O.length, W = Math.round(8 * FPS);
  const w3 = Math.round(3 * FPS), cs = new Float64Array(n + 1), E = new Float64Array(n);
  for (let t = 0; t < n; t++) cs[t + 1] = cs[t] + O[t] * O[t];
  let mu = 0; for (let t = 0; t < n; t++) { const a = Math.max(0, t - w3), b = Math.min(n, t + w3 + 1); E[t] = O[t] / (Math.sqrt((cs[b] - cs[a]) / (b - a)) + 1e-9); mu += E[t]; }
  mu /= n; for (let t = 0; t < n; t++) E[t] -= mu;
  return ts.map(sec => {
    const c = Math.round(sec * FPS), a = Math.max(0, c - (W >> 1)), b = Math.min(n, c + (W >> 1));
    const r = lag => { let s = 0; for (let t = a; t + lag < b; t++) s += E[t] * E[t + lag]; return s / (b - a - lag); };
    const lo = Math.floor(tau * 0.6), hi = Math.ceil(tau * 1.65); let mx = -Infinity, bl = 0;
    for (let l = lo; l <= hi; l++) { const v = r(l) + 0.5 * r(2 * l); if (v > mx) { mx = v; bl = l; } }
    const at = Math.round(tau), v0 = Math.max(r(at - 1) + 0.5 * r(2 * at - 2), r(at) + 0.5 * r(2 * at), r(at + 1) + 0.5 * r(2 * at + 2));
    return `${sec}s ${(v0 / mx).toFixed(2)}(${(60 * FPS / bl).toFixed(0)})`;
  }).join(' ');
}
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  console.log('실제 녹음(원래 68):', scores(A.O, 60 * FPS / 68.1, [12, 20, 24, 28, 32, 36, 40, 44, 48, 56, 100, 196, 204, 212, 220, 228]));
  const S = X.render(X.CASES.find(c => c[0].startsWith('템포 급변'))[1]); const B = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
  console.log('템포 급변(원래 96):', scores(B.O, 60 * FPS / 96, [10, 20, 30, 34, 38, 42, 46, 50, 54, 58]));
})();
