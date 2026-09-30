const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const w of [1180, 390]) {
    const p = await (await b.newContext({ viewport: { width: w, height: 844 } })).newPage();
    await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
    const r = await p.$eval('footer.disclaimer a', a => ({ text: a.textContent.trim(), lines: Math.round(a.getBoundingClientRect().height / 18.75), gap: Math.round(innerHeight - a.closest('footer').getBoundingClientRect().bottom), href: a.getAttribute('href') }));
    console.log(`폭 ${w}px:`, JSON.stringify(r));
  }
  await b.close();
})();
