const Engine = require('../src/engine.js');
const T = require('./testlib.js');
(async () => {
  const [name, spec] = T.cases()[0];
  const S = T.render(spec);
  const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
  console.log('startT', A.startT.toFixed(3), 'endT', A.endT.toFixed(3), 'first true beat', S.beats[0].t, 'last', S.beats[S.beats.length-1].t.toFixed(3));
  console.log('beats', Array.from(A.beats.slice(0, 4)).map(v => v.toFixed(3)), '...', Array.from(A.beats.slice(-3)).map(v => v.toFixed(3)));
  const TL = Engine.buildTimeline(A, {});
  console.log('pos', Array.from(TL.pos.slice(0, 6)), 'bars0', TL.bars[0], TL.bars[1].events.map(e => e.label.text));
})();
