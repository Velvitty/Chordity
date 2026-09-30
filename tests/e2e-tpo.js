// 1.8.3: 재생 막대의 템포가 스크롤해도 보이고, 재생 위치에 따라 위쪽 템포 칸과 같은 값으로 바뀌는지(데스크톱·모바일)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errors = []; let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
  for (const [w, h, label] of [[1180, 900, '데스크톱'], [390, 844, '모바일']]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 })).newPage();
    p.on('pageerror', e => errors.push(label + ': ' + e.message));
    await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
    await p.setInputFiles('#file', { name: 'r.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('rit.wav') });
    await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
    await p.evaluate(() => window.scrollTo(0, 1400)); await p.waitForTimeout(250);
    const vis = () => p.evaluate(() => { const r = document.getElementById('tBpm').getBoundingClientRect(); return { inView: r.top >= 0 && r.bottom <= innerHeight && r.width > 0 && r.right <= innerWidth, top: Math.round(r.top), scrollY: Math.round(scrollY), overflow: document.documentElement.scrollWidth - innerWidth }; });
    let v = await vis(); const t0 = await p.textContent('#tBpm');
    ok(v.inView && v.scrollY > 100, `${label}: 스크롤(${v.scrollY}px) 뒤 재생 막대 템포 보임 ${v.inView}(위 ${v.top}px)`);
    ok(t0 === '72', `${label}: 처음 값 ${t0}`);
    ok(v.overflow <= 0, `${label}: 가로 넘침 ${v.overflow}px`);
    const seq = [];
    for (const [bar, want] of [[16, '67'], [19, '64'], [6, '72']]) {
      await p.click(`.bar[data-i="${bar - 1}"]`); await p.waitForTimeout(300);
      const [tb, fb] = [await p.textContent('#tBpm'), await p.textContent('#fBpm')]; v = await vis();
      seq.push(`${bar}마디 ${tb}`);
      ok(tb === want && fb === want && v.inView, `${label}: ${bar}마디 → 재생 막대 ${tb}, 위쪽 칸 ${fb}(기대 ${want}), 보임 ${v.inView}`);
    }
    console.log(`${label}: 처음 ${t0} → ${seq.join(', ')} | 스크롤 중 보임, 가로 넘침 ${v.overflow}px`);
    await p.evaluate(() => window.scrollTo(0, 1400)); await p.waitForTimeout(200);
    await p.screenshot({ path: `tpo-${w}.png`, clip: { x: 0, y: 0, width: w, height: w < 500 ? 130 : 110 } });
    await p.close();
  }
  const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await p.setInputFiles('#file', { name: 'b.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('ballad128.wav') });
  await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
  const lab = await p.textContent('#tBpmLab'), val = await p.textContent('#tBpm'), met = await p.textContent('#fMeter');
  ok(lab === '템포(점4분)', `겹박자 곡: 이름 ${lab}`);
  console.log(`겹박자 곡(${met}): ${lab} ${val}`);
  console.log(`통과 ${pass}, 실패 ${fail} | 오류 ${errors.length ? errors : '없음'}`); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
