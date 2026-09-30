// 코드 증거와 음 분포 증거를 섞는 비중에 따른 조성 판정(정답이 분명한 곡들)
const Engine = require('../src/engine.js'); const T = require('./testlib.js');
const truthOf = { 'pop 97': ['C 장조'], 'pop 128': ['C 장조'], 'waltz 150': ['D 장조'], 'ballad 12/8 58': ['E♭ 장조'], 'ballad 4/4 68 drift': ['C 장조'], 'reggae 76': ['A 단조'], 'rock weak-snare 118': ['C 장조'], 'dance 124': ['C 장조'], 'hiphop 88': ['C 장조'], 'punk 176': ['C 장조'], 'solo piano 72': ['C 장조'], 'solo piano 3/4 84': ['D 장조'], 'ballad rit 72→63': ['C 장조'], 'mod pivot C→D 110': ['C 장조', 'D 장조'], 'mod ballad Eb→E 70': ['E♭ 장조', 'E 장조'], 'mod direct G→Ab 100': ['G 장조', 'A♭ 장조'], 'drum intro + pickup 104': ['C 장조'] };
(async () => {
  const cases = T.cases().filter(c => truthOf[c[0]]);
  cases.push(['질문의 예(가단조)', { bpm: 84, meter: 4, bars: ['Am', 'Em/G', 'F', 'C/E', 'Dm', 'G', 'C', 'E7', 'Am', 'Em/G', 'F', 'C/E', 'Dm', 'G', 'C', 'E7', 'Am'].map(c => [[c, 4]]), melody: true, seed: 71 }]);
  truthOf['질문의 예(가단조)'] = ['A 단조'];
  const As = [];
  for (const [nm, sp] of cases) { const S = T.render(sp); As.push([nm, await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null)]); }
  for (const w of [0, 0.3, 0.5, 0.8, 1.2]) {
    Engine._.P.KEY_CHROMA_W = w;
    const bad = [];
    for (const [nm, A] of As) { const got = Engine.buildTimeline(A, {}).keys.map(k => k.name); if (got.join('→') !== truthOf[nm].join('→')) bad.push(nm + ': ' + got.join('→')); }
    console.log(`비중 ${w}: 틀림 ${bad.length}/${As.length}`, bad.length ? '— ' + bad.join(' ; ') : '');
  }
  Engine._.P.KEY_CHROMA_W = 0.5;
})();
