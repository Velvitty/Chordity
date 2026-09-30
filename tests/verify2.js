// 검증 2: 빌드한 앱 화면에서 이름표 글자·자리 확인(곡 7개, 표기 3가지)
const { chromium } = require('playwright');
const CASES = [
  ['pop97.wav', '팝 97', { name: { start: ['C 장조', '4/4'], chg: [] }, tempo: ['97'] }],
  ['modpivot.wav', '전조 C→D', { name: { start: ['C 장조', '4/4'], chg: ['D 장조로'] }, cam: { start: ['8B', '4/4'], chg: ['10B로'] }, roman: { start: ['C 장조', '4/4'], chg: ['D 장조로'] } }],
  ['meterchg.wav', '변박 4/4→3/4→4/4', { name: { start: ['C 장조', '4/4'], chg: ['3/4으로@9', '4/4로@17'] }, tempo: ['110'] }],
  ['waltz44.wav', '왈츠 절→4/4', { name: { start: ['D 장조', '3/4'], chg: ['4/4로@9'] }, tempo: ['120'] }],
  ['tempojump.wav', '템포 급변', { tempo: ['96', '132로@13'] }],
  ['rit.wav', '서서히 느려짐', { tempo: ['72', '63으로@20'] }],
  ['pickup.wav', '못갖춘마디 시작', { firstBarStart: true }],
];
(async () => {
  const b = await chromium.launch(); const errors = []; let pass = 0, fail = 0;
  const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  ✗ ' + msg); } };
  for (const [file, title, exp] of CASES) {
    const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
    p.on('pageerror', e => errors.push(title + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(title + ': ' + m.text()); });
    await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
    await p.setInputFiles('#file', { name: title + '.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync(file) });
    await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
    const read = () => p.evaluate(() => {
      const bars = [...document.querySelectorAll('.bar')];
      const start = [...bars[0].querySelectorAll('.keychg.start')].map(x => x.textContent);
      const chg = bars.map((b2, i) => [...b2.querySelectorAll('.keychg:not(.start)')].map(x => x.textContent + '@' + (i + 1))).flat();
      const tempo = bars.map((b2, i) => [...b2.querySelectorAll('.tempochg')].map(x => x.textContent + (i ? '@' + (i + 1) : ''))).flat();
      let overlap = 0;                                  // 한 마디 안 위쪽 이름표끼리 겹침
      for (const b2 of bars) { const r = [...b2.querySelectorAll('.keychg')].map(x => x.getBoundingClientRect()); for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].right > r[j].left + 0.5 && r[j].right > r[i].left + 0.5 && r[i].bottom > r[j].top && r[j].bottom > r[i].top) overlap++; }
      const b0 = bars[0].getBoundingClientRect(), inFirst = [...bars[0].querySelectorAll('.keychg.start')].every(x => { const q = x.getBoundingClientRect(); return q.left >= b0.left - 1 && q.left < b0.right; });
      return { start, chg, tempo, overlap, inFirst, pickup: bars[0].classList.contains('pickup'), startCount: document.querySelectorAll('.keychg.start').length };
    });
    const cmp = (got, want) => want.every(w => got.some(g => w.includes('@') ? g === w : g.split('@')[0] === w)) && got.length >= want.length;
    const lines = [];
    for (const mode of ['name', 'cam', 'roman']) {
      if (mode !== 'name') await p.click(`#notation [data-not="${mode === 'cam' ? 'camelot' : 'roman'}"]`);
      const r = await read();
      if (mode === 'name') {
        ok(r.startCount === 2 && r.inFirst, `${title}: 시작 이름표는 첫 마디에 2개(조성·박자) — ${r.startCount}개, 첫 마디 안 ${r.inFirst}`);
        ok(r.overlap === 0, `${title}: 위쪽 이름표 겹침 ${r.overlap}`);
        if (exp.tempo) ok(JSON.stringify(r.tempo) === JSON.stringify(exp.tempo), `${title}: 템포 알약 ${r.tempo.join(' ')} (기대 ${exp.tempo.join(' ')})`);
        if (exp.firstBarStart) ok(r.pickup && r.inFirst, `${title}: 못갖춘마디(${r.pickup})에 시작 이름표`);
      }
      const e = exp[mode];
      if (e) {
        ok(JSON.stringify(r.start) === JSON.stringify(e.start), `${title} [${mode}]: 시작 ${r.start.join(', ')} (기대 ${e.start.join(', ')})`);
        ok(cmp(r.chg, e.chg) && r.chg.length === e.chg.length, `${title} [${mode}]: 바뀐 곳 ${r.chg.join(' ') || '없음'} (기대 ${e.chg.join(' ') || '없음'})`);
      }
      lines.push(`${mode === 'name' ? '음이름' : mode === 'cam' ? '카멜롯' : '로마 숫자'}: 시작 [${r.start.join(', ')}] 바뀐 곳 [${r.chg.join(' ') || '-'}]` + (mode === 'name' ? ` 템포 [${r.tempo.join(' ')}]` : ''));
    }
    console.log(`${title} → ${lines.join(' | ')}`);
    if (title === '전조 C→D') { await p.click('#notation [data-not="name"]'); await p.$eval('.bar[data-i="0"]', el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(200); const q = await p.$eval('.bar[data-i="0"]', el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top }; }); await p.screenshot({ path: 'shot-start.png', clip: { x: q.x - 40, y: q.y - 12, width: 560, height: 110 } }); }
    await p.close();
  }
  console.log(`검증 2: 통과 ${pass}, 실패 ${fail} | 오류 ${errors.length ? errors : '없음'}`); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
