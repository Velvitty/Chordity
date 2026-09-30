// 통합 채점: 회귀 18곡 + 새 곡(대중·특수)을 한 번 분석해 비트·엇박·박자·첫 박·코드·조성을 JSON 한 줄씩 기록
// 사용: [ENGINE=...] node evalset.js 출력파일 묶음번호 묶음수 ['{"HPSS":false}']
const Engine = require(process.env.ENGINE || '../src/engine.js'); const T = require('./testlib.js'); const X = require('./stress.js');
const fs = require('fs'); const [out, gi, gn, ov] = process.argv.slice(2);
if (ov) Object.assign(Engine._.P, JSON.parse(ov));
const KEY = { 'pop 97': 'C 장조', 'pop 128': 'C 장조', 'waltz 150': 'D 장조', 'ballad 12/8 58': 'E♭ 장조', 'ballad 4/4 68 drift': 'C 장조', 'reggae 76': 'A 단조', 'rock weak-snare 118': 'C 장조', 'dance 124': 'C 장조', 'hiphop 88': 'C 장조', 'punk 176': 'C 장조', 'solo piano 72': 'C 장조', 'solo piano 3/4 84': 'D 장조', 'ballad rit 72→63': 'C 장조', 'mod pivot C→D 110': 'C 장조→D 장조', 'mod ballad Eb→E 70': 'E♭ 장조→E 장조', 'mod direct G→Ab 100': 'G 장조→A♭ 장조', 'relative Am→C (전조 아님)': '*', 'drum intro + pickup 104': 'C 장조' };
const all = T.cases().map(([n, s]) => ['R', n, s, () => T.render(s)]).concat(X.CASES.map(([n, s]) => [X.POPULAR.has(n) ? 'P' : 'S', n, s, () => X.render(s)]));
(async () => {
  for (let i = 0; i < all.length; i++) {
    if (i % +gn !== +gi) continue;
    const [grp, name, spec, mk] = all[i];
    const S = mk(); const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null); const TL = Engine.buildTimeline(A, {});
    const truth = S.beats.map(b => b.t), det = Array.from(TL.beats);
    let hit = 0, errs = []; for (const tb of truth) { let best = Infinity; for (const d of det) if (Math.abs(d - tb) < Math.abs(best)) best = d - tb; if (Math.abs(best) < 0.07) { hit++; errs.push(best); } }
    let off = 0; for (let k = 0; k + 1 < truth.length; k++) { const m = (truth[k] + truth[k + 1]) / 2; if (det.some(d => Math.abs(d - m) < 0.07)) off++; }
    const tD = S.beats.filter(b => b.pos % spec.meter === 0 && (grp === 'R' || b.pos === 0)).map(b => b.t), dD = TL.bars.filter(b => !b.pickup).map(b => b.t0);
    const dh = tD.filter(t => dD.some(d => Math.abs(d - t) < 0.07)).length, extra = dD.filter(d => !tD.some(t => Math.abs(d - t) < 0.07) && d > truth[0] - 0.05 && d < truth[truth.length - 1] + 0.05).length;
    let ex = 0, fam = 0, root = 0, tot = 0;
    for (const b of S.beats) {
      if (b.chord === 'N') continue;
      const lab = X.labelAt(TL, b.t + 0.5 * (60 / spec.bpm)); tot++; if (!lab || lab.nc) continue;
      const dd = T.parseDetected(lab.ascii), tr = X.parseChordX(b.chord), dq = dd.q.replace('♭', 'b');
      if (dd.root === tr.root) root++;
      if (dd.root === tr.root && dd.bass === tr.bass && (X.FAM[dq] === X.FAM[tr.q] || (tr.q === '5' && ['maj', 'min', 'sus'].includes(X.FAM[dq])))) fam++;
      if (dd.root === tr.root && dd.bass === tr.bass && dq === tr.q) ex++;
    }
    const keys = TL.keys.map(k => k.name + (k.barNum ? '@' + k.barNum : '')).join('→');
    const keyOk = grp === 'R' ? (KEY[name] === '*' ? TL.keys.length === 1 : TL.keys.map(k => k.name).join('→') === KEY[name]) : null;
    fs.appendFileSync(out, JSON.stringify({ grp, name, bpm: +TL.bpm.toFixed(1), hit, nb: truth.length, off, mae: errs.length ? +(errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length * 1000).toFixed(1) : null, meter: TL.meter.label, dh, nd: tD.length, extra, ex, fam, root, tot, keys, keyOk, sec: +A.elapsed.toFixed(2), mets: TL.meters.map(x => x.label + '@' + x.barNum).join('→'), truthMets: spec.truthMeters || null, tps: TL.tempos.map(t => Math.round(t.bpm) + '@' + t.barNum + '.' + t.beat).join('→') }) + '\n');
  }
})();
