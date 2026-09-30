const Engine = require('../src/engine.js');
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// ---------- 합성 곡 ----------
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QI = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus4: [0, 5, 7], dim: [0, 3, 6] };
function parseChord(s) {
  const m = /^([A-G])([#b]?)(maj7|m7|m|7|sus4|dim)?(?:\/([A-G])([#b]?))?$/.exec(s);
  if (!m) throw new Error('bad chord ' + s);
  const acc = a => a === '#' ? 1 : a === 'b' ? -1 : 0;
  const root = (NOTE[m[1]] + acc(m[2]) + 12) % 12;
  const q = m[3] || '';
  const bass = m[4] ? (NOTE[m[4]] + acc(m[5]) + 12) % 12 : root;
  return { root, q, pcs: QI[q].map(i => (root + i) % 12), bass };
}
function parseDetected(ascii) {
  if (ascii === 'N.C.') return { root: -1, q: 'N', bass: -1 };
  const m = /^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/.exec(ascii);
  const acc = a => a === '#' ? 1 : a === 'b' ? -1 : 0;
  const root = (NOTE[m[1]] + acc(m[2]) + 12) % 12;
  const bass = m[4] ? (NOTE[m[4]] + acc(m[5]) + 12) % 12 : root;
  return { root, q: m[3], bass };
}

// 코드 이름 이조(♯/♭ 표기 선택)
const TR_S = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'], TR_F = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
function trChord(name, n, flats) {
  if (name === 'N') return name;
  const m = /^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/.exec(name);
  const acc = a => a === '#' ? 1 : a === 'b' ? -1 : 0, tb = flats ? TR_F : TR_S;
  const r = tb[((NOTE[m[1]] + acc(m[2]) + n) % 12 + 12) % 12];
  return r + m[3] + (m[4] ? '/' + tb[((NOTE[m[4]] + acc(m[5]) + n) % 12 + 12) % 12] : '');
}
const trBars = (bars, n, flats) => bars.map(bar => bar.map(([c, k]) => [trChord(c, n, flats), k]));

function render(spec) {
  const sr = 48000, R = rng(spec.seed || 7);
  const beatSec = 60 / spec.bpm;
  const sub = spec.sub || 2;
  const beats = [];               // {t, pos, chord, bar}
  let t = spec.lead || 1.2;
  const totalBeats = spec.bars.reduce((a, bar) => a + bar.reduce((x, c) => x + c[1], 0), 0);
  const tempoAt = i => {
    let p = spec.drift ? beatSec * (1 + spec.drift * Math.sin(i / 40)) : beatSec;
    if (spec.rit) p *= 1 + (spec.rit - 1) * Math.max(0, (i - totalBeats / 2) / (totalBeats / 2));   // 후반부 점점 느려짐
    return p;
  };
  let bi = 0;
  spec.bars.forEach((bar, barIdx) => {
    let pos = spec.pickupBar && barIdx === 0 ? spec.meter - bar.reduce((a, c) => a + c[1], 0) : 0;
    for (const [ch, nb] of bar) for (let k = 0; k < nb; k++) { beats.push({ t, pos, chord: ch, bar: barIdx }); t += tempoAt(bi++); pos++; }
  });
  const total = t + 2.5;
  const y = new Float32Array(Math.ceil(total * sr));
  const tune = Math.pow(2, (spec.cents || 0) / 1200);
  const hz = m => 440 * Math.pow(2, (m - 69) / 12) * tune;
  const add = (t0, fn, dur) => { const i0 = Math.round(t0 * sr), n = Math.round(dur * sr); for (let i = 0; i < n && i0 + i < y.length; i++) y[i0 + i] += fn(i / sr); };
  let hpPrev = 0;
  const kick = t0 => { let ph = 0; add(t0, tt => { const f = 48 + 90 * Math.exp(-tt / 0.03); ph += 2 * Math.PI * f / sr; return 0.9 * Math.sin(ph) * Math.exp(-tt / 0.14); }, 0.35); };
  const snare = t0 => add(t0, tt => { const nz = R() * 2 - 1; const h = nz - hpPrev; hpPrev = nz; return (0.32 * h * Math.exp(-tt / 0.1) + 0.25 * Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt / 0.05)); }, 0.3);
  const hat = (t0, amp, dec) => add(t0, tt => { const nz = R() * 2 - 1; const h = nz - hpPrev; hpPrev = nz; return amp * h * Math.exp(-tt / dec); }, dec * 5);
  const tone = (t0, dur, midi, amp, nh, dec, pw) => {
    const f = hz(midi);
    add(t0, tt => {
      let v = 0;
      for (let h = 1; h <= nh; h++) { if (f * h > 20000) break; v += Math.sin(2 * Math.PI * f * h * tt) / Math.pow(h, pw); }
      const env = Math.min(1, tt / 0.004) * Math.exp(-tt / dec) * (tt > dur ? Math.exp(-(tt - dur) / 0.04) : 1);
      return amp * v * env;
    }, dur + 0.25);
  };
  const voicing = pcs => pcs.map(pc => { let m = 55 + ((pc - 55 % 12 + 24) % 12); return m; }).sort((a, b) => a - b);
  // 연주
  const style = spec.style || 'pop';
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i], bt = b.t, nxt = i + 1 < beats.length ? beats[i + 1].t : bt + beatSec;
    const bd = nxt - bt, c = parseChord(b.chord === 'N' ? 'C' : b.chord);
    const silentHarm = b.chord === 'N';
    const m = spec.meter;
    // 드럼
    if (style === 'pop') {
      if (b.pos % m === 0 || (m === 4 && b.pos % m === 2)) kick(bt);
      if (m === 4 && (b.pos % 2 === 1)) snare(bt);
      if (m === 3 && b.pos % 3 !== 0) hat(bt, 0.12, 0.05);
      for (let s = 0; s < sub; s++) hat(bt + bd * s / sub, s === 0 ? 0.05 : (spec.hardOffHat ? 0.22 : 0.1), s === 0 ? 0.025 : 0.08);
    } else if (style === 'ballad') {
      if (b.pos % m === 0) kick(bt);
      if (m === 4 && b.pos % m === 2) snare(bt);
      if (m === 2 && b.pos % 2 === 1) snare(bt);
      for (let s = 0; s < sub; s++) hat(bt + bd * s / sub, 0.04, 0.03);
    } else if (style === 'reggae') {
      if (b.pos % m === 2) { kick(bt); snare(bt); }
      for (let s = 0; s < 2; s++) hat(bt + bd * s / 2, 0.05, 0.03);
    } else if (style === 'rockweak') {        // 킥 1·3, 약한 스네어 2·4, 8분 하이햇
      if (b.pos % 2 === 0) kick(bt);
      if (b.pos % 2 === 1) add(bt, (() => { return tt => 0.3 * (R() * 2 - 1) * Math.exp(-tt / 0.05); })(), 0.2);
      for (let s = 0; s < 2; s++) hat(bt + bd * s / 2, 0.08, 0.03);
    } else if (style === 'dance') {           // 4-on-the-floor, 2·4 클랩, 엇박 오픈햇
      kick(bt);
      if (b.pos % 2 === 1) snare(bt);
      hat(bt + bd / 2, 0.25, 0.1);
    } else if (style === 'hiphop') {          // 16분 하이햇, 싱코페이션 킥
      if (b.pos % 4 === 0) kick(bt);
      if (b.pos % 4 === 2) kick(bt + bd * 0.5);
      if (b.pos % 4 === 1) kick(bt + bd * 0.75);
      if (b.pos % 2 === 1) snare(bt);
      for (let s = 0; s < 4; s++) hat(bt + bd * s / 4, 0.05, 0.02);
    } else if (style === 'punk') {            // 빠른 8비트: 킥/스네어 교대
      if (b.pos % 2 === 0) kick(bt); else snare(bt);
      hat(bt, 0.08, 0.03); hat(bt + bd / 2, 0.08, 0.03);
    }
    // 베이스
    if (!silentHarm) {
    const bm = 36 + ((c.bass - 36 % 12 + 12) % 12);
    if (style === 'reggae' || style === 'piano') { if (b.pos % 2 === 0) tone(bt, bd * 1.8, bm, 0.3, 6, 0.5, 1.2); }
    else tone(bt, bd * 0.95, bm, 0.3, 6, 0.7, 1.2);
    // 화성 악기
    const vc = voicing(c.pcs);
    if (style === 'pop') {
      for (const nm of vc) tone(bt, bd * 0.9, nm, 0.1, 10, 0.9, 1.0);
    } else if (style === 'ballad') {
      const arp = vc.concat(vc.map(v => v + 12));
      for (let s = 0; s < sub; s++) tone(bt + bd * s / sub, bd / sub * 1.8, arp[(b.pos * sub + s) % arp.length], 0.13, 10, 0.6, 1.0);
    } else if (style === 'reggae') {
      for (const nm of vc) tone(bt + bd / 2, bd * 0.35, nm, 0.14, 10, 0.3, 1.0);   // 엇박 스캥크
    } else if (style === 'piano') {
      const arp = vc.concat(vc.map(v => v + 12));
      for (let s = 0; s < sub; s++) tone(bt + bd * s / sub, bd / sub * 1.8, arp[(b.pos * sub + s) % arp.length], 0.13, 10, 0.6, 1.0);
    } else {
      for (const nm of vc) tone(bt, bd * 0.9, nm, 0.09, 10, 0.9, 1.0);
      if (style === 'punk') for (const nm of vc) tone(bt + bd / 2, bd * 0.4, nm, 0.07, 10, 0.4, 1.0);
    }
    // 멜로디 (코드음 + 가끔 비화성음)
    if (spec.melody) {
      const pc = R() < 0.8 ? c.pcs[Math.floor(R() * c.pcs.length)] : Math.floor(R() * 12);
      tone(bt, bd * 0.95, 67 + ((pc - 67 % 12 + 12) % 12), 0.08, 3, 1.5, 1.5);
    }
    }
  }
  for (let i = 0; i < y.length; i++) y[i] += (R() * 2 - 1) * 0.002;
  return { sr, y, beats, total };
}

const POP = [
  [['C', 4]], [['G', 4]], [['Am', 4]], [['F', 4]],
  [['C', 2], ['G/B', 2]], [['Am', 2], ['Em', 2]], [['F', 4]], [['G7', 4]],
  [['Cmaj7', 4]], [['Dm7', 4]], [['Esus4', 2], ['E', 2]], [['Am', 4]],
  [['F', 2], ['G', 2]], [['Em', 2], ['Am', 2]], [['Dm7', 2], ['G7', 2]], [['C', 4]],
  [['C', 4]], [['G', 4]], [['Am', 4]], [['F', 3], ['G', 1]],
  [['C', 4]], [['G', 4]], [['Am', 4]], [['F', 4]],
];
const WALTZ = [
  [['D', 3]], [['A', 3]], [['Bm', 3]], [['G', 3]], [['D', 3]], [['Em', 3]], [['A7', 3]], [['D', 3]],
  [['G', 3]], [['A', 3]], [['F#m', 3]], [['Bm', 3]], [['Em', 3]], [['A7', 3]], [['D', 3]], [['D', 3]],
];
const BALLAD128 = [
  [['Eb', 4]], [['Bb/D', 4]], [['Cm', 4]], [['Ab', 4]], [['Eb', 2], ['Bb', 2]], [['Cm7', 4]], [['Ab', 2], ['Bb', 2]], [['Eb', 4]],
  [['Eb', 4]], [['Bb', 4]], [['Cm', 4]], [['Ab', 4]],
];
const REGGAE = [
  [['Am', 4]], [['Dm', 4]], [['G', 4]], [['C', 4]], [['Am', 4]], [['Dm', 4]], [['E7', 4]], [['Am', 4]],
  [['Am', 4]], [['Dm', 4]], [['G', 4]], [['C', 4]],
];


function cases() {
  return [
    ['pop 97', { bpm: 97, meter: 4, bars: POP, cents: 18, hardOffHat: true, melody: true, seed: 3 }],
    ['pop 128', { bpm: 128, meter: 4, bars: POP, melody: true, seed: 5 }],
    ['waltz 150', { bpm: 150, meter: 3, bars: WALTZ, melody: true, seed: 9 }],
    ['ballad 12/8 58', { bpm: 58, meter: 4, sub: 3, style: 'ballad', bars: BALLAD128, melody: true, seed: 11 }],
    ['ballad 4/4 68 drift', { bpm: 68, meter: 4, sub: 2, style: 'ballad', bars: POP.slice(0, 16), melody: true, drift: 0.02, seed: 13 }],
    ['reggae 76', { bpm: 76, meter: 4, style: 'reggae', bars: REGGAE, seed: 17 }],
    ['rock weak-snare 118', { bpm: 118, meter: 4, style: 'rockweak', bars: POP, melody: true, seed: 19 }],
    ['dance 124', { bpm: 124, meter: 4, style: 'dance', bars: POP, melody: true, seed: 23 }],
    ['hiphop 88', { bpm: 88, meter: 4, style: 'hiphop', bars: POP.slice(0, 16), melody: true, seed: 29 }],
    ['punk 176', { bpm: 176, meter: 4, style: 'punk', bars: POP, seed: 31 }],
    ['solo piano 72', { bpm: 72, meter: 4, sub: 2, style: 'piano', bars: POP.slice(0, 16), melody: true, seed: 37 }],
    ['solo piano 3/4 84', { bpm: 84, meter: 3, sub: 2, style: 'piano', bars: WALTZ, melody: true, seed: 41 }],
    ['ballad rit 72→63', { bpm: 72, meter: 4, sub: 2, style: 'ballad', bars: POP.slice(0, 20), melody: true, rit: 1.15, seed: 47 }],
    ['mod pivot C→D 110', { bpm: 110, meter: 4, bars: POP.slice(0, 16).concat([[['A7', 4]]], trBars(POP.slice(0, 12), 2, false)), melody: true, seed: 53, keys: [[0, 'C 장조'], [17, 'D 장조']] }],
    ['mod ballad Eb→E 70', { bpm: 70, meter: 4, sub: 2, style: 'ballad', bars: trBars(POP.slice(0, 16), 3, true).concat([[['B7', 4]]], trBars(POP.slice(0, 12), 4, false)), melody: true, seed: 59, keys: [[0, 'E♭ 장조'], [17, 'E 장조']] }],
    ['mod direct G→Ab 100', { bpm: 100, meter: 4, bars: trBars(POP.slice(0, 16), 7, false).concat(trBars(POP.slice(0, 12), 8, true)), melody: true, seed: 61, keys: [[0, 'G 장조'], [16, 'A♭ 장조']] }],
    ['relative Am→C (전조 아님)', { bpm: 96, meter: 4, bars: [[['Am', 4]], [['Dm', 4]], [['E7', 4]], [['Am', 4]], [['Am', 4]], [['Dm', 4]], [['E7', 4]], [['Am', 4]]].concat(POP.slice(0, 8)), melody: true, seed: 67, keys: [[0, '?']] }],
    ['drum intro + pickup 104', { bpm: 104, meter: 4, pickupBar: true, bars: [[['N', 1]], [['N', 4]], [['N', 4]]].concat(POP.slice(0, 12)), melody: true, seed: 43 }],
  ];
}
module.exports = { trBars, trChord, render, parseChord, parseDetected, cases, POP, WALTZ, BALLAD128, REGGAE, rng };
