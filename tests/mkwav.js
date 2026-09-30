// 테스트용 WAV(16bit) + 정답 비트 JSON 생성
const fs = require('fs');
const T = require('./testlib.js');
function wav(path, y, sr) {
  const n = y.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(y[i]));
  const g = 0.89 / pk;
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(y[i] * g * 32767))), 44 + i * 2);
  fs.writeFileSync(path, buf);
}
for (const [file, name] of [['test-pop97', 'pop 97'], ['test-pickup104', 'drum intro + pickup 104'], ['test-ballad68', 'ballad 4/4 68 drift']]) {
  const [, spec] = T.cases().find(c => c[0] === name);
  const S = T.render(spec);
  wav(file + '.wav', S.y, S.sr);
  fs.writeFileSync(file + '.json', JSON.stringify({ beats: S.beats.map(b => b.t), down: S.beats.filter(b => b.pos % spec.meter === 0).map(b => b.t), bpm: spec.bpm }));
  console.log(file, (S.y.length / S.sr).toFixed(1) + 's');
}
