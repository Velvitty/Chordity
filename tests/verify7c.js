// 그리기 위치: 모든 코드 이름의 왼쪽 끝이 그 박의 슬래시 자리(슬래시는 5px 오른쪽으로 그려짐)와 같은 거리에 있는지
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const out = [];
  for (const [f, name] of [['pop97.wav', '팝 97'], ['pickup.wav', '못갖춘마디'], ['meterchg.wav', '변박'], ['rit.wav', '느려짐(틀)'], ['varied.wav', '여러 코드'], ['waltz44.wav', '왈츠→4/4']]) {
    for (const w of [1180, 390]) {
      const p = await (await b.newContext({ viewport: { width: w, height: 900 } })).newPage();
      await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
      await p.setInputFiles('#file', { name: name + '.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync(f) });
      await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
      const r = await p.evaluate(() => {
        const res = { n: 0, off: [], dx: {} };
        document.querySelectorAll('.bar').forEach((bar, bi) => {
          const lane = bar.querySelector('.lane'), sl = bar.querySelector('.slashes'); if (!lane || !sl) return;
          const marks = [...sl.querySelectorAll('i:not(.off)')], lr = lane.getBoundingClientRect(), sr = sl.getBoundingClientRect();
          bar.querySelectorAll('.chord').forEach(c => {
            const pct = parseFloat(c.style.left), k = Math.round(pct / 100 * 1000) / 1000;
            // 코드가 놓인 비율과 같은 비율의 슬래시 찾기
            const m = marks.find(x => Math.abs(parseFloat(x.style.left) - pct) < 0.01);
            if (!m) return;
            res.n++;
            const dx = (m.getBoundingClientRect().left - sr.left) - (c.getBoundingClientRect().left - lr.left);
            const key = dx.toFixed(1); res.dx[key] = (res.dx[key] || 0) + 1;
            if (Math.abs(lr.left - sr.left) > 0.5 || Math.abs(lr.width - sr.width) > 0.5) res.off.push((bi + 1) + '마디 칸 폭 다름');
          });
        });
        return res;
      });
      out.push(`${name} ${w}px: 코드 ${r.n}개, 슬래시와의 거리 종류 ${JSON.stringify(r.dx)}, 칸 어긋남 ${r.off.length}`);
      await p.close();
    }
  }
  console.log(out.join('\n')); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
