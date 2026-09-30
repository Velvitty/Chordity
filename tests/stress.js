// 스트레스 시험: 회귀 시험에 없는 곡 종류(변박, 템포 급변, 루바토, 스윙, 보사노바, 디스토션, 패드, 코드 밖 베이스, 음높이 변화)
// 앱 코드와 기존 회귀 시험(testlib.js)은 그대로 두고 시험에만 쓰는 생성기
const Engine = require(process.env.ENGINE || '../src/engine.js');   // 기준선 비교 때는 이전 엔진으로
const T = require('./testlib.js');

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QX = { m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], aug: [0, 4, 8], sus2: [0, 2, 7],
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus4: [0, 5, 7], dim: [0, 3, 6],
  '9': [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  '13': [0, 4, 10, 14, 21], '5': [0, 7, 12], add9: [0, 4, 7, 14],
};
// 채점용 계열: 어휘에 없는 코드도 계열(장·단·딸림 등)로 비교
const FAM = { '': 'maj', maj7: 'maj', maj9: 'maj', '6': 'maj', add9: 'maj', m: 'min', m7: 'min', m9: 'min', m6: 'min',
  '7': 'dom', '9': 'dom', '13': 'dom', sus4: 'sus', sus2: 'sus', dim: 'dim', dim7: 'dim', m7b5: 'dim', aug: 'aug', '5': 'pow' };
const acc = a => a === '#' ? 1 : a === 'b' ? -1 : 0;
function parseChordX(s) {
  const m = /^([A-G])([#b]?)(maj9|maj7|m9|m7b5|m7|m6|add9|m|13|9|7|6|5|sus4|sus2|dim7|dim|aug)?(?:\/([A-G])([#b]?))?$/.exec(s);
  if (!m) throw new Error('bad chord ' + s);
  const root = (NOTE[m[1]] + acc(m[2]) + 12) % 12, q = m[3] || '';
  const bass = m[4] ? (NOTE[m[4]] + acc(m[5]) + 12) % 12 : root;
  return { root, q, ivs: QX[q], pcs: QX[q].map(i => (root + i) % 12), bass };
}

function render(spec) {
  const sr = 44100, R = T.rng(spec.seed || 7), style = spec.style || 'pop', M = spec.meter;
  const groups = spec.groups || (M === 5 ? [3, 2] : M === 7 ? [4, 3] : M === 3 ? [3] : [2, 2]);
  const gStart = new Map(); { let a = 0; for (const g of groups) { gStart.set(a, g); a += g; } }
  // 템포: 구간별 템포(tempoSeg), 루바토(박마다 무작위로 흔들리는 걸음)
  let mult = 1;
  const period = i => {
    let bpm = spec.bpm;
    if (spec.tempoSeg) for (const [from, v] of spec.tempoSeg) if (i >= from) bpm = v;
    let p = 60 / bpm;
    if (spec.rubato) { mult = Math.min(1 + spec.rubato, Math.max(1 - spec.rubato, mult + (R() * 2 - 1) * spec.rubato * 0.35)); p *= mult; }
    return p;
  };
  const beats = []; let t = 1.2, bi = 0;
  let lastCh = null;
  spec.bars.forEach((bar, barIdx) => { let pos = 0; for (const [ch0, nb] of bar) { const hold = ch0 === '~', ch = hold ? lastCh : ch0; lastCh = ch; for (let k = 0; k < nb; k++) { beats.push({ t, pos, chord: ch, bar: barIdx, hold }); t += period(bi++); pos++; } } });   // '~': 앞 코드를 새로 치지 않고 끌어 둠
  const total = t + 3;
  const N = Math.ceil(total * sr), y = new Float32Array(N), gtr = new Float32Array(N), dr = new Float32Array(N);
  const cents = tt => (spec.cents || 0) + (spec.centsDrift ? spec.centsDrift * tt / total : 0);   // 테이프처럼 서서히 변하는 음높이
  const hz = (m, t0) => 440 * Math.pow(2, (m - 69) / 12 + cents(t0) / 1200);
  const addTo = (buf, t0, fn, dur) => { const i0 = Math.round(t0 * sr), n = Math.round(dur * sr); for (let i = 0; i < n && i0 + i < N; i++) if (i0 + i >= 0) buf[i0 + i] += fn(i / sr); };
  let hp = 0;
  const kick = (t0, a = 0.9) => { let ph = 0; addTo(dr, t0, tt => { const f = 48 + 90 * Math.exp(-tt / 0.03); ph += 2 * Math.PI * f / sr; return a * Math.sin(ph) * Math.exp(-tt / 0.14); }, 0.35); };
  const snare = (t0, a = 1) => addTo(dr, t0, tt => { const nz = R() * 2 - 1, h = nz - hp; hp = nz; return a * (0.32 * h * Math.exp(-tt / 0.1) + 0.25 * Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt / 0.05)); }, 0.3);
  const hat = (t0, a, dec) => addTo(dr, t0, tt => { const nz = R() * 2 - 1, h = nz - hp; hp = nz; return a * h * Math.exp(-tt / dec); }, dec * 5);
  const tone = (buf, t0, dur, midi, amp, nh, dec, pw, att = 0.004) => {
    const f = hz(midi, t0);
    addTo(buf, t0, tt => {
      let v = 0;
      for (let h = 1; h <= nh; h++) { if (f * h > 16000) break; v += Math.sin(2 * Math.PI * f * h * tt) / Math.pow(h, pw); }
      const env = Math.min(1, tt / att) * Math.exp(-tt / dec) * (tt > dur ? Math.exp(-(tt - dur) / 0.05) : 1);
      return amp * v * env;
    }, dur + 0.3);
  };
  const voicing = pcs => pcs.map(pc => 55 + ((pc - 55 % 12 + 24) % 12)).sort((a, b) => a - b);
  const spanLeft = i => { let k = i; while (k + 1 < beats.length && beats[k + 1].chord === beats[i].chord && (beats[k + 1].bar === beats[i].bar || beats[k + 1].hold)) k++; return k - i + 1; };

  for (let i = 0; i < beats.length; i++) {
    const b = beats[i], bt = b.t, nxt = i + 1 < beats.length ? beats[i + 1].t : bt + 60 / spec.bpm;
    const bd = nxt - bt, c = parseChordX(b.chord), first = i === 0 || beats[i - 1].chord !== b.chord || (beats[i - 1].bar !== b.bar && !b.hold);
    const bm = 36 + ((c.bass - 36 % 12 + 12) % 12), vc = voicing(c.pcs);
    if (style === 'pop') {                               // 무리 첫 박에 킥, 무리 안 둘째(4박 무리는 셋째) 박에 스네어(마디 길이에 맞춘 무리)
      const BL = spec.bars[b.bar].reduce((a2, c2) => a2 + c2[1], 0), grp = BL === 5 ? [3, 2] : BL === 7 ? [4, 3] : BL === 3 ? [3] : BL === 6 ? [3, 3] : [2, 2];
      const gS = new Map(); { let a2 = 0; for (const g of grp) { gS.set(a2, g); a2 += g; } }
      const g0 = [...gS.keys()].filter(q => q <= b.pos).pop(), gl = gS.get(g0);
      if (b.pos === g0) kick(bt);
      if (b.pos === g0 + (gl >= 4 ? 2 : 1)) snare(bt);
      for (let s = 0; s < 2; s++) hat(bt + bd * s / 2, s ? 0.1 : 0.05, s ? 0.08 : 0.025);
      if (spec.crash && b.pos === 0) hat(bt, 0.35, 1.2);                          // 마디마다 크래시 심벌(긴 잡음)
      tone(y, bt, bd * 0.95, bm, 0.3, 6, 0.7, 1.2);
      for (const nm of vc) tone(y, bt, bd * 0.9, nm, 0.1, 10, 0.9, 1.0);
    } else if (style === 'piano') {                      // 드럼 없는 피아노 아르페지오
      if (b.pos % 2 === 0) tone(y, bt, bd * 1.8, bm, 0.3, 6, 0.5, 1.2);
      const arp = vc.concat(vc.map(v => v + 12));
      for (let s = 0; s < 2; s++) tone(y, bt + bd * s / 2, bd * 0.9, arp[(b.pos * 2 + s) % arp.length], 0.13, 10, 0.6, 1.0);
    } else if (style === 'jazz') {                       // 스윙: 라이드(1·2·2a·3·4·4a), 2·4 하이햇, 워킹 베이스, 찰스턴 컴핑
      hat(bt, 0.06, 0.3);
      if (b.pos % 2 === 1) { hat(bt + bd * 2 / 3, 0.05, 0.25); hat(bt, 0.1, 0.02); }
      kick(bt, 0.18);
      const nx = i + 1 < beats.length ? parseChordX(beats[i + 1].chord) : c;
      const walk = [0, c.ivs[1], c.ivs[2] % 12, null][b.pos % 4];
      const bn = walk === null ? 36 + ((nx.root - 36 % 12 + 12) % 12) + (R() < 0.5 ? 1 : -1) : 36 + ((c.root + walk - 36 % 12 + 12) % 12);
      tone(y, bt, bd * 0.9, bn, 0.32, 6, 0.5, 1.2);
      if (b.pos % 4 === 0) for (const nm of vc) tone(y, bt, bd * 0.5, nm, 0.08, 8, 0.4, 1.1);
      if (b.pos % 4 === 1) for (const nm of vc) tone(y, bt + bd * 2 / 3, bd * 0.5, nm, 0.08, 8, 0.4, 1.1);
    } else if (style === 'bossa') {                      // 보사노바: 림 클릭, 1·3 베이스(5도 교대), 당김음 기타
      if (b.pos % 4 === 0 || b.pos % 4 === 2) kick(bt, 0.5);
      hat(bt, 0.04, 0.02); hat(bt + bd / 2, 0.04, 0.02);
      if (b.pos % 4 === 0 || (b.pos % 4 === 2 && b.bar % 2 === 0)) addTo(y, bt + bd * (b.pos % 4 === 2 ? 0.5 : 0), tt => 0.2 * Math.sin(2 * Math.PI * 1700 * tt) * Math.exp(-tt / 0.012), 0.06);
      if (b.pos % 2 === 0) tone(y, bt, bd * 1.9, bm + (b.pos % 4 === 2 ? 7 : 0), 0.3, 6, 0.6, 1.2);
      for (const off of (b.pos % 4 === 0 ? [0] : b.pos % 4 === 1 ? [0.5] : b.pos % 4 === 2 ? [0.5] : [])) for (const nm of vc) tone(y, bt + bd * off, bd * 0.45, nm, 0.08, 8, 0.35, 1.1);
    } else if (style === 'metal') {                      // 디스토션 파워 코드(8분 뮤트), 8분 킥, 2·4 스네어
      kick(bt); kick(bt + bd / 2, 0.7);
      if (b.pos % 2 === 1) snare(bt, 1.2);
      hat(bt, 0.06, 0.03);
      tone(y, bt, bd * 0.95, bm, 0.3, 6, 0.7, 1.2);
      for (let s = 0; s < 2; s++) for (const iv of c.ivs) tone(gtr, bt + bd * s / 2, bd * 0.4, 40 + ((c.root - 40 % 12 + 12) % 12) + iv, 0.35, 24, 0.25, 1.0);
    } else if (style === 'pad') {                        // 드럼 없는 앰비언트: 느리게 솟는 패드, 긴 베이스
      if (first) {
        const span = spanLeft(i), dur = beats[Math.min(beats.length - 1, i + span - 1)].t - bt + bd;
        tone(y, bt, dur, bm, 0.28, 5, 3.0, 1.3, 0.25);
        for (const nm of vc) tone(y, bt, dur, nm, 0.09, 6, 4.0, 1.4, 0.45);
      }
    }
    else if (style === 'kpop') {                      // 4박 킥, 2·4 클랩, 엇박 오픈햇, 엇박 신스 베이스, 마디 패드
      kick(bt); if (b.pos % 2 === 1) snare(bt, 0.9); hat(bt + bd / 2, 0.2, 0.08);
      tone(y, bt + bd / 2, bd * 0.45, bm + (b.pos % 2 ? 12 : 0), 0.3, 8, 0.25, 1.1);
      if (b.pos % 4 === 0) tone(y, bt, bd * 0.4, bm, 0.25, 8, 0.3, 1.1);
      if (first) { const span = spanLeft(i), dur = beats[Math.min(beats.length - 1, i + span - 1)].t - bt + bd; for (const nm of vc) tone(y, bt, dur, nm, 0.08, 8, 2.5, 1.2, 0.05); }
    } else if (style === 'poprock') {                 // 팝 드럼 + 디스토션 기타(파워 코드와 3화음 모두), 8분 다운피킹
      if (b.pos % 2 === 0) kick(bt); if (b.pos % 2 === 1) snare(bt); hat(bt, 0.06, 0.03); hat(bt + bd / 2, 0.06, 0.03);
      tone(y, bt, bd * 0.95, bm, 0.3, 6, 0.7, 1.2);
      for (let s2 = 0; s2 < 2; s2++) for (const iv of c.ivs) tone(gtr, bt + bd * s2 / 2, bd * 0.45, 52 + ((c.root - 52 % 12 + 12) % 12) + iv, 0.25, 20, 0.3, 1.0);
    } else if (style === 'rnb') {                     // 느린 8분 아르페지오 + 1·3 킥, 3 스네어, 베이스는 적힌 슬래시 음
      if (b.pos % 4 === 0) kick(bt); if (b.pos % 4 === 2) snare(bt); hat(bt, 0.04, 0.03); hat(bt + bd / 2, 0.04, 0.03);
      tone(y, bt, bd * 0.95, bm, 0.32, 6, 0.8, 1.2);
      const arp = vc.concat(vc.map(v => v + 12));
      for (let s2 = 0; s2 < 2; s2++) tone(y, bt + bd * s2 / 2, bd * 0.9, arp[(b.pos * 2 + s2) % arp.length], 0.12, 10, 0.6, 1.0);
    } else if (style === 'strum') {                   // 어쿠스틱 기타 8분 스트로크(내림은 낮은 줄부터 15 ms 간격), 셰이커
      hat(bt, 0.03, 0.02); hat(bt + bd / 2, 0.05, 0.02);
      if (b.pos % 2 === 0) tone(y, bt, bd * 1.8, bm, 0.22, 6, 0.6, 1.2);
      const gv = [40, 45, 50, 55, 59, 64].map(o => o + ((c.pcs.map(pc => (pc - o % 12 + 12) % 12).sort((a2, b2) => a2 - b2)[0])));
      for (let s2 = 0; s2 < 2; s2++) { const up = s2 === 1, order = up ? gv.slice(3).reverse() : gv; order.forEach((nm, k) => tone(y, bt + bd * s2 / 2 + k * 0.015, bd * 0.5, nm, up ? 0.05 : 0.07, 12, 0.5, 1.0)); }
    }
    if (spec.melody && (style !== 'pad' || b.pos % 2 === 0)) {
      const pc = R() < 0.8 ? c.pcs[Math.floor(R() * c.pcs.length)] : Math.floor(R() * 12);
      tone(y, bt, bd * 0.95, 67 + ((pc - 67 % 12 + 12) % 12), 0.08, 3, 1.5, 1.5);
    }
  }
  if (style === 'metal' || style === 'poprock') for (let i = 0; i < N; i++) y[i] += 0.3 * Math.tanh(4 * gtr[i]);   // 디스토션
  const DG = spec.drumGain || 1, HG = spec.harmGain || 1;
  for (let i = 0; i < N; i++) y[i] = HG * y[i] + DG * dr[i];
  for (let i = 0; i < N; i++) y[i] += (R() * 2 - 1) * 0.002;
  return { sr, y, beats, total };
}

function labelAt(TL, t) {
  const b = TL.beats; if (t < b[0]) return null;
  let lo = 0, hi = b.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (b[mid] <= t) lo = mid; else hi = mid - 1; }
  const j = lo, bar = TL.bars[TL.barOfBeat[j]], iv = j + 1 < b.length ? b[j + 1] - b[j] : b[j] - b[j - 1];
  const off = (j - bar.startBeat) + (t - b[j]) / iv;
  let ev = bar.events[0]; for (const e of bar.events) if (e.off <= off + 1e-9) ev = e;
  return ev.label;
}
const bars = (list, n) => list.map(x => x.length === 1 ? [[x[0], n]] : x.reduce((a, v, k) => (k % 2 ? a[a.length - 1].push(v) : a.push([v]), a), []));
const rep = (a, k) => Array.from({ length: k }, () => a).flat();
const CASES = [
  ['5/4 팝 120', { bpm: 120, meter: 5, bars: rep(bars([['C'], ['G'], ['Am'], ['F']], 5), 4), melody: true, seed: 101 }],
  ['7/4 록 126', { bpm: 126, meter: 7, bars: rep([[['Am', 7]], [['C', 4], ['G', 3]], [['D', 7]], [['F', 4], ['E', 3]]], 3), melody: true, seed: 103 }],
  ['템포 급변 96→132', { bpm: 96, meter: 4, bars: T.POP, tempoSeg: [[0, 96], [48, 132]], melody: true, seed: 107 }],
  ['루바토 피아노 66', { bpm: 66, meter: 4, style: 'piano', bars: T.POP.slice(0, 16), rubato: 0.12, melody: true, seed: 109 }],
  ['스윙 재즈 140', { bpm: 140, meter: 4, style: 'jazz', bars: rep(bars([['Dm9'], ['G13'], ['Cmaj9'], ['A7'], ['Dm9'], ['G7'], ['Cmaj7', 2, 'A7', 2], ['Dm7', 2, 'G7', 2]], 4), 2).concat([[['C6', 4]]]), melody: true, seed: 113 }],
  ['비밥 260', { bpm: 260, meter: 4, style: 'jazz', bars: rep(bars([['Dm7'], ['G7'], ['Cmaj7'], ['A7'], ['Dm7', 2, 'G7', 2], ['Cmaj7', 2, 'A7', 2], ['Dm7'], ['G7']], 4), 3), melody: true, seed: 127 }],
  ['보사노바 132', { bpm: 132, meter: 4, style: 'bossa', bars: rep(bars([['Fmaj7'], ['Fmaj7'], ['G7'], ['G7'], ['Gm7'], ['C7'], ['Fmaj7'], ['C7']], 4), 2), melody: true, seed: 131 }],
  ['메탈 150 디스토션', { bpm: 150, meter: 4, style: 'metal', bars: rep([[['E5', 4]], [['E5', 4]], [['G5', 2], ['A5', 2]], [['C5', 2], ['D5', 2]]], 4), seed: 137 }],
  ['앰비언트 패드 70', { bpm: 70, meter: 4, style: 'pad', bars: rep(bars([['Cmaj7'], ['Cmaj7'], ['Am7'], ['Am7'], ['Fmaj7'], ['Fmaj7'], ['G'], ['G']], 4), 2), melody: true, seed: 139 }],
  ['코드 밖 베이스(F/G 등) 100', { bpm: 100, meter: 4, bars: rep(bars([['C'], ['F/G'], ['C'], ['Bb/C'], ['F'], ['Ab/Bb'], ['C'], ['F/G']], 4), 2), melody: true, seed: 149 }],
  ['테이프 음높이 0→+40 cent', { bpm: 100, meter: 4, bars: T.POP, centsDrift: 40, melody: true, seed: 151 }],
  ['케이팝·EDM 126', { bpm: 126, meter: 4, style: 'kpop', bars: rep(bars([['Am7'], ['Fmaj7'], ['C'], ['G'], ['Am7'], ['Fmaj7'], ['C'], ['Esus4', 2, 'E', 2]], 4), 2).concat(rep(bars([['F'], ['G'], ['Em7'], ['Am7'], ['Dm7'], ['G'], ['C'], ['C']], 4), 1)), melody: true, seed: 157 }],
  ['팝록 파워 코드→3화음 138', { bpm: 138, meter: 4, style: 'poprock', bars: rep(bars([['E5'], ['E5'], ['A5'], ['B5']], 4), 2).concat(rep(bars([['E'], ['B'], ['C#m'], ['A']], 4), 2)), melody: true, seed: 163 }],
  ['R&B 발라드 슬래시 72', { bpm: 72, meter: 4, style: 'rnb', bars: rep(bars([['C'], ['G/B'], ['Am7'], ['Am7/G'], ['F'], ['C/E'], ['Dm7'], ['F/G']], 4), 2).concat([[['C', 4]]]), melody: true, seed: 167 }],
  ['드럼이 큰 힙합 90', { bpm: 90, meter: 4, style: 'pop', bars: T.POP.slice(0, 16), drumGain: 3.2, harmGain: 0.55, melody: true, seed: 173 }],
  ['변박 팝 4/4→3/4→4/4 110', { bpm: 110, meter: 4, bars: bars([['C'], ['G'], ['Am'], ['F'], ['C'], ['G'], ['F'], ['G']], 4).concat(bars([['Am'], ['F'], ['C'], ['G'], ['Am'], ['F'], ['Dm'], ['G']], 3), bars([['C'], ['G'], ['Am'], ['F'], ['C'], ['G'], ['F'], ['C']], 4)), melody: true, seed: 191, truthMeters: '4/4@1→3/4@9→4/4@17' }],
  ['왈츠 절→4/4 후렴 120', { bpm: 120, meter: 3, bars: bars([['D'], ['A'], ['Bm'], ['G'], ['D'], ['Em'], ['A'], ['D']], 3).concat(bars([['G'], ['A'], ['F#m'], ['Bm'], ['G'], ['A'], ['D'], ['D'], ['G'], ['A'], ['Bm'], ['D']], 4)), melody: true, seed: 193, truthMeters: '3/4@1→4/4@9' }],
  ['드럼이 아주 큰 록(심벌) 112', { bpm: 112, meter: 4, style: 'pop', crash: true, bars: T.POP.slice(0, 16), drumGain: 6, harmGain: 0.3, melody: true, seed: 181 }],
  ['어쿠스틱 스트로크 팝 104', { bpm: 104, meter: 4, style: 'strum', bars: rep(bars([['G'], ['D/F#'], ['Em'], ['C'], ['G'], ['D'], ['C'], ['D']], 4), 2), melody: true, seed: 179 }],
];
// 검증 시 우선하는 대중음악 곡
const POPULAR = new Set(['드럼이 아주 큰 록(심벌) 112', '템포 급변 96→132', '루바토 피아노 66', '코드 밖 베이스(F/G 등) 100', '테이프 음높이 0→+40 cent', '케이팝·EDM 126', '팝록 파워 코드→3화음 138', 'R&B 발라드 슬래시 72', '드럼이 큰 힙합 90', '어쿠스틱 스트로크 팝 104']);

module.exports = { render, CASES, POPULAR, parseChordX, FAM, labelAt };
if (require.main === module) (async () => {
  const only = process.argv[2];
  for (const [name, spec] of CASES) {
    if (only && !name.includes(only)) continue;
    const S = render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    const TL = Engine.buildTimeline(A, {});
    const truth = S.beats.map(b => b.t), det = Array.from(TL.beats);
    const hitOf = ref => { let h = 0; for (const tb of ref) if (det.some(d => Math.abs(d - tb) < 0.07)) h++; return h; };
    const hits = hitOf(truth);
    let off = 0; for (let i = 0; i + 1 < truth.length; i++) { const m = 0.5 * (truth[i] + truth[i + 1]); if (det.some(d => Math.abs(d - m) < 0.07)) off++; }
    // 절반 층위(2박마다)로 잡았는지도 확인
    const even = truth.filter((_, k) => k % 2 === 0), odd = truth.filter((_, k) => k % 2 === 1);
    const half = Math.max(hitOf(even) / even.length, hitOf(odd) / odd.length);
    const trueDown = S.beats.filter(b => b.pos === 0).map(b => b.t);
    const detDown = TL.bars.filter(b => !b.pickup).map(b => b.t0);
    let dh = 0; for (const td of trueDown) if (detDown.some(d => Math.abs(d - td) < 0.07)) dh++;
    let ex = 0, fam = 0, root = 0, tot = 0; const conf = {};
    for (const b of S.beats) {
      const lab = labelAt(TL, b.t + 0.5 * (60 / spec.bpm)); if (!lab || lab.nc) { tot++; continue; }
      const dd = T.parseDetected(lab.ascii), tr = parseChordX(b.chord); tot++;
      const dq = dd.q.replace('♭', 'b');
      if (dd.root === tr.root) root++;
      if (dd.root === tr.root && dd.bass === tr.bass && (FAM[dq] === FAM[tr.q] || (tr.q === '5' && ['maj', 'min', 'sus'].includes(FAM[dq])))) fam++; else { const k = b.chord + '→' + lab.ascii; conf[k] = (conf[k] || 0) + 1; }
      if (dd.root === tr.root && dd.bass === tr.bass && dq === tr.q) ex++;
    }
    const pct = x => (x / tot * 100).toFixed(0) + '%';
    console.log(`${name.padEnd(22)} 템포 ${TL.bpm.toFixed(1)}/${spec.bpm}${spec.tempoSeg ? '→' + spec.tempoSeg[1][1] : ''}  비트 ${hits}/${truth.length}${half > 0.9 && hits / truth.length < 0.6 ? ` (2박 층위 ${(half * 100).toFixed(0)}%)` : ''}  엇박 ${off}  ${TL.meter.label}  첫박 ${dh}/${trueDown.length}  코드 정확 ${pct(ex)} 계열 ${pct(fam)} 근음 ${pct(root)}  조성 ${TL.keys.map(k => k.name).join('→')}`);
    const cs = Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (cs.length) console.log('      ', cs.map(([k, v]) => k + ' x' + v).join(', '));
  }
})();
