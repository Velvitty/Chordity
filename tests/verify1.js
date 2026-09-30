// 검증 1: 앱의 조사 함수(ui.js에서 그대로 추출)를 독립 판정기(한국어로 읽고 끝 글자 받침 확인)와 전수 대조
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'ui.js'), 'utf8');
const pick = re => { const m = src.match(re); if (!m) throw new Error('추출 실패 ' + re); return m[0]; };
const roOfSrc = pick(/const roOf = n => [^\n]+/), josaSrc = pick(/function josaRo\(label, kind\) \{[\s\S]*?\n  \}/);
const app = new Function(roOfSrc + '\n' + josaSrc + '\nreturn josaRo;')();
// 독립 판정기
const D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const readNum = n => { let s = ''; for (const [u, nm] of [[1000, '천'], [100, '백'], [10, '십']]) { const d = Math.floor(n / u) % 10; if (d) s += (d === 1 ? '' : D[d]) + nm; } return s + D[n % 10]; };
const LETTER = { A: '에이', B: '비', C: '씨', D: '디', E: '이', F: '에프', G: '지', H: '에이치', L: '엘', M: '엠', N: '엔', R: '알' };
const byBatchim = word => { const c = word.charCodeAt(word.length - 1) - 0xAC00, j = c % 28; return j === 0 || j === 8 ? '로' : '으로'; };
const truthOf = label => {
  let m = label.match(/^(\d+)\/(\d+)$/);
  if (m) return byBatchim(readNum(+m[2]) + '분의 ' + readNum(+m[1]));   // "4분의 3" — 분자가 끝소리
  if (/^\d+$/.test(label)) return byBatchim(readNum(+label));
  if (/[A-Z]$/.test(label)) return byBatchim(LETTER[label.slice(-1)]);
  return byBatchim(label.replace(/\s+$/, ''));
};
const cases = [];
for (let n = 1; n <= 400; n++) cases.push([String(n), 'tempo']);                               // 템포
for (let a = 1; a <= 16; a++) for (const b of [2, 4, 8, 16]) cases.push([a + '/' + b, 'meter']); // 박자
const roots = ['C', 'C♯', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
for (const r of roots) for (const q of ['장조', '단조']) cases.push([r + ' ' + q, 'key']);     // 조 이름(음이름)
for (let n = 1; n <= 12; n++) for (const x of ['A', 'B']) cases.push([n + x, 'camelot']);          // 카멜롯
let bad = [];
for (const [c, kind] of cases) { const a = app(c, kind), t = truthOf(c); if (a !== t) bad.push(c + ': 앱 ' + a + ' / 정답 ' + t); }
// 규칙이 없는 이름표(코드 이름)와 종류가 맞지 않는 값은 조사 없이
const none = [['Cm7', 'chord'], ['F♯', 'chord'], ['G7', 'chord'], ['Bbmaj7', 'chord'], ['Cm', 'key'], ['3/4', 'tempo'], ['X9', 'camelot']].filter(([c, k]) => app(c, k) !== '');
const show = ['55', '63', '72', '97', '100', '120', '132', '3/4', '4/4', '5/4', '6/8', '7/4', '12/8', 'D 장조', 'A 단조', '10B', '8A'];
console.log('대조한 이름표', cases.length + '개 | 어긋남', bad.length ? bad.slice(0, 10) : '0개', '| 규칙 없는 이름표에 조사 붙음', none.length ? none : '0개');
const kindOf = x => /\//.test(x) ? 'meter' : /^\d+$/.test(x) ? 'tempo' : /[AB]$/.test(x) ? 'camelot' : 'key';
console.log('예:', show.map(x => x + app(x, kindOf(x))).join('  '));
