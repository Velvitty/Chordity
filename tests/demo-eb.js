// README 표기 이미지용 데모 음원(합성): E♭ 장조, 자리바꿈·부속화음·차용 ii–V 가 들어간 11마디
const fs = require('fs'); const T = require('./testlib.js');
const bars = [['Eb'], ['Bb/D'], ['Cm'], ['Bbm7', 2, 'Eb7', 2], ['Abmaj7'], ['Bb7/Ab'], ['Gm7'], ['Cm7'], ['Fm7'], ['Bb7'], ['Eb']].map(x => x.length > 1 ? [[x[0], x[1]], [x[2], x[3]]] : [[x[0], 4]]);
const S = T.render({ bpm: 76, meter: 4, bars, melody: true, seed: 79 });
const n = S.y.length, buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(S.sr, 24); buf.writeUInt32LE(S.sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(S.y[i]));
for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(S.y[i] / pk * 0.89 * 32767), 44 + i * 2);
fs.writeFileSync('demo-eb.wav', buf); console.log('demo-eb.wav', (n / S.sr).toFixed(1) + 's');
