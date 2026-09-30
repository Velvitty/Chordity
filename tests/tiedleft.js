// 남은 회색: 값과 정답(새로 쳤는지)
const E = require('../src/engine.js'), T = require('./testlib.js'), X = require('./stress.js');
E._.P.DBG_ATTACK = true;
(async () => {
  for (const [name, spec, R] of T.cases().map(([n, s]) => [n, s, T.render]).concat(X.CASES.map(([n, s]) => [n, s, X.render]))) {
    const S = R(spec), A = await E.analyze({ channels: [S.y], sampleRate: S.sr }, null), TL = E.buildTimeline(A, {});
    TL.bars.forEach(bar => { const ev = bar.events[0]; if (!ev || !ev.tied || ev.label.nc) return;
      const d = A._attack.tied.find(x => Math.abs(x.t - TL.beats[bar.startBeat]) < 1e-6);
      console.log(`${name.padEnd(24)} ${bar.num}마디 ${ev.label.text}: 트레블 ${d ? d.rT : '?'} 베이스 ${d ? d.rB : '?'}`); });
  }
})();
