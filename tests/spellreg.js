// 1.8.1(철자 고정 표) 대 새 철자: 같은 분석 결과로 차트를 만들어 코드 음높이·종류가 같은지, 철자만 바뀐 곳은 어디인지
const NEW = require('../src/engine.js'), OLD = require('./baselines/engine181.js'), T = require('./testlib.js'), fs = require('fs');
const LET = 'CDEFGAB', LPC = [0, 2, 4, 5, 7, 9, 11];
const parse = t => { const m = /^([A-G][♯♭]*)(.*?)(?:\/([A-G][♯♭]*))?$/.exec(t); if (!m) return null; const pc = nm => { let p = LPC[LET.indexOf(nm[0])]; for (const c of nm.slice(1)) p += c === '♯' ? 1 : -1; return ((p % 12) + 12) % 12; }; return { root: pc(m[1]), q: m[2], bass: m[3] ? pc(m[3]) : null }; };
const evs = TL => TL.bars.flatMap(b => b.events.map(e => e.label.text));
(async () => {
  const songs = T.cases().map(([n, s]) => [n, () => { const S = T.render(s); return { channels: [S.y], sampleRate: S.sr }; }]);
  songs.push(['실제 녹음', () => { const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4); const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; } return { channels: [L, R], sampleRate: 44100 }; }]);
  let total = 0, pitchDiff = 0; const changes = new Map();
  for (const [name, mk] of songs) {
    const A = await NEW.analyze(mk(), null);
    for (const vocab of ['standard', 'extended']) {
      const a = evs(OLD.buildTimeline(A, { vocab })), b = evs(NEW.buildTimeline(A, { vocab }));
      if (a.length !== b.length) { console.log(name, vocab, '코드 수 다름', a.length, b.length); pitchDiff++; continue; }
      a.forEach((x, i) => { total++; const y = b[i]; if (x === y) return; const p = parse(x), q = parse(y);
        if (!p || !q || p.root !== q.root || p.q !== q.q || p.bass !== q.bass) { pitchDiff++; console.log('  음높이/종류 다름:', name, x, '→', y); }
        else { const k = x + ' → ' + y; changes.set(k, (changes.get(k) || []).concat(name)); } });
    }
  }
  console.log(`비교한 코드 ${total}개(19곡 × 기본·확장 어휘) | 음높이·종류가 달라진 코드 ${pitchDiff}개`);
  console.log(`철자만 바뀐 곳 ${[...changes.values()].reduce((s, v) => s + v.length, 0)}개: ` + ([...changes].map(([k, v]) => `${k} (${[...new Set(v)].join(', ')})`).join(' | ') || '없음'));
})();
