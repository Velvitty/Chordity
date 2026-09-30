// 곡 하나에서 스위치를 하나씩 끄며 요약(비트, 엇박, 첫 박, 코드, 도약 수)
const Engine = require('../src/engine.js'); const X = require('./stress.js'); const P = Engine._.P;
const FL0 = ['TEMPO300', 'WALK_DOUBLE', 'TEMPO_HMM', 'METERS_EXT', 'VARIANTS', 'POWER', 'SLASH2', 'INV_SMOOTH'];
const FL = FL0;
const DEF = {};
const name = process.argv[2], spec = X.CASES.find(c => c[0].startsWith(name))[1];
(async () => {
  const S = X.render(spec);
  for (const k of FL) DEF[k] = P[k];
  for (const off of [null, ...FL]) {
    if (process.argv[3] && off && !process.argv[3].split(',').includes(off)) continue;
    for (const k of FL) P[k] = (off === k) ? !DEF[k] : DEF[k];   // 채택한 기본값에서 하나만 뒤집음
    Engine._.localTempo.jumps = undefined;
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null); const TL = Engine.buildTimeline(A, {});
    const truth = S.beats.map(b => b.t), det = Array.from(TL.beats);
    let hit = 0; for (const tb of truth) if (det.some(d => Math.abs(d - tb) < 0.07)) hit++;
    let off2 = 0; for (let i = 0; i + 1 < truth.length; i++) { const m = (truth[i] + truth[i + 1]) / 2; if (det.some(d => Math.abs(d - m) < 0.07)) off2++; }
    console.log(`${(off ? off + (DEF[off] ? ' 끔' : ' 켬') : '채택안').padEnd(16)} 비트 ${hit}/${truth.length} 엇박 ${off2} 도약 ${Engine._.localTempo.jumps} ${TL.meter.label}`);
  }
})();
