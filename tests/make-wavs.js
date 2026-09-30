// 브라우저 시험(e2e-*.js, verify*.js)에 쓰는 합성곡 WAV와 정답 파일을 만듦. tests 폴더에서: node make-wavs.js
const T = require('./testlib.js'), X = require('./stress.js'), fs = require('fs'), path = require('path');
// 16비트 모노 WAV로 저장(최댓값을 0.89로 맞춤)
function writeWav(S, file) {
  const n = S.y.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(S.sr, 24); b.writeUInt32LE(S.sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(S.y[i]));
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(S.y[i] / pk * 0.89 * 32767), 44 + i * 2);
  fs.writeFileSync(path.join(__dirname, file), b);
}
const bars = (l, n) => l.map(ch => ch.map(c => [c, n / ch.length]));
const T1 = name => T.cases().find(c => c[0].startsWith(name))[1];
const X1 = name => X.CASES.find(c => c[0].startsWith(name))[1];
// 끌어 둔 코드('~')와 같은 코드를 새로 친 마디가 섞인 패드 곡(회색·곡 따라 타건 시험)
const HOLD = { bpm: 70, meter: 4, style: 'pad', bars: bars([['C'], ['~'], ['G'], ['G'], ['Am'], ['~'], ['F'], ['F'], ['C'], ['~'], ['G'], ['~'], ['Am'], ['F'], ['G'], ['~'], ['C'], ['C']], 4), seed: 301 };
// 여러 종류의 코드(자리바꿈, 부속화음, m7♭5, dim7, aug, sus2·4, 빌려온 화음, 나폴리, 온음 위 베이스, 파워 코드)
const VARIED = { bpm: 100, meter: 4, melody: false, seed: 211, bars: bars([['C'], ['C/E'], ['F'], ['G7/B'], ['C'], ['A7'], ['Dm'], ['Dm7/C'], ['Bm7b5'], ['E7'], ['Am'], ['Ab'], ['Db/F'], ['G7'], ['Csus2', 'C'], ['Gsus4', 'G'], ['Caug'], ['F'], ['Bdim7'], ['C'], ['F/G'], ['C'], ['E5'], ['E5'], ['G5'], ['A5'], ['E5'], ['E5'], ['G5'], ['A5'], ['C'], ['C']], 4) };
// 로마 숫자 예외(IVsus4, V7/IV, ♭VII, V11)
const EXCEPT = { bpm: 100, meter: 4, melody: false, seed: 201, bars: bars([['C'], ['Fsus4', 'F'], ['C'], ['C7'], ['F'], ['Bb'], ['C'], ['F/G'], ['C'], ['Fsus4', 'F'], ['C7'], ['F'], ['Bb'], ['F/G'], ['C'], ['C']], 4) };
const LIST = [
  ['pop97.wav', () => T.render(T.cases()[0][1])], ['modpivot.wav', () => T.render(T1('mod pivot'))], ['pickup.wav', () => T.render(T1('drum intro'))],
  ['rit.wav', () => T.render(T1('ballad rit'))], ['ballad128.wav', () => T.render(T1('ballad 12/8'))],
  ['tempojump.wav', () => X.render(X1('템포 급변'))], ['meterchg.wav', () => X.render(X1('변박 팝'))], ['waltz44.wav', () => X.render(X1('왈츠 절'))],
  ['odd74.wav', () => X.render(X1('7/4'))], ['slash.wav', () => X.render(X1('코드 밖'))],
  ['hold.wav', () => X.render(HOLD)], ['varied.wav', () => X.render(VARIED)], ['except.wav', () => X.render(EXCEPT)],
];
for (const [f, mk] of LIST) { writeWav(mk(), f); console.log('만듦', f); }
fs.writeFileSync(path.join(__dirname, 'hold_truth.json'), JSON.stringify(HOLD.bars.map(b => b[0][0] === '~' ? '끎' : '침')));
console.log('만듦 hold_truth.json');
