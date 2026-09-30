const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  const r1 = await p.$eval('footer.disclaimer', f => Math.round(innerHeight - f.getBoundingClientRect().bottom));
  await p.setInputFiles('#file', { name: 'x.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('test-pop97.wav') });
  await p.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  const r2 = await p.evaluate(() => { const f = document.querySelector('footer.disclaimer'); const last = document.querySelector('.keys'); return { footerAfterContent: f.getBoundingClientRect().top >= last.getBoundingClientRect().bottom, gapToDocEnd: Math.round(document.documentElement.scrollHeight - (f.getBoundingClientRect().bottom + scrollY)), overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  console.log('휴대폰 첫 화면: 안내와 화면 바닥 사이', r1, 'px | 곡을 연 뒤:', JSON.stringify(r2));
  await b.close();
})();
