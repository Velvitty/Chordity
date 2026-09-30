// 적용 중 표시·되돌리기 동작 확인
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.setInputFiles('#file', { name: 'demo.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('test-pop97.wav') });
  await page.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  await page.click('#adjust > summary');
  const st = async label => {
    const r = await page.evaluate(() => ({ applied: document.getElementById('applied').innerText.replace(/\n/g, ' / '), sum: document.getElementById('appliedSum').textContent, fixBtn: !document.getElementById('resetBtn').disabled, prefBtn: !document.getElementById('resetPrefsBtn').disabled, halfMarks: document.querySelectorAll('.slashes i.off').length }));
    console.log(label.padEnd(18), '|', r.applied, '| 요약:', r.sum || '(없음)', '| 버튼 박보정', r.fixBtn ? '켜짐' : '꺼짐', '설정', r.prefBtn ? '켜짐' : '꺼짐', '| ½박 표시', r.halfMarks);
  };
  await st('처음');
  await page.selectOption('#selVocab', 'extended'); await st('코드 확장');
  await page.selectOption('#selRes', '2'); await page.uncheck('#chkSlash'); await st('½박, 베이스 끔');
  await page.selectOption('#selPianoMode', 'beat'); await page.uncheck('#chkAccent');
  await page.$eval('#rOffset', el => { el.value = '12'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await st('연주·강조·타이밍');
  await page.click('[data-op="half"]'); await st('½박 옮기기');
  await page.click('#resetBtn'); await st('박 보정 되돌리기');
  await page.click('[data-op="d2"]');
  await page.click('#resetPrefsBtn'); await st('설정 기본값으로');
  const ctl = await page.evaluate(() => ({ vocab: document.getElementById('selVocab').value, res: document.getElementById('selRes').value, slash: document.getElementById('chkSlash').checked, mode: document.getElementById('selPianoMode').value, accent: document.getElementById('chkAccent').checked, off: document.getElementById('offTxt').textContent }));
  console.log('컨트롤 상태:', JSON.stringify(ctl));
  const p2 = await ctx.newPage(); await p2.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  console.log('새로 연 페이지의 저장값:', await p2.evaluate(() => { const p = JSON.parse(localStorage.getItem('chordity-prefs-v1')); return JSON.stringify({ vocab: p.vocab, res: p.res, slash: p.slash, pianoMode: p.pianoMode, accent: p.accent, offsetMs: p.offsetMs }); }));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
