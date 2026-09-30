const fs = require('fs');
const Engine = require('../src/engine.js');
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  const b = Array.from(A.beats), iv = b.slice(1).map((t, i) => t - b[i]), med = [...iv].sort((x, y) => x - y)[iv.length >> 1];
  console.log('level', A.level.action, '| phase', JSON.stringify(A.phase), '| 간격 중앙값', med.toFixed(3), '| 12% 넘게 벗어난 간격', iv.filter(d => Math.abs(d / med - 1) > 0.12).length, '/', iv.length);
  // 국소 위상 점검: 12박 창마다 박 위치 vs 반 박 위치 강세
  const S = A.S, FPS = A.fps, sm = t => { const c = Math.round((t - 0.0065) * FPS); let v = 0; for (let k = c - 2; k <= c + 2; k++) if (k >= 0 && k < S.length && S[k] > v) v = S[k]; return v; };
  const bad = [];
  for (let i = 0; i + 12 < b.length; i += 6) { let on = 0, off = 0; for (let k = i; k < i + 12; k++) { on += sm(b[k]); off += sm((b[k] + b[k + 1]) / 2); } if (off > on) bad.push(b[i].toFixed(0) + 's(' + (off / on).toFixed(2) + ')'); }
  console.log('반 박 쪽이 더 강한 12박 구간:', bad.length ? bad.join(', ') : '없음');
  for (const BB of [1.5, 2.5, 3.5]) {
    Engine._.P.BB = BB; Engine._.clearCache();
    const TL = Engine.buildTimeline(A, {});
    const irr = TL.bars.filter((x, k) => !x.pickup && x.nBeats !== TL.meter.m && k < TL.bars.length - 1);
    const lines = Engine.chartText(TL, {}).split('\n');
    console.log(`\nBB ${BB}: BPM ${TL.bpm.toFixed(1)} ${TL.meter.label} | 불규칙 마디 ${irr.length}: ${irr.map(x => x.num + '(' + x.nBeats + '박 @' + x.t0.toFixed(0) + 's)').join(', ')}`);
    console.log(lines.slice(1, 7).join('\n'));
  }
  Engine._.P.BB = 1.5; Engine._.clearCache();
})();
