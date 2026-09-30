// 코드 이름표 전수: 세 표기에서 '로/으로'로 끝나는 코드 이름표가 없는지, 예외 코드(IVsus4, V7/IV, ♭VII, V11)가 제대로 적히는지
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await p.setInputFiles('#file', { name: '예외 코드.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('except.wav') });
  await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
  for (const mode of ['name', 'camelot', 'roman']) {
    if (mode !== 'name') await p.click(`#notation [data-not="${mode}"]`);
    const r = await p.evaluate(() => {
      const chords = [...document.querySelectorAll('.bar .chord')].map(c => c.textContent.trim()).filter(Boolean);
      const labels = [...document.querySelectorAll('.bar .keychg, .bar .tempochg, .bar .ramp .rt')].map(x => x.textContent.trim());
      return { chords, labels };
    });
    const withJosa = r.chords.filter(c => /(으로|로)$/.test(c));
    const uniq = [...new Set(r.chords)];
    console.log(`[3] ${mode === 'name' ? '음이름' : mode === 'camelot' ? '카멜롯' : '로마 숫자'}: 코드 이름표 ${r.chords.length}개(종류 ${uniq.join(' ')}) | 조사로 끝나는 코드 이름표 ${withJosa.length ? withJosa : '0개'} | 이름표 ${r.labels.join(', ')}`);
  }
  console.log('오류', errors.length ? errors : '없음'); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
