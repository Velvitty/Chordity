// 철자 전수: 모든 코드 상태 × 24개 조 × 로마 숫자 문맥
const E = require('../src/engine.js'), I = E._;
const LET = 'CDEFGAB', LPC = [0, 2, 4, 5, 7, 9, 11];
const pcOf = nm => { const m = /^([A-G])([♯♭]*)$/.exec(nm); if (!m) return null; let pc = LPC[LET.indexOf(m[1])]; for (const c of m[2]) pc += c === '♯' ? 1 : -1; return ((pc % 12) + 12) % 12; };
const letterWant = (letter, pc) => { let d = ((pc - LPC[letter]) % 12 + 12) % 12; if (d > 6) d -= 12; return d; };   // 그 글자로 쓰면 필요한 임시표 수
const IDX = x => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'].indexOf(String(x).replace(/[♭♯°ø+M]/g, '').toUpperCase());
const states = I.getStates('extended', true).filter(s => s && s.root >= 0);
const triads = states.filter(s => (s.q === 'maj' || s.q === 'min') && s.bass === s.root);
let n = 0, pitchBad = [], dbl = [], letterBad = [], bassBad = [], fallback = { dbl: 0, white: 0 }, modSkip = 0;
for (let t = 0; t < 12; t++) for (const mode of ['major', 'minor']) {
  const key = { tonic: t, mode }, names = I.spelling(key), tl = LET.indexOf(names[t][0]);
  for (const st of states) {
    const ctx = [[null, null]];
    for (const nx of triads) { ctx.push([nx, key]); ctx.push([nx, { tonic: nx.root, mode: nx.q === 'min' ? 'minor' : 'major' }]); }
    for (const [nx, nk] of ctx) {
      const rn = I.romanOf(st, key, st.inv || 0, nx, nk), sp = I.spellChord(st, rn, key, nk), f = I.formatChord(st, names, true, sp); n++;
      const tag = `${names[t]} ${mode === 'major' ? '장조' : '단조'} ${rn.text}: ${f.text}`;
      if (pcOf(f.root) !== st.root || (st.bass !== st.root && pcOf(f.bass) !== st.bass)) pitchBad.push(tag);
      if (/♯♯|♭♭|𝄪|𝄫/.test(f.text)) dbl.push(tag);
      const modV = rn.num === 'V' && !rn.sec && nk && (nk.tonic !== t || nk.mode !== mode);
      if (modV) { modSkip++; continue; }
      const head = st.q === 'sl2' ? st.bass : st.root;
      let want = (tl + (rn.sec ? IDX(rn.sec) + IDX(rn.num) : IDX(rn.num))) % 7;       // 로마 숫자가 가리키는 글자(sl2는 베이스)
      const rootWantL = st.q === 'sl2' ? (want + 6) % 7 : want;
      const gotL = LET.indexOf(f.root[0]);
      if (gotL !== rootWantL) {
        const d = letterWant(rootWantL, st.root), alt = LET[rootWantL] + (d === 1 ? '♯' : d === -1 ? '♭' : '');
        if (Math.abs(d) > 1) fallback.dbl++;
        else if (/^(F♭|C♭|E♯|B♯)$/.test(alt) && names[st.root] !== alt) fallback.white++;
        else letterBad.push(tag + ` (기대 글자 ${LET[rootWantL]})`);
      }
      if (st.bass !== st.root) {
        const off = st.q === 'sl2' ? 1 : st.inv === 1 ? 2 : st.inv === 2 ? 4 : st.inv === 3 ? 6 : null;
        if (off != null) {
          const bl = (gotL + off) % 7, got = LET.indexOf(f.bass[0]);
          if (got !== bl) { const d = letterWant(bl, st.bass), alt = LET[bl] + (d === 1 ? '♯' : d === -1 ? '♭' : ''); if (!(Math.abs(d) > 1 || (/^(F♭|C♭|E♯|B♯)$/.test(alt) && names[st.bass] !== alt))) bassBad.push(tag + ` (베이스 기대 글자 ${LET[bl]})`); }
        }
      }
    }
  }
}
console.log(`확인한 코드 이름표 ${n}개(전조 직전 V ${modSkip}개는 글자 대조에서 빼고 음높이·겹임시표만)`);
console.log(`음높이 틀림 ${pitchBad.length ? pitchBad.slice(0, 5) : 0} | 겹임시표 ${dbl.length ? dbl.slice(0, 5) : 0}`);
console.log(`근음 글자가 로마 숫자와 다름(대체 아님) ${letterBad.length ? letterBad.slice(0, 6) : 0} | 베이스 글자 틀림 ${bassBad.length ? bassBad.slice(0, 6) : 0}`);
console.log(`정당한 대체: 겹임시표 피함 ${fallback.dbl}개, 조에 없는 F♭·C♭·E♯·B♯ 피함 ${fallback.white}개`);
const K = (t, m) => ({ tonic: t, mode: m }), S = (r, q, inv) => states.find(s => s.root === r && s.q === q && (s.inv || 0) === inv);
const ex = [['A 단조 ♭II', K(9, 'minor'), S(10, 'maj', 0)], ['E♭ 장조 V7/ii', K(3, 'major'), S(0, 'dom7', 0), S(5, 'min', 0)], ['E♭ 장조 vii°7/V', K(3, 'major'), S(9, 'dim7', 0), S(10, 'maj', 0)], ['D♭ 장조 ♭VI', K(1, 'major'), S(9, 'maj', 0)], ['F♯ 장조 ♭II', K(6, 'major'), S(7, 'maj', 0)], ['A♭ 장조 ♭II6', K(8, 'major'), S(9, 'maj', 1)], ['G 장조 V/vi', K(7, 'major'), S(11, 'maj', 0), S(4, 'min', 0)], ['B 장조 V7/IV', K(11, 'major'), S(11, 'dom7', 0), S(4, 'maj', 0)]];
console.log('예: ' + ex.map(([nm, k, s, nx]) => { const rn = I.romanOf(s, k, s.inv || 0, nx || null, nx ? k : null); return nm + ' → ' + I.formatChord(s, I.spelling(k), true, I.spellChord(s, rn, k, nx ? k : null)).text + '(' + rn.text + ')'; }).join(' | '));
