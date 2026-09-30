// 이름 표시와 이전 저장값 이전 확인
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext()).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('madi-code-prefs-v1', JSON.stringify({ pianoVol: 0.33, clickVol: 0.44, pianoMode: 'bar' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await page.setInputFiles('#file', { name: 'demo.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('test-pop97.wav') });
  await page.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  const r = await page.evaluate(() => ({ title: document.title, brand: document.querySelector('.brand span').textContent, piano: document.querySelector('[data-vol="piano"]').value, click: document.querySelector('[data-vol="click"]').value, mode: document.getElementById('selPianoMode').value }));
  await page.$eval('.vols-wide [data-vol="music"]', el => { el.value = '0.7'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  const saved = await page.evaluate(() => localStorage.getItem('chordity-prefs-v1'));
  console.log(JSON.stringify(r)); console.log('새 키에 저장:', saved ? '예 ' + saved.slice(0, 60) + '…' : '아니오', '| errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
