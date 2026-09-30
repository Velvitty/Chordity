// 실제 녹음: 1.4.2 결과와의 일치(박마다 코드 이름, 마디 첫 박, 비트 시각). 스위치를 하나씩 끄며 비교
const fs = require('fs');
const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
const labelAt = (TL, t) => { const b = TL.beats; let lo = 0, hi = b.length - 1; if (t < b[0]) return null; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m] <= t) lo = m; else hi = m - 1; } const bar = TL.bars[TL.barOfBeat[lo]], iv = lo + 1 < b.length ? b[lo + 1] - b[lo] : b[lo] - b[lo - 1]; const off = (lo - bar.startBeat) + (t - b[lo]) / iv; let ev = bar.events[0]; for (const e of bar.events) if (e.off <= off + 1e-9) ev = e; return ev.label.text; };
(async () => {
  const B = require('./baselines/v142/engine.v142.js'); const A0 = await B.analyze({ channels: [L, R], sampleRate: 44100 }, null); const T0 = B.buildTimeline(A0, {});
  const E = require('../src/engine.js'), P = E._.P;
  const FL0 = ['TEMPO300', 'WALK_DOUBLE', 'TEMPO_HMM', 'METERS_EXT', 'VARIANTS', 'POWER', 'SLASH2', 'INV_SMOOTH'];
const FL = FL0;
const DEF = {};
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const k of FL) DEF[k] = P[k];
  for (const off of [null, ...FL]) {
    if (only && off && !only.includes(off)) continue;
    for (const k of FL) P[k] = (off === k) ? !DEF[k] : DEF[k];   // 채택한 기본값에서 하나만 뒤집음
    const A = await E.analyze({ channels: [L, R], sampleRate: 44100 }, null); const T = E.buildTimeline(A, {});
    const b0 = Array.from(T0.beats); let same = 0, tot = 0; const diffs = {};
    for (let i = 0; i + 1 < b0.length; i++) { const t = (b0[i] + b0[i + 1]) / 2, x = labelAt(T0, t), y = labelAt(T, t); if (!x) continue; tot++; if (x === y) same++; else { const k = x + '→' + y; diffs[k] = (diffs[k] || 0) + 1; } }
    const d0 = T0.bars.map(b => b.t0), d1 = T.bars.map(b => b.t0); const dh = d0.filter(x => d1.some(y => Math.abs(x - y) < 0.05)).length;
    const bh = b0.filter(x => T.beats.some(y => Math.abs(x - y) < 0.02)).length;
    console.log(`${(off ? off + (DEF[off] ? ' 끔' : ' 켬') : '채택안').padEnd(16)} 코드 일치 ${(same / tot * 100).toFixed(1)}%  첫박 ${dh}/${d0.length}  비트 ${bh}/${b0.length}  ${Object.entries(diffs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + '×' + v).join(', ')}`);
  }
})();
