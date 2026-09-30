// 화면 전수: 여러 종류 코드가 섞인 곡(확장 어휘)에서 세 표기의 모든 코드 이름표가 전수 목록의 글자이고 조사가 없는지
const { chromium } = require('playwright'); const U = require(require('path').join(require('os').tmpdir(), 'labels.json'));
const uni = { name: new Set(U.name), camelot: new Set(U.cam), roman: new Set(U.roman) };
(async () => {
  const b = await chromium.launch(); const errors = [];
  const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await p.setInputFiles('#file', { name: '여러 코드.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('varied.wav') });
  await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
  const vocab = await p.evaluate(() => { const s = document.getElementById('selVocab'); s.value = 'extended'; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; });
  await p.waitForTimeout(800);
  console.log('코드 종류 설정:', vocab);
  let total = 0, badAll = [];
  for (const mode of ['name', 'camelot', 'roman']) {
    if (mode !== 'name') await p.click(`#notation [data-not="${mode}"]`);
    const labels = await p.evaluate(() => [...document.querySelectorAll('.bar .chord')].map(c => c.textContent.trim()).filter(t => t && t !== '%'));
    const bad = labels.filter(l => !uni[mode].has(l) && l !== 'N.C.'), josa = labels.filter(l => /(으로|로)$/.test(l));
    total += labels.length; badAll.push(...bad.map(x => mode + ':' + x), ...josa.map(x => mode + ' 조사:' + x));
    console.log(`${mode === 'name' ? '음이름' : mode === 'camelot' ? '카멜롯' : '로마 숫자'}: 코드 이름표 ${labels.length}개 | 목록 밖 ${bad.length ? bad : 0} | 조사 ${josa.length ? josa : 0}\n  나온 종류: ${[...new Set(labels)].join(' ')}`);
  }
  console.log(`합계 ${total}개, 문제 ${badAll.length ? badAll : '0개'} | 오류 ${errors.length ? errors : '없음'}`); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
