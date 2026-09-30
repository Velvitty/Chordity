// 설정 격자 탐색: 목표 = 0.6 슬라이더에서 첫 1초 RMS −15.5 dBFS, 20 dB 감쇠 시간 1.3~1.5배, 최대 볼륨에서 전 피크 ≤ −1.5 dBFS
const { chromium } = require('playwright');
const fs = require('fs');
function extract(src, head) { const i = src.indexOf(head); let k = src.indexOf('{', i), d = 0; for (let j = k; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) { let e = j + 1; if (src[e] === ';') e++; return src.slice(i, e); } } } }
const lib = f => { const s = fs.readFileSync(f, 'utf-8'); return ['const PIANO', 'function synthPiano(m)', 'function makeRoomIR()', 'function buildPianoChain(out)'].map(h => extract(s, h)).filter(Boolean).join('\n'); };
const OLD = lib('ui_old.js'), NEW = lib('../src/ui.js');
const cfgs = [];
for (const prompt of [0.68, 0.64, 0.6, 0.56]) for (const tauMax of [7.5, 8.5, 9.5]) for (const promptRatio of [0.12, 0.15])
  cfgs.push({ phaseRand: true, prompt, tauMax, tauMin: 0.9 * tauMax / 7.5, promptRatio, lenMax: 5.6, lenMin: 2.6, release: 0.07, comp: null });
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto('about:blank');
  const res = await page.evaluate(async ({ OLD, NEW, cfgs }) => {
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    async function render(code, cfg, notes) {
      const sr = 48000, ctx = new OfflineAudioContext(2, sr * 7, sr);
      const L = new Function('ctx', 'clamp', 'pianoTune', code + '\nreturn { synthPiano, makeRoomIR, PIANO: typeof PIANO !== "undefined" ? PIANO : null, buildPianoChain: typeof buildPianoChain !== "undefined" ? buildPianoChain : null };')(ctx, clamp, 0);
      const pg = ctx.createGain(); pg.gain.value = 0.6; pg.connect(ctx.destination);
      let bus;
      if (cfg) { Object.assign(L.PIANO, cfg, { makeup: 1 }); bus = L.buildPianoChain(pg); }
      else { bus = ctx.createGain(); bus.connect(pg); const cv = ctx.createConvolver(), w = ctx.createGain(); cv.buffer = L.makeRoomIR(); w.gain.value = 0.22; bus.connect(cv); cv.connect(w); w.connect(pg); }
      notes.forEach((m, i) => { const b = L.synthPiano(m), src = ctx.createBufferSource(); src.buffer = b; const g = ctx.createGain(); g.gain.value = i === 0 ? 0.62 : 0.5 * Math.sqrt(3 / (notes.length - 1)); const p = ctx.createStereoPanner(); p.pan.value = clamp((m - 60) / 36, -0.5, 0.5); src.connect(g); g.connect(p); p.connect(bus); src.start(0.1); });
      const buf = await ctx.startRendering(), a = buf.getChannelData(0), c = buf.getChannelData(1), W = 2400;
      let pk = 0; for (let i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i]), Math.abs(c[i]));
      const env = []; for (let i = 0; i + W <= a.length; i += W) { let e = 0; for (let j = i; j < i + W; j++) e += a[j] * a[j] + c[j] * c[j]; env.push(10 * Math.log10(e / (2 * W) + 1e-20)); }
      let im = 0; env.forEach((v, i) => { if (v > env[im]) im = i; });
      const tDrop = d => { for (let i = im; i < env.length; i++) if (env[i] < env[im] - d) return (i - im) * 0.05; return 99; };
      let e = 0; for (let i = 4800; i < 4800 + 48000; i++) e += a[i] * a[i] + c[i] * c[i];
      return { rms: 10 * Math.log10(e / 96000), peak: 20 * Math.log10(pk), T10: tDrop(10), T20: tDrop(20) };
    }
    const C = [48, 60, 64, 67], G7 = [43, 59, 62, 65, 67];
    const base = { C: await render(OLD, null, C), G7: await render(OLD, null, G7) };
    const out = [];
    for (const cfg of cfgs) out.push({ cfg, C: await render(NEW, cfg, C), G7: await render(NEW, cfg, G7) });
    return { base, out };
  }, { OLD, NEW, cfgs });
  const tgt = -17.5, f = x => x.toFixed(2);
  console.log(`이전: C RMS ${res.base.C.rms.toFixed(1)} peak ${res.base.C.peak.toFixed(1)} T10 ${f(res.base.C.T10)} T20 ${f(res.base.C.T20)} | G7 T20 ${f(res.base.G7.T20)}`);
  const rows = res.out.map(({ cfg, C, G7 }) => {
    const mk = tgt - C.rms;                                 // 필요한 보정(dB)
    const peakMax = C.peak + mk + 20 * Math.log10(1 / 0.6);  // 슬라이더 1.0 에서의 전 피크
    const peakMaxG = G7.peak + mk + 20 * Math.log10(1 / 0.6);
    return { cfg, mk, peakMax: Math.max(peakMax, peakMaxG), rC: C.T20 / res.base.C.T20, rG: G7.T20 / res.base.G7.T20, t10: C.T10 / res.base.C.T10, C, G7 };
  });
  rows.sort((a, b) => Math.abs((a.rC + a.rG) / 2 - 1.4) - Math.abs((b.rC + b.rG) / 2 - 1.4));
  for (const r of rows.slice(0, 8)) console.log(`prompt ${r.cfg.prompt} tau ${r.cfg.tauMax} pRatio ${r.cfg.promptRatio} | 보정 +${r.mk.toFixed(1)} dB (배 ${Math.pow(10, r.mk / 20).toFixed(2)}), 피크 기본 ${(r.peakMax - 4.44).toFixed(1)} / 최대 ${r.peakMax.toFixed(1)} dBFS | T20 배율 C ${f(r.rC)} G7 ${f(r.rG)}, T10 배율 ${f(r.t10)} | C: T10 ${f(r.C.T10)} T20 ${f(r.C.T20)}s`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
