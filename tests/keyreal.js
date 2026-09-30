const fs = require('fs'); const Engine = require('../src/engine.js');
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  const TL = Engine.buildTimeline(A, {});
  console.log('조성 구간:', TL.keys.map(k => `${k.name} @${k.barNum}마디 ${k.beat}박 (${k.t0.toFixed(1)}s, 상관 ${k.score.toFixed(2)})`).join('  →  '));
  const lines = Engine.chartText(TL, { title: '세월이 가면' }).split('\n');
  const at = lines.findIndex(l => l.includes('박부터'));
  console.log(lines[0]); console.log((at >= 0 ? lines.slice(at - 2, at + 5) : lines.slice(-8)).join('\n'));
})();
