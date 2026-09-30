// UI 검증: 밝은/어두운 시스템 × 세 칸 선택 — 명암비(선택 바탕 대 배경, 아이콘 대 바탕), 선택 바탕과 버튼 상자 일치, 아이콘 정중앙
const { chromium } = require('playwright');
const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 320, height: 90 }, deviceScaleFactor: 2 })).newPage();
  await p.goto('file:///tmp/theme-sim.html'); let pass = 0, fail = 0; const shots = [];
  const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
  for (const sys of ['light', 'dark']) for (const m of ['auto', 'light', 'dark']) {
    await p.evaluate(s => window.__sys(s), sys); await p.evaluate(mm => window.__choose(mm), m); await p.waitForTimeout(400);
    const r = await p.evaluate(mm => {
      const cs = e => getComputedStyle(e), seg = document.getElementById('seg'), th = document.getElementById('thumb'), opts = [...seg.querySelectorAll('.opt')];
      const sel = opts.find(o => o.dataset.m === mm), tr = th.getBoundingClientRect(), sr = sel.getBoundingClientRect();
      const centers = opts.map(o => { const br = o.getBoundingClientRect(); let L = 1e9, T = 1e9, R = -1e9, B = -1e9; o.querySelectorAll('svg *').forEach(n => { const q = n.getBoundingClientRect(); L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom); }); return [((L + R) / 2 - (br.left + br.width / 2 + (o.previousElementSibling && o.previousElementSibling.classList.contains('opt') ? parseFloat(cs(o).borderLeftWidth) / 2 : 0))).toFixed(2), ((T + B) / 2 - (br.top + br.height / 2)).toFixed(2)]; });
      const un = opts.find(o => o !== sel);
      return { paper: cs(document.getElementById('pv')).backgroundColor, thumb: cs(th).backgroundColor, selIcon: cs(sel).color, unIcon: cs(un).color,
        dx: Math.abs(tr.left - (sr.left + (sel.previousElementSibling && sel.previousElementSibling.classList.contains('opt') ? parseFloat(cs(sel).borderLeftWidth) : 0))), dw: Math.abs(tr.right - sr.right), dy: Math.abs(tr.top - sr.top), dh: Math.abs(tr.bottom - sr.bottom), centers };
    }, m);
    const c1 = cr(r.thumb, r.paper), c2 = cr(r.selIcon, r.thumb), c3 = cr(r.unIcon, r.paper), off = Math.max(...r.centers.flat().map(v => Math.abs(+v)));
    const tag = `시스템 ${sys === 'light' ? '밝게' : '어둡게'} · ${m === 'auto' ? '시스템' : m === 'light' ? '밝게' : '어둡게'} 선택`;
    ok(c1 >= 3, `${tag}: 선택 바탕 대 배경 ${c1.toFixed(2)}`); ok(c2 >= 3, `${tag}: 선택 아이콘 대 바탕 ${c2.toFixed(2)}`); ok(c3 >= 3, `${tag}: 다른 아이콘 대 배경 ${c3.toFixed(2)}`);
    ok(r.dx <= 0.5 && r.dw <= 0.5 && r.dy <= 0.5 && r.dh <= 0.5, `${tag}: 선택 바탕과 버튼 어긋남 ${r.dx.toFixed(2)}/${r.dw.toFixed(2)}/${r.dy.toFixed(2)}/${r.dh.toFixed(2)}`);
    ok(off <= 0.6, `${tag}: 아이콘 가운데에서 벗어남 최대 ${off.toFixed(2)}px`);
    console.log(`${tag}: 선택 바탕/배경 ${c1.toFixed(2)}:1, 선택 아이콘/바탕 ${c2.toFixed(2)}:1, 다른 아이콘/배경 ${c3.toFixed(2)}:1, 아이콘 중심 오차 최대 ${off.toFixed(2)}px`);
    const f = `${require('os').tmpdir()}/tseg-${sys}-${m}.png`; await p.screenshot({ path: f, clip: await p.$eval('#pv', e => { const q = e.getBoundingClientRect(); return { x: q.right - 150, y: q.top, width: 150, height: q.height }; }) }); shots.push(f);
  }
  console.log(`UI 검증: 통과 ${pass}, 실패 ${fail}`); await b.close();
  require('fs').writeFileSync(require('path').join(require('os').tmpdir(), 'tseg-shots.json'), JSON.stringify(shots));
})().catch(e => { console.error('FAIL', e); process.exit(1); });
