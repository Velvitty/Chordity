// 전조 추적 시험: 모든 합성 곡에서 조성 구간과 전조 위치(정답 대비 박 오차)
const Engine = require('../src/engine.js');
const T = require('./testlib.js');
(async () => {
  for (const [name, spec] of T.cases()) {
    const S = T.render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    const TL = Engine.buildTimeline(A, {});
    const det = TL.keys.map(k => `${k.name}@${k.barNum}마디${k.beat}박`).join(' → ');
    let verdict = '';
    const truth = spec.keys;
    if (!truth) verdict = TL.keys.length === 1 ? '✓ 전조 없음' : '✗ 가짜 전조';
    else if (truth[0][1] === '?') verdict = TL.keys.length === 1 ? '✓ 전조 없음(나란한조)' : '✗ 가짜 전조';
    else {
      const ok = TL.keys.length === truth.length && TL.keys.every((k, i) => k.name === truth[i][1]);
      const tb = truth.slice(1).map(([bar]) => S.beats.find(b => b.bar === bar).t);
      const err = TL.keys.slice(1).map((k, i) => tb[i] !== undefined ? Math.round((k.t0 - tb[i]) / (60 / spec.bpm)) : NaN);
      verdict = (ok ? '✓' : '✗') + ' 정답 ' + truth.map(([b, k]) => k + (b ? `@${b + 1}마디` : '')).join(' → ') + (err.length ? ` | 위치 오차 ${err.map(e => (e > 0 ? '+' : '') + e).join(',')}박` : '');
    }
    if (verdict.startsWith('✗')) process.exitCode = 1;   // 실패하면 종료 코드 1
    const post = TL.bars.slice(-6).flatMap(b => b.events.map(e => e.label.text)).join(' ');
    console.log(name.padEnd(28), '|', det.padEnd(40), '|', verdict, spec.keys && spec.keys.length > 1 ? '| 끝부분: ' + post : '');
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
