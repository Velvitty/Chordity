// 임계값 정하기: 회색(이어짐) 판정 값과 경계 다듬기 값의 분포
const E = require('../src/engine.js'), T = require('./testlib.js'), X = require('./stress.js'), fs = require('fs');
E._.P.DBG_ATTACK = true;
const bars = (l, n) => l.map(ch => ch.map(c => [c, n / ch.length]));
const HOLD = { bpm: 70, meter: 4, style: 'pad', bars: bars([['C'], ['~'], ['G'], ['G'], ['Am'], ['~'], ['F'], ['F'], ['C'], ['~'], ['G'], ['~'], ['Am'], ['F'], ['G'], ['~'], ['C'], ['C']], 4), seed: 301 };
const songs = T.cases().map(([n, s]) => [n, s, T.render]).concat(X.CASES.map(([n, s]) => [n, s, X.render]), [['끌어 둔 코드(패드)', HOLD, X.render]]);
const q = (a, p) => { if (!a.length) return '-'; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
(async () => {
  const struck = [], held = [], mv = [], stay = [];
  for (const [name, spec, R] of songs) {
    const S = R(spec), A = await E.analyze({ channels: [S.y], sampleRate: S.sr }, null), TL = E.buildTimeline(A, {});
    const db = Array.from(TL.beats), di = t => { let best = -1, bd = 0.07; S.beats.forEach((b, i) => { if (Math.abs(b.t - t) < bd) { bd = Math.abs(b.t - t); best = i; } }); return best; };
    for (const d of A._attack.tied) { const j = di(d.t); if (j < 0) continue; const r = Math.max(d.rT, d.rB); (S.beats[j].hold ? held : struck).push({ r, rT: d.rT, rB: d.rB, name }); }
    for (const d of A._attack.edge) {
      const jb = di(d.t); if (jb < 1) continue;
      const chAt = j => S.beats[j] && S.beats[j].chord, trueAtB = chAt(jb) !== chAt(jb - 1), trueAtB1 = jb >= 2 && chAt(jb - 1) !== chAt(jb - 2);
      if (trueAtB1 && !trueAtB) mv.push({ ...d, name }); else if (trueAtB) stay.push({ ...d, name });
    }
  }
  console.log(`[회색] 새로 친 곳 ${struck.length}개: max(rT,rB) 하위 5% ${q(struck.map(x => x.r), 0.05)}, 최소 ${q(struck.map(x => x.r), 0)} | 끌어 둔 곳 ${held.length}개: 최대 ${held.length ? Math.max(...held.map(x => x.r)).toFixed(2) : '-'}, 값 ${held.map(x => x.rT + '/' + x.rB).join(' ')}`);
  console.log('  새로 친 곳 중 낮은 값:', struck.sort((a, b) => a.r - b.r).slice(0, 6).map(x => `${x.name.slice(0, 12)} ${x.rT}/${x.rB}`).join(' | '));
  console.log(`[경계] 약박 바뀜 중 옮겨야 맞는 곳 ${mv.length}개: 규칙에 걸림 ${mv.filter(x => x.move).length} |`, mv.map(x => `${x.name.slice(0, 10)} ${x.X}→${x.Y} aOld ${x.aOld} de ${x.de}${x.move ? ' ✓' : ''}`).join(' | '));
  const fp = stay.filter(x => x.move);
  console.log(`[경계] 약박 바뀜 중 정답이 그 박인 곳 ${stay.length}개: 규칙에 잘못 걸림 ${fp.length}개 |`, stay.map(x => `${x.name.slice(0, 10)} ${x.X}→${x.Y} aOld ${x.aOld} de ${x.de}${x.move ? ' ✗' : ''}`).join(' | '));
  // 실제 녹음
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')), f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), n = f.length / 2, L = new Float32Array(n), Rr = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; Rr[i] = f[2 * i + 1]; }
  const A = await E.analyze({ channels: [L, Rr], sampleRate: 44100 }, null); E.buildTimeline(A, {});
  const rv = A._attack.tied.map(d => Math.max(d.rT, d.rB)).sort((a, b) => a - b);
  console.log(`[실제 녹음] 회색 후보 ${rv.length}개 값: ${rv.map(v => v.toFixed(2)).join(' ')}`);
  const re = A._attack.edge.filter(x => x.move);
  console.log(`[실제 녹음] 약박 바뀜 ${A._attack.edge.length}개 중 규칙에 걸리는 곳 ${re.length}개:`, A._attack.edge.map(x => `${x.t.toFixed(1)}초 ${x.X}→${x.Y} aOld ${x.aOld} de ${x.de}${x.move ? ' (옮김)' : ''}`).join(' | '));
})();
