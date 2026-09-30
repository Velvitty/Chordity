// 실제 곡 분석: 앱과 같은 엔진으로 차트 출력
const fs = require('fs');
const Engine = require('../src/engine.js');
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32'));
  const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  fs.writeFileSync(require('path').join(require('os').tmpdir(), 'A_meta.json'), JSON.stringify({ tempo: A.tempo, phase: A.phase, level: A.level, tuning: A.harm.tuning, beats: Array.from(A.beats) }));
  const TL = Engine.buildTimeline(A, {});
  console.log('tempo', A.tempo.bpm.toFixed(2), 'cands', A.tempo.cands.map(c => c.bpm.toFixed(1) + ':' + c.rel.toFixed(2)).join(' '), '| TL bpm', TL.bpm.toFixed(2));
  console.log('phase', JSON.stringify(A.phase), '| level', JSON.stringify(A.level));
  console.log('meter', TL.meter.label, 'contrast', TL.meter.contrast.toFixed(2), JSON.stringify(TL.meter.alt), '| sub', JSON.stringify(TL.sub));
  console.log('key', TL.key.name, TL.key.score.toFixed(2), '| tuning', (A.harm.tuning * 100).toFixed(1), 'cent | beats', TL.beats.length, 'bars', TL.bars.length, '| elapsed', A.elapsed.toFixed(2));
  const irregular = TL.bars.filter(b => !b.pickup && b.nBeats !== TL.meter.m).map(b => b.num + '(' + b.nBeats + '박 @' + b.t0.toFixed(1) + 's)');
  console.log('irregular bars:', irregular.join(', '));
  console.log(Engine.chartText(TL, { title: '세월이 가면' }));
})();
