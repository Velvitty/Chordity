const Engine = require('../src/engine.js');
const T = require('./testlib.js');
(async () => {
  const want = process.argv[2] || 'pickup';
  for (const [name, spec] of T.cases()) {
    if (!name.includes(want)) continue;
    const S = T.render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    for (const set of [{}, { res: 2 }, { slash: false, vocab: 'basic' }]) {
      const TL = Engine.buildTimeline(A, set);
      console.log(JSON.stringify(set)); console.log(Engine.chartText(TL, { title: name }));
    }
    console.log('truth bars:', spec.bars.map(b => b.map(([c, n]) => c + (n < spec.meter ? '(' + n + ')' : '')).join(' ')).join(' | '));
  }
})();
