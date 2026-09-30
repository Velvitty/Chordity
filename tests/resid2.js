const fs = require('fs'); const Engine = require('../src/engine.js');
function resid(b, t0, t1) { const idx = b.map((t, i) => [i, t]).filter(([i, t]) => t >= t0 && t <= t1); const n = idx.length, mx = idx.reduce((a, [i]) => a + i, 0) / n, my = idx.reduce((a, [, t]) => a + t, 0) / n; let sxy = 0, sxx = 0; for (const [i, t] of idx) { sxy += (i - mx) * (t - my); sxx += (i - mx) ** 2; } const k = sxy / sxx, r = idx.map(([i, t]) => t - (my + k * (i - mx))); return `rms ${(Math.sqrt(r.reduce((a, x) => a + x * x, 0) / n) * 1000).toFixed(0)} max ${(Math.max(...r.map(Math.abs)) * 1000).toFixed(0)}`; }
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  const b = Array.from(A.beats);
  console.log('실제 곡:', A.level.action, (60 / ((b[b.length - 1] - b[0]) / (b.length - 1))).toFixed(1), 'BPM |', [[25, 60], [60, 100], [100, 140], [140, 180], [180, 205]].map(([a, z]) => a + '-' + z + 's ' + resid(b, a, z)).join(' | '));
  const TL = Engine.buildTimeline(A, {});
  const irr = TL.bars.filter((x, k) => !x.pickup && x.nBeats !== TL.meter.m && k < TL.bars.length - 1);
  console.log('불규칙 마디:', irr.map(x => x.num + '(' + x.nBeats + '박 @' + x.t0.toFixed(0) + 's)').join(', ') || '없음', '| 분석', A.elapsed.toFixed(2), 's');
  console.log(Engine.chartText(TL, { title: '세월이 가면' }).split('\n').slice(0, 9).join('\n'));
})();
