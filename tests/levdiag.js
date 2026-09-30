// 박 단계 판정값 진단: 기존 18곡 + 새 곡
const Engine = require('../src/engine.js'); const T = require('./testlib.js'); const X = require('./stress.js');
(async () => {
  const list = T.cases().map(([n, s]) => [n, () => T.render(s)]).concat(X.CASES.map(([n, s]) => [n, () => X.render(s)]));
  for (const [name, mk] of list) {
    if (process.argv[2] && !name.includes(process.argv[2])) continue;
    const S = mk(); const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null); const L = A.level;
    console.log(`${name.padEnd(26)} ${L.action.padEnd(6)} bpm전 ${L.bpm.toFixed(0).padStart(3)} r2 ${L.r2.toFixed(2)} dK ${(L.dK ?? 0).toFixed(2)} dSn ${(L.dSn ?? 0).toFixed(2)} dNov ${(L.dNov ?? 0).toFixed(2)} snMid ${L.snareMidOn.toFixed(2)} kOnMid ${L.kickOnMid.toFixed(2)} → ${A.tempo.bpm ? A.tempo.bpm.toFixed(1) : ''}`);
  }
})();
