// 지속 지표: 꼬리 음량(1–2초, 2–3초 구간 RMS − 첫 1초 RMS)과 10 dB 감쇠 시간. 목표: 꼬리 +3 dB, T10 1.3~1.5배
const { chromium } = require('playwright');
const fs = require('fs');
function extract(src, head) { const i = src.indexOf(head); let k = src.indexOf('{', i), d = 0; for (let j = k; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) { let e = j + 1; if (src[e] === ';') e++; return src.slice(i, e); } } } }
const lib = f => { const s = fs.readFileSync(f, 'utf-8'); return ['const PIANO', 'function synthPiano(m)', 'function makeRoomIR()', 'function buildPianoChain(out)'].map(h => extract(s, h)).filter(Boolean).join('\n'); };
const OLD = lib('ui_old.js'), NEW = lib('ui.js');
const cfgs = [{ label: '이전 합성 + 배음별 위상 난수만', phaseRand: true, prompt: 0.72, tauMax: 7.5, promptRatio: 0.12 }];
for (const prompt of [0.72, 0.68, 0.64, 0.6]) for (const tauMax of [7.5, 8.5, 9.5]) for (const promptRatio of [0.12, 0.15])
  cfgs.push({ phaseRand: true, prompt, tauMax, promptRatio });
cfgs.forEach(c => Object.assign(c, { tauMin: 0.9 * c.tauMax / 7.5, lenMax: 5.6, lenMin: 2.6, release: 0.07, comp: null }));
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto('about:blank');
  const res = await page.evaluate(async ({ OLD, NEW, cfgs }) => {
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    async function render(code, cfg, notes) {
      const sr = 48000, ctx = new OfflineAudioContext(2, sr * 6, sr);
      const L = new Function('ctx', 'clamp', 'pianoTune', code + '\nreturn { synthPiano, makeRoomIR, PIANO: typeof PIANO !== "undefined" ? PIANO : null, buildPianoChain: typeof buildPianoChain !== "undefined" ? buildPianoChain : null };')(ctx, clamp, 0);
      const pg = ctx.createGain(); pg.gain.value = 0.6; pg.connect(ctx.destination);
      let bus;
      if (cfg) { Object.assign(L.PIANO, cfg, { makeup: 1 }); bus = L.buildPianoChain(pg); }
      else { bus = ctx.createGain(); bus.connect(pg); const cv = ctx.createConvolver(), w = ctx.createGain(); cv.buffer = L.makeRoomIR(); w.gain.value = 0.22; bus.connect(cv); cv.connect(w); w.connect(pg); }
      notes.forEach((m, i) => { const b = L.synthPiano(m), src = ctx.createBufferSource(); src.buffer = b; const g = ctx.createGain(); g.gain.value = i === 0 ? 0.62 : 0.5 * Math.sqrt(3 / (notes.length - 1)); const p = ctx.createStereoPanner(); p.pan.value = clamp((m - 60) / 36, -0.5, 0.5); src.connect(g); g.connect(p); p.connect(bus); src.start(0.1); });
      const buf = await ctx.startRendering(), a = buf.getChannelData(0), c = buf.getChannelData(1);
      let pk = 0; for (let i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i]), Math.abs(c[i]));
      const rms = (s0, s1) => { let e = 0, n = 0; for (let i = Math.round((0.1 + s0) * sr); i < Math.round((0.1 + s1) * sr); i++) { e += a[i] * a[i] + c[i] * c[i]; n += 2; } return 10 * Math.log10(e / n + 1e-20); };
      const env = []; for (let i = 0; i + 2400 <= a.length; i += 2400) { let e = 0; for (let j = i; j < i + 2400; j++) e += a[j] * a[j] + c[j] * c[j]; env.push(10 * Math.log10(e / 4800 + 1e-20)); }
      let im = 0; env.forEach((v, i) => { if (v > env[im]) im = i; });
      let t10 = 99; for (let i = im; i < env.length; i++) if (env[i] < env[im] - 10) { t10 = (i - im) * 0.05; break; }
      const r01 = rms(0, 1);
      return { r01, s12: rms(1, 2) - r01, s23: rms(2, 3) - r01, peak: 20 * Math.log10(pk), t10 };
    }
    const C = [48, 60, 64, 67], G7 = [43, 59, 62, 65, 67];
    const base = { C: await render(OLD, null, C), G7: await render(OLD, null, G7) };
    const out = [];
    for (const cfg of cfgs) out.push({ cfg, C: await render(NEW, cfg, C), G7: await render(NEW, cfg, G7) });
    return { base, out };
  }, { OLD, NEW, cfgs });
  const B = res.base, f1 = x => x.toFixed(1);
  console.log(`이전  C: 꼬리(1–2s) ${f1(B.C.s12)} dB, (2–3s) ${f1(B.C.s23)} dB, T10 ${B.C.T10 || B.C.t10.toFixed(2)}s, RMS ${f1(B.C.r01)} | G7: 꼬리 ${f1(B.G7.s12)}/${f1(B.G7.s23)} dB, T10 ${B.G7.t10.toFixed(2)}s`);
  const rows = res.out.map(({ cfg, C, G7 }) => ({ cfg, C, G7, dS: ((C.s12 - B.C.s12) + (G7.s12 - B.G7.s12)) / 2, dS23: ((C.s23 - B.C.s23) + (G7.s23 - B.G7.s23)) / 2, rT: (C.t10 / B.C.t10 + G7.t10 / B.G7.t10) / 2, mk: -17.5 - C.r01, crest: Math.max(C.peak - C.r01, G7.peak - G7.r01) }));
  const show = r => `${r.cfg.label ? r.cfg.label + ' | ' : ''}prompt ${r.cfg.prompt} tau ${r.cfg.tauMax} pRatio ${r.cfg.promptRatio} | 꼬리 변화 1–2s ${r.dS >= 0 ? '+' : ''}${f1(r.dS)} dB, 2–3s ${r.dS23 >= 0 ? '+' : ''}${f1(r.dS23)} dB | T10 배율 ${r.rT.toFixed(2)} | 보정 +${f1(r.mk)} dB, 기본 볼륨 피크 ${f1(-17.5 + r.crest)} dBFS`;
  console.log(show(rows[0]));
  const rest = rows.slice(1).sort((a, b) => (Math.abs(a.dS - 3) + 2 * Math.abs(a.rT - 1.4)) - (Math.abs(b.dS - 3) + 2 * Math.abs(b.rT - 1.4)));
  for (const r of rest.slice(0, 6)) console.log(show(r));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
