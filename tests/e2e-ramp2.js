// 1.8.0: 슬래시 아래 틀·알약, 재생 위치까지 채움, 도착 뒤 0.8초 옅어짐, 도착 알약 한 박 × 1.1 + 0.06초
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errors = [];
  const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await p.setInputFiles('#file', { name: '느려지는 발라드.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('rit.wav') });
  await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
  await p.click('.bar[data-i="15"]'); await p.waitForTimeout(300);
  const st = await p.evaluate(() => {
    const bars = [...document.querySelectorAll('.bar')];
    const fills = bars.map((b2, i) => { const f = b2.querySelector('.ramp .rf'); return f ? (i + 1) + ':' + Math.round(parseFloat(f.style.width || '0')) + '%' : null; }).filter(Boolean).join(' ');
    let overlap = 0;
    for (const b2 of bars) { const sl = b2.querySelector('.slashes'); if (!sl) continue; const sb = sl.getBoundingClientRect().bottom; for (const x of b2.querySelectorAll('.ramp, .tempochg')) if (x.getBoundingClientRect().top < sb - 0.5) overlap++; }
    return { fills, overlap, text: document.querySelector('.ramp .rt').textContent, pills: [...document.querySelectorAll('.tempochg')].map(x => x.textContent).join(',') };
  });
  console.log(`16마디에 멈춤 → 채움 ${st.fills}\n틀 글자 ${st.text} | 알약 ${st.pills} | 슬래시 줄과 겹침 ${st.overlap}개`);
  await p.$eval('.bar[data-i="12"]', el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
  const y = await p.$eval('.bar[data-i="8"]', el => el.getBoundingClientRect().top);
  await p.screenshot({ path: 'shot-ramp2.png', clip: { x: 40, y: Math.max(0, y - 10), width: 1100, height: 300 } });
  // 도착 박 앞(20마디)에서 재생하며 화면마다 기록
  await p.click('.bar[data-i="19"]'); await p.waitForTimeout(200);
  await p.evaluate(() => {
    window.__log = []; const pill = [...document.querySelectorAll('.tempochg')].find(x => x.textContent === '63');
    const parts = [...document.querySelectorAll('.ramp .rf')], last = parts[parts.length - 1];
    const t0 = performance.now();
    const f = () => { window.__log.push([performance.now() - t0, pill.classList.contains('lit') ? 1 : 0, parseFloat(last.style.opacity || '1'), parseFloat(last.style.width || '0'), document.querySelector('.ramp .rt').textContent]); if (performance.now() - t0 < 6500) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await p.keyboard.press('Space');
  await p.waitForTimeout(6800);
  const log = await p.evaluate(() => window.__log);
  const on = log.findIndex(r => r[1] === 1), off = on >= 0 ? log.findIndex((r, k) => k > on && r[1] === 0) : -1;
  if (on < 0) { console.log('도착 알약이 켜지지 않음'); } else {
    const tOn = log[on][0], dur = off > 0 ? (log[off][0] - tOn) / 1000 : null;
    const opAt = s => { const r = log.find(q => q[0] >= tOn + s * 1000); return r ? r[2].toFixed(2) + '(너비 ' + Math.round(r[3]) + '%)' : '-'; };
    console.log(`도착 알약 켜짐 ${dur != null ? dur.toFixed(3) + '초' : '(끝까지 켜짐)'} (예상 약 ${(0.952 * 1.1 + 0.06).toFixed(3)}초, 화면 한 장면 0.017초 오차)`);
    console.log(`틀 채움 투명도: 도착 직전 ${log[Math.max(0, on - 1)][2].toFixed(2)}(너비 ${Math.round(log[Math.max(0, on - 1)][3])}%) → 0.2초 ${opAt(0.2)} → 0.4초 ${opAt(0.4)} → 0.8초 ${opAt(0.8)} | 도착 전 글자 ${log[Math.max(0, on - 1)][4]} → 도착 뒤 ${log[Math.min(log.length - 1, on + 2)][4]}`);
  }
  console.log('errors:', errors.length ? errors : 'none'); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
