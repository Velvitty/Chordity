// 박자 후보별 대비도·불규칙 마디·반 마디 비(4박) 진단
const Engine = require('../src/engine.js'); const T = require('./testlib.js'); const X = require('./stress.js');
(async () => {
  const list = T.cases().map(([n, s]) => [n, () => T.render(s)]).concat(X.CASES.map(([n, s]) => [n, () => X.render(s)]));
  const rows = await Promise.all(list.map(async ([name, mk]) => {
    const S = mk(); const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null); const TL = Engine.buildTimeline(A, {});
    return `${name.padEnd(26)} ${TL.meter.label.padEnd(5)} ` + (TL.meter.alt || []).map(r => `${r.m}:${r.contrast.toFixed(2)}/irr${(r.irr * 100).toFixed(0)}%${r.m === 4 ? '/half' + r.half.toFixed(2) : ''}`).join(' ');
  }));
  console.log(rows.join('\n'));
})();
