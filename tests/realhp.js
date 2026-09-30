// 실제 녹음: HPSS 끔/켬의 1.4.2 일치율과 분석 시간
const fs = require('fs'); const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
const labelAt = (TL, t) => { const b = TL.beats; let lo = 0, hi = b.length - 1; if (t < b[0]) return null; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m] <= t) lo = m; else hi = m - 1; } const bar = TL.bars[TL.barOfBeat[lo]], iv = lo + 1 < b.length ? b[lo + 1] - b[lo] : b[lo] - b[lo - 1]; const off = (lo - bar.startBeat) + (t - b[lo]) / iv; let ev = bar.events[0]; for (const e of bar.events) if (e.off <= off + 1e-9) ev = e; return ev.label.text; };
(async () => {
  const B = require('./baselines/v142/engine.v142.js'); const A0 = await B.analyze({ channels: [L, R], sampleRate: 44100 }, null); const T0 = B.buildTimeline(A0, {});
  const E = require('../src/engine.js');
  for (const h of [false, true]) {
    E._.P.HPSS = h; const A = await E.analyze({ channels: [L, R], sampleRate: 44100 }, null); const T = E.buildTimeline(A, {});
    const b0 = Array.from(T0.beats); let same = 0, tot = 0; const dif = {};
    for (let i = 0; i + 1 < b0.length; i++) { const t = (b0[i] + b0[i + 1]) / 2, x = labelAt(T0, t), y = labelAt(T, t); if (!x) continue; tot++; if (x === y) same++; else dif[x + '→' + y] = (dif[x + '→' + y] || 0) + 1; }
    console.log(`HPSS ${h ? '켬' : '끔'}: 분석 ${A.elapsed.toFixed(1)}s(1.4.2 ${A0.elapsed.toFixed(1)}s) 코드 일치 ${(same / tot * 100).toFixed(1)}% 기준음 ${A.harm ? '' : ''}${Object.entries(dif).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + '×' + v).join(', ')}`);
  }
})();
