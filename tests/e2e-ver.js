const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errors = [];
  for (const [file, w] of [['chordity.html', 1180], ['chordity.html', 390], ['information.html', 1180], ['information.html', 390]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: 700 } })).newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', file)).href); await p.waitForTimeout(200);
    const r = await p.evaluate(() => {
      const v = document.querySelector('.brand .ver'), n = v.previousElementSibling, vr = v.getBoundingClientRect(), nr = n.getBoundingClientRect();
      return { text: v.textContent, gap: Math.round(vr.left - nr.right), sameLine: Math.abs((vr.top + vr.bottom) / 2 - (nr.top + nr.bottom) / 2) < 3, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    console.log(`${file} ${w}px:`, JSON.stringify(r));
    if (file === 'chordity.html' && w === 1180) await p.screenshot({ path: 'shot-ver.png', clip: { x: 40, y: 0, width: 420, height: 64 } });
  }
  console.log('errors:', errors.length ? errors : 'none'); await b.close();
})();
