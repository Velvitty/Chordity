const Engine = require('../src/engine.js');
const T = require('./testlib.js');
(async () => {
  // 1) 보정 연산
  const [name, spec] = T.cases()[0];
  const S = T.render(spec);
  const A = await Engine.analyze({ channels: [S.y, S.y], sampleRate: S.sr }, null);   // 스테레오 경로
  const truth = S.beats.map(b => b.t);
  const near = (arr, pts) => pts.filter(p => arr.some(d => Math.abs(d - p) < 0.05)).length;
  const mids = truth.slice(0, -1).map((t, i) => 0.5 * (t + truth[i + 1]));
  for (const set of [{ ops: ['half'] }, { ops: ['half', 'half'] }, { ops: ['x2'] }, { ops: ['d2'] }, { ops: ['x2', 'd2'] }, { ops: ['d3'] }, { meter: 3 }, { downShift: 1 }, { downShift: -1 }, { meter: 6 }]) {
    const TL = Engine.buildTimeline(A, set);
    const b = Array.from(TL.beats);
    console.log(JSON.stringify(set).padEnd(28), 'n', b.length, ' onBeat', near(b, truth), ' offBeat', near(b, mids), ' bpm', TL.bpm.toFixed(1), ' meter', TL.meter.label, ' bars', TL.bars.length, ' first bars', TL.bars.slice(0, 4).map(x => x.nBeats + ':' + x.events.map(e => e.label.ascii).join(',')).join(' '));
  }
  // 2) 무음, 짧은 클립, 매우 조용한 신호
  for (const [lab, sig] of [['silence 5s', new Float32Array(48000 * 5)], ['short 1.5s', S.y.slice(48000, 48000 * 2.5)], ['tiny 0.2s', S.y.slice(48000, 48000 * 1.2)]]) {
    try {
      const A2 = await Engine.analyze({ channels: [sig], sampleRate: 48000 }, null);
      const TL2 = Engine.buildTimeline(A2, {});
      console.log(lab, 'ok  beats', A2.beats.length, 'empty', TL2.empty, 'bars', TL2.bars.length);
    } catch (e) { console.log(lab, 'ERROR', e.stack); }
  }
  // 3) 44.1k, 96k 입력 샘플레이트
  for (const sr of [44100, 96000, 22050]) {
    const n = Math.floor(S.y.length * sr / 48000), y = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 48000 / sr, j = Math.floor(x), f = x - j; y[i] = (S.y[j] || 0) * (1 - f) + (S.y[j + 1] || 0) * f; }
    const A3 = await Engine.analyze({ channels: [y], sampleRate: sr }, null);
    const TL3 = Engine.buildTimeline(A3, {});
    let e = 0, c = 0; for (const tb of truth) { let best = 1; for (const d of TL3.beats) if (Math.abs(d - tb) < Math.abs(best)) best = d - tb; if (Math.abs(best) < 0.07) { e += best; c++; } }
    console.log('sr', sr, 'beats hit', c, '/', truth.length, 'mean err', (e / c * 1000).toFixed(1), 'ms  elapsed', A3.elapsed.toFixed(2));
  }
  // 4) 5분 곡 성능
  const long = T.render({ bpm: 112, meter: 4, bars: Array(5).fill(T.POP).flat().concat(T.POP.slice(0, 20)), melody: true, seed: 99 });
  const t0 = Date.now();
  const A4 = await Engine.analyze({ channels: [long.y, long.y], sampleRate: 48000 }, null);
  const t1 = Date.now();
  const TL4 = Engine.buildTimeline(A4, { res: 2, vocab: 'extended' });
  console.log('long', (long.y.length / 48000).toFixed(0), 's → analyze', ((t1 - t0) / 1000).toFixed(2), 's, timeline', (Date.now() - t1), 'ms, bars', TL4.bars.length, 'bpm', TL4.bpm.toFixed(2));
})();
