const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const p = await (await b.newContext({ viewport: { width: 1180, height: 900 }, colorScheme: scheme })).newPage();
    await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
    await p.setInputFiles('#file', { name: '템포 급변.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('tempojump.wav') });
    await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
    for (const i of [0, 12]) {
      await p.$eval(`.bar[data-i="${i}"]`, el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
      const r = await p.$eval(`.bar[data-i="${i}"]`, el => { const q = el.getBoundingClientRect(); return { x: q.left, y: q.top }; });
      await p.screenshot({ path: `pill-${scheme}-${i}.png`, clip: { x: r.x - 40, y: r.y - 14, width: 330, height: 110 } });
    }
  }
  await b.close();
})();
