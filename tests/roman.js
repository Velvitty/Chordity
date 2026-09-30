// 로마 숫자 시험: 합성 음원 → 분석 → 로마 숫자가 기대값과 같은지
const Engine = require('../src/engine.js');
const T = require('./testlib.js');
const seq = (TL) => { const out = []; let last = null; TL.bars.forEach(b => b.events.forEach(e => { const t = e.label.rn.text; if (t !== last) out.push(t); last = t; })); return out; };
(async () => {
  const tests = [
    ['질문의 예(가단조)', { bpm: 84, meter: 4, bars: [['Am'], ['Em/G'], ['F'], ['C/E'], ['Dm'], ['G'], ['C'], ['E7'], ['Am'], ['Em/G'], ['F'], ['C/E'], ['Dm'], ['G'], ['C'], ['E7'], ['Am']].map(([c]) => [[c, 4]]), melody: true, seed: 71 },
      'i v6 VI III6 iv V/III III V7'],
    ['부속 딸림·차용(다장조)', { bpm: 92, meter: 4, bars: [['C'], ['E7'], ['Am'], ['D7'], ['G7'], ['C'], ['A7'], ['Dm'], ['G7'], ['C'], ['Fm'], ['C'], ['Bb'], ['C']].map(([c]) => [[c, 4]]), melody: true, seed: 73 },
      'I V7/vi vi V7/V V7 I V7/ii ii V7 I iv I ♭VII I'],
    ['ii–V/IV 와 자리바꿈(내림마장조)', { bpm: 76, meter: 4, bars: [['Eb'], ['Bb/D'], ['Cm'], ['Bbm7', 2, 'Eb7', 2], ['Abmaj7'], ['Bb7/Ab'], ['Gm7'], ['Cm7'], ['Fm7'], ['Bb7'], ['Eb']].map(x => x.length > 1 ? [[x[0], x[1]], [x[2], x[3]]] : [[x[0], 4]]), melody: true, seed: 79 },
      'I V6 vi ii7/IV V7/IV IVM7 V42 iii7 vi7 ii7 V7 I'],
  ];
  for (const [name, spec, want] of tests) {
    const S = T.render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    const TL = Engine.buildTimeline(A, {});
    const got = seq(TL);
    const w = want.split(' ');
    const ok = w.every((x, i) => got[i] === x);
    if (!ok) process.exitCode = 1;   // 실패하면 종료 코드 1(npm 사슬이 멈춤)
    console.log(`${ok ? '✓' : '✗'} ${name} | 조성 ${TL.keys.map(k => k.name).join('→')}\n   기대: ${want}\n   결과: ${got.slice(0, w.length + 1).join(' ')}\n   코드: ${[...new Set([])].join('')}${TL.bars.slice(0, 8).map(b => b.events.map(e => e.label.text).join(' ')).join(' | ')}`);
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
