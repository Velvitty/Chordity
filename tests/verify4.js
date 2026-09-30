// 코드 이름표 전수: 모든 코드 상태 × 24개 조 × 로마 숫자 문맥, 세 표기(음이름·카멜롯·로마 숫자)
const E = require('../src/engine.js'), I = E._, fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'ui.js'), 'utf8');
const roOfSrc = src.match(/const roOf = n => [^\n]+/)[0], josaSrc = src.match(/function josaRo\(label, kind\) \{[\s\S]*?\n  \}/)[0];
const josaRo = new Function(roOfSrc + '\n' + josaSrc + '\nreturn josaRo;')();
const esrc = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'engine.js'), 'utf8');
const lit = name => { const m = esrc.match(new RegExp('\\b' + name + ' = (\\{[^}]*\\}|\\[[^\\]]*\\])')); if (!m) throw new Error('못 찾음 ' + name); return Object.values(eval('(' + m[1] + ')')); };
const QUALS = new Set(['', ...lit('RN_QUAL')]), FIGS = new Set(['', ...lit('RN_FIG3'), ...lit('RN_FIG7')]);
console.log('허용 목록: 성질 기호 [' + [...QUALS].join(' ') + '] 자리바꿈 숫자 [' + [...FIGS].join(' ') + ']');
const NUM = /^[♭♯]?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i|N)$/;
const CAM = /^(1[0-2]|[1-9])[AB](|5|11|7|maj7|sus4|sus2|dim|aug|7♭5|dim7)$/;
const states = I.getStates('extended', true).filter(s => s && s.root >= 0);
const keys = []; for (let t = 0; t < 12; t++) for (const mode of ['major', 'minor']) keys.push({ tonic: t, mode });
const triads = states.filter(s => (s.q === 'maj' || s.q === 'min') && s.bass === s.root);
const all = { name: new Set(), cam: new Set(), roman: new Set() }, bad = [];
let nName = 0, nCam = 0, nRoman = 0;
const check = (kind, label, why) => {
  if (!label || /undefined|NaN|null/.test(label)) bad.push(kind + ' 깨짐: ' + label + ' ' + why);
  if (/(으로|로)$/.test(label)) bad.push(kind + ' 조사: ' + label + ' ' + why);
  all[kind].add(label);
};
for (const key of keys) {
  const names = I.spelling(key.tonic, key.mode) || I.spelling(key);
  for (const st of states) {
    for (const wb of [true, false]) {
      const f = I.formatChord(st, names, wb); nName++; nCam++;
      if (f.text !== f.root + f.base + f.ext + (f.bass ? '/' + f.bass : '') || !names.includes(f.root)) bad.push('음이름 조립: ' + f.text);
      check('name', f.text, JSON.stringify(st));
      if (!CAM.test(f.cam.text)) bad.push('카멜롯 형식: ' + f.cam.text + ' ' + st.q);
      check('cam', f.cam.text, st.q);
    }
    const ctx = [[null, null]];
    for (const nx of triads) { ctx.push([nx, key]); ctx.push([nx, { tonic: nx.root, mode: nx.q === 'min' ? 'minor' : 'major' }]); }
    for (const [nx, nk] of ctx) for (const inv of [0, st.inv || 0]) {
      const r = I.romanOf(st, key, inv, nx, nk); nRoman++;
      const ok = NUM.test(r.acc + r.num) && QUALS.has(r.qual) && FIGS.has(r.fig) && ['', 'sus4', 'sus2', '5', '11'].includes(r.sus) && (r.sec === '' || NUM.test(r.sec))
        && r.text === r.acc + r.num + r.qual + r.fig + r.sus + (r.sec ? '/' + r.sec : '');
      if (!ok) bad.push('로마 숫자 형식: ' + r.text + ' (' + st.q + ')');
      check('roman', r.text, st.q);
      const sp = I.spellChord(st, r, key, nk), fn = I.formatChord(st, names, true, sp);   // 기능에 맞춘 철자의 음이름
      if (!/^[A-G][♯♭]?$/.test(fn.root) || (fn.bass && !/^[A-G][♯♭]?$/.test(fn.bass))) bad.push('철자 형식: ' + fn.text);
      check('name', fn.text, 'spelled ' + st.q);
    }
  }
}
// 조사 함수에 코드 이름표를 (잘못) 넣었을 때: 종류가 맞지 않으면 조사 없음. 카멜롯 3화음(예: 8B)만 카멜롯 형식과 같아 '로'
const leak = {}; for (const k of ['tempo', 'meter', 'camelot', 'key']) leak[k] = [...all.name, ...all.cam, ...all.roman].filter(l => josaRo(l, k) !== '');
console.log(`상태 ${states.length}개 × 조 24개 | 만든 이름표: 음이름 ${nName}, 카멜롯 ${nCam}, 로마 숫자 ${nRoman} (서로 다른 글자 ${all.name.size} / ${all.cam.size} / ${all.roman.size}종)`);
console.log(`조사로 끝나거나 깨지거나 형식이 틀린 이름표: ${bad.length ? bad.slice(0, 12).join(' | ') : '0개'}`);
console.log(`조사 함수에 넣으면 조사가 붙는 코드 이름표: 템포 ${leak.tempo.length}, 박자 ${leak.meter.length}, 조 이름 ${leak.key.length}, 카멜롯 ${leak.camelot.length}개(${[...new Set(leak.camelot)].slice(0, 6).join(' ')} …: 카멜롯 3화음은 조 코드와 글자가 같음)`);
const sample = (set, re) => [...set].filter(x => re.test(x)).slice(0, 14).join(' ');
console.log('예외 종류 예(로마 숫자):', sample(all.roman, /sus|5$|11|ø|°|\+|\/|6|4|2/));
console.log('예외 종류 예(카멜롯):', sample(all.cam, /sus|5$|11|dim|aug|♭5|maj7/));

fs.writeFileSync(require('path').join(require('os').tmpdir(), 'labels.json'), JSON.stringify({ name: [...all.name], cam: [...all.cam], roman: [...all.roman] }));
