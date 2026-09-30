const fs = require('fs'); const Engine = require('../src/engine.js');
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  const TL = Engine.buildTimeline(A, {});
  console.log('조성:', TL.keys.map(k => k.name + '@' + k.barNum + '마디').join(' → '));
  const lines = Engine.chartText(TL, { title: '세월이 가면', notation: 'roman' }).split('\n');
  const at = lines.findIndex(l => l.includes('박부터'));
  console.log(lines.slice(0, 4).join('\n')); console.log('...'); console.log(lines.slice(at - 1, at + 3).join('\n'));
  const nl = Engine.chartText(TL, { title: '세월이 가면' }).split('\n');
  console.log('(같은 곳 음이름)'); console.log(nl.slice(1, 3).join('\n')); console.log(nl.slice(at - 1, at + 3).join('\n'));
})();
