// 목차 항목을 누르면 그 항목이 표시되는지(모든 항목)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'information.html')).href); await p.waitForTimeout(300);
  const ids = await p.$$eval('#toc a', as => as.map(a => a.getAttribute('href').slice(1)));
  let ok = 0; const bad = [];
  for (const id of ids) {
    await p.click(`#toc a[href="#${id}"]`); await p.waitForTimeout(120);
    const cur = await p.$eval('#toc a[aria-current="true"]', a => a.getAttribute('href').slice(1)).catch(() => null);
    const top = await p.$eval('#' + id, h => Math.round(h.getBoundingClientRect().top));
    const atEnd = await p.evaluate(() => Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2);
    if (cur === id) ok++; else if (!atEnd) bad.push(`${id}→${cur} (top ${top})`);
    else ok++;   // 페이지 끝이라 더 내려갈 수 없는 마지막 항목들은 표시가 앞 항목에 머무는 것이 정상
  }
  console.log(`목차 ${ids.length}개 중 누른 항목이 표시됨: ${ok}`, bad.length ? bad : '');
  await b.close();
})();
