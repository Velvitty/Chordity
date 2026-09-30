// 두 배로 올린 뒤(130 층위) 비밥·보사노바·기존 곡들의 박 단계 판정값
const Engine = require('../src/engine.js'); const T = require('./testlib.js'); const X = require('./stress.js'); const _ = Engine._;
(async () => {
  const pick = ['비밥 260', '보사노바 132', '스윙 재즈 140', 'pop 128', 'punk 176', 'dance 124', 'rock weak-snare 118', '템포 급변 96→132', '메탈 150 디스토션', 'mod pivot C→D 110'];
  const all = T.cases().map(([n, s]) => [n, () => T.render(s)]).concat(X.CASES.map(([n, s]) => [n, () => X.render(s)]));
  for (const [name, mk] of all.filter(([n]) => pick.includes(n))) {
    const S = mk(); const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    const L = _.levelCheck(A, Array.from(A.beats)).info;
    console.log(`${name.padEnd(22)} 지금 ${L.bpm.toFixed(0).padStart(3)}: r2 ${L.r2.toFixed(2)} dSn ${L.dSn.toFixed(2)} kOnMid ${L.kickOnMid.toFixed(2)} snMid ${L.snareMidOn.toFixed(2)} → ${L.action}`);
  }
})();
