// =====================================================================
//  화면·재생 제어
// =====================================================================
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtTime = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const mq = q => (window.matchMedia ? window.matchMedia(q) : { matches: false });
  const onMq = (m, fn) => { if (m.addEventListener) m.addEventListener('change', fn); else if (m.addListener) m.addListener(fn); };
  const reduceMotion = mq('(prefers-reduced-motion: reduce)');
  const narrow = mq('(max-width: 640px)');
  // 정렬 배열에서 x 이하인 마지막 인덱스(없으면 -1)
  function lastLE(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; } return lo - 1; }

  // ---------------- 환경설정(브라우저 저장) ----------------
  const PREF_KEY = 'madi-code-prefs-v1';
  const prefs = Object.assign(
    { metro: true, accent: true, clickVol: 0.8, musicVol: 0.9, offsetMs: 0, autoscroll: true, theme: '', vocab: 'standard', res: 1, slash: true,
      piano: true, pianoVol: 0.6, pianoMode: 'change' },
    (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; } })());
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* 저장 불가 환경은 무시 */ } }

  // ---------------- 테마 ----------------
  const root = document.documentElement;
  if (prefs.theme === 'light' || prefs.theme === 'dark') root.dataset.theme = prefs.theme;
  $('themeBtn').addEventListener('click', () => {
    const cur = root.dataset.theme || (mq('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nxt = cur === 'dark' ? 'light' : 'dark';
    root.dataset.theme = nxt; prefs.theme = nxt; savePrefs();
    drawOverview();
  });
  onMq(mq('(prefers-color-scheme: dark)'), () => drawOverview());

  // ---------------- 상태 ----------------
  const S = {
    A: null, TL: null, set: null, buffer: null, name: '',
    flat: [], flatT: new Float64Array(0), barT0: new Float64Array(0), barEls: [],
    strikes: [], strikeT: new Float64Array(0),
    cur: { bar: -1, beat: -1, ev: -2, sec: -1 }, ledN: 0, scrub: null, width: 0,
  };
  let loadToken = 0;

  // ---------------- 오디오 ----------------
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, musicGain = null, clickGain = null, pianoGain = null, pianoBus = null, clickHi = null, clickLo = null;
  function ensureCtx() {
    if (ctx) return ctx;
    ctx = new AC();
    // 출력 직전 리미터: 음악·클릭·코드 연주가 겹쳐도 디지털 클리핑이 나지 않게(모든 소리에 같은 지연이라 정렬 유지)
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -1; master.knee.value = 0; master.ratio.value = 20;
    master.attack.value = 0.001; master.release.value = 0.1;
    master.connect(ctx.destination);
    musicGain = ctx.createGain(); clickGain = ctx.createGain(); pianoGain = ctx.createGain();
    musicGain.connect(master); clickGain.connect(master); pianoGain.connect(master);
    musicGain.gain.value = prefs.musicVol; clickGain.gain.value = prefs.clickVol; pianoGain.gain.value = prefs.pianoVol;
    // 피아노 버스: 건조음 + 짧은 방 잔향
    pianoBus = ctx.createGain();
    pianoBus.connect(pianoGain);
    try {
      const conv = ctx.createConvolver(), wet = ctx.createGain();
      conv.buffer = makeRoomIR(); wet.gain.value = 0.22;
      pianoBus.connect(conv); conv.connect(wet); wet.connect(pianoGain);
    } catch (e) { /* 잔향 없이도 동작 */ }
    clickHi = makeClick(1850, 0.9);
    clickLo = makeClick(1250, 0.6);
    ctx.onstatechange = () => { if (ctx.state !== 'running' && player.playing) player.pause(); };
    return ctx;
  }
  // 클릭 소리: 샘플 0에서 곧바로 시작(발음 지연 없음) + 짧은 감쇠
  function makeClick(freq, amp) {
    const sr = ctx.sampleRate, n = Math.round(sr * 0.06);
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const tone = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2.02 * t);
      const nz = t < 0.002 ? rnd() * (1 - t / 0.002) * 0.5 : 0;   // 어택을 또렷하게
      d[i] = amp * (0.75 * tone * Math.exp(-t / 0.016) + nz);
    }
    return b;
  }
  // ---------------- 코드 연주용 피아노 ----------------
  // 샘플 파일 없이 현의 물리를 흉내 낸 가산 합성: 비조화 배음, 해머 타격 위치, 이중 감쇠, 여러 현의 맥놀이.
  // 음마다 한 번만 만들어 캐시한다.
  const pianoCache = new Map();           // MIDI 음 → AudioBuffer
  let pianoTune = 0;                      // 곡의 기준음 편차(반음): 피아노도 녹음의 튜닝에 맞춤
  const voices = [];                      // 울리고 있거나 예약된 음
  function pianoNote(m) {
    let b = pianoCache.get(m);
    if (!b) { b = synthPiano(m); pianoCache.set(m, b); }
    return b;
  }
  function synthPiano(m) {
    const sr = ctx.sampleRate;
    const f0 = 440 * Math.pow(2, (m - 69 + pianoTune) / 12);
    const n = Math.round(sr * clamp(4.8 - (m - 38) * 0.07, 2.0, 4.8));   // 낮은 음일수록 길게 울림
    const y = new Float32Array(n);
    const Bc = 3.5e-4 * Math.pow(2, (m - 60) / 24);                       // 현의 비조화성 계수
    const strike = 1 / 7.5;                                                // 해머 타격 위치(현 길이 비)
    const fMax = Math.min(0.45 * sr, 8000);
    const tau1 = clamp(7.5 * Math.pow(2, -(m - 38) / 16), 0.9, 7.5);       // 기본음 여음의 감쇠 시간(초)
    const bright = clamp(2600 + (m - 60) * 40, 1800, 5000);                // 해머 펠트의 고역 감쇠 기준(Hz)
    const nStr = m < 35 ? 1 : (m < 47 ? 2 : 3);                            // 한 음을 이루는 현의 수
    const det = [0, 1.0, -0.8];                                            // 현마다 조율 차(cent) → 맥놀이
    for (let k = 1; k <= 32; k++) {
      const fk = k * f0 * Math.sqrt(1 + Bc * k * k);                       // 비조화 배음
      if (fk > fMax) break;
      let a = Math.abs(Math.sin(Math.PI * k * strike)) / Math.pow(k, 0.8); // 타격 위치의 빗살 효과
      a /= 1 + (fk / bright) * (fk / bright);
      if (a < 2e-3) continue;
      const tS = Math.max(0.12, tau1 * Math.pow(f0 / fk, 0.7));            // 높은 배음일수록 빨리 사라짐
      const tF = tS * 0.12;                                                 // 즉음(빠른 감쇠) 성분
      const len = Math.min(n, Math.ceil(sr * tS * Math.log(a / 1e-5)));    // −100 dB 아래는 계산 생략
      const strings = k <= 6 ? nStr : 1;
      const df = Math.exp(-1 / (tF * sr)), ds = Math.exp(-1 / (tS * sr));
      for (let q = 0; q < strings; q++) {
        const w = 2 * Math.PI * fk * Math.pow(2, det[q] / 1200) / sr;
        const cw = Math.cos(w), sw = Math.sin(w);
        let re = 1, im = 0, ef = 0.72 * a / strings, es = 0.28 * a / strings;
        for (let i = 0; i < len; i++) {
          const r = re * cw - im * sw; im = re * sw + im * cw; re = r;     // 회전 재귀로 사인 생성
          y[i] += im * (ef + es);
          ef *= df; es *= ds;
          if ((i & 2047) === 2047) { const g = 1 / Math.sqrt(re * re + im * im); re *= g; im *= g; }  // 수치 드리프트 보정
        }
      }
    }
    // 해머가 현을 때리는 짧은 잡음
    let seed = (m * 7919 + 13) >>> 0, lp = 0;
    const cLp = Math.exp(-2 * Math.PI * clamp(f0 * 6, 1500, 7000) / sr);
    const nzA = 0.02 + 0.0006 * (m - 40), nzN = Math.min(n, Math.round(sr * 0.03));
    for (let i = 0; i < nzN; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      lp = lp * cLp + (seed / 4294967296 * 2 - 1) * (1 - cLp);
      y[i] += nzA * lp * Math.exp(-i / (sr * 0.006));
    }
    // 어택 1.5 ms 램프, 끝 60 ms 페이드, 앞 0.3초 RMS 기준으로 음량 맞춤
    const ra = Math.round(sr * 0.0015), rf = Math.round(sr * 0.06);
    for (let i = 0; i < ra; i++) y[i] *= i / ra;
    for (let i = 0; i < rf; i++) y[n - 1 - i] *= i / rf;
    const nr = Math.min(n, Math.round(sr * 0.3));
    let e = 0;
    for (let i = 0; i < nr; i++) e += y[i] * y[i];
    const g = 0.12 / (Math.sqrt(e / nr) + 1e-9);
    for (let i = 0; i < n; i++) y[i] *= g;
    const b = ctx.createBuffer(1, n, sr);
    if (b.copyToChannel) b.copyToChannel(y, 0); else b.getChannelData(0).set(y);
    return b;
  }
  // 방 잔향 임펄스 응답: 시간이 지날수록 어두워지며 사라지는 잡음(1.6초)
  function makeRoomIR() {
    const sr = ctx.sampleRate, len = Math.round(sr * 1.6);
    const ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let seed = 777 + c * 4242, lp = 0;
      for (let i = 0; i < len; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const t = i / sr;
        lp += ((seed / 4294967296 * 2 - 1) - lp) * (0.25 + 0.6 * Math.exp(-t / 0.25));
        d[i] = t < 0.012 ? 0 : lp * Math.exp(-t / 0.4);
      }
    }
    return ir;
  }
  // 코드 → 건반: 왼손 베이스 한 음(D2~C♯3) + 오른손 밀집 배치(이전 배치의 중심과 가장 가깝게)
  function voicing(pcs, bassPc, target) {
    const pc = x => ((x % 12) + 12) % 12;
    const bass = 38 + pc(bassPc - 38);
    const tones = Array.from(new Set(pcs));
    let best = null;
    for (let r = 0; r < tones.length; r++) {
      const order = tones.slice(r).concat(tones.slice(0, r));   // 자리바꿈 r
      const notes = [53 + pc(order[0] - 53)];                    // 맨 아래 음: F3~E4
      for (let q = 1; q < order.length; q++) { let x = notes[q - 1] + 1; while (pc(x) !== order[q]) x++; notes.push(x); }
      const cen = notes.reduce((a, x) => a + x, 0) / notes.length;
      const top = notes[notes.length - 1];
      const cost = Math.abs(cen - target) + (top > 77 ? 2 * (top - 77) : 0);
      if (!best || cost < best.cost) best = { notes, cen, cost };
    }
    return { notes: [bass].concat(best.notes), cen: best.cen };
  }
  // 타임라인 → 피아노 타건 목록. 모드: change(코드가 바뀔 때), bar(마디마다 다시), beat(박마다)
  function buildStrikes() {
    const TL = S.TL, out = [];
    if (!TL || TL.empty) { S.strikes = out; S.strikeT = new Float64Array(0); return; }
    const b = TL.beats, n = b.length;
    const tAt = x => { const i = Math.min(n - 2, Math.max(0, Math.floor(x))); return b[i] + (x - i) * (b[i + 1] - b[i]); };
    const segs = [];
    TL.bars.forEach(bar => bar.events.forEach(ev => {
      const x0 = bar.startBeat + ev.off, x1 = x0 + ev.dur;
      segs.push({ x0, x1, t0: tAt(x0), t1: tAt(x1), nc: ev.label.nc, pcs: ev.pcs, bassPc: ev.bassPc,
        key: ev.label.nc ? 'N' : ev.pcs.join('.') + '/' + ev.bassPc });
    }));
    const mode = prefs.pianoMode;
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      if (g.nc) continue;                                   // N.C.는 치지 않음(앞 코드도 여기서 멈춤)
      if (mode === 'bar') out.push({ t0: g.t0, t1: g.t1, g });
      else if (mode === 'beat') {
        const xs = [g.x0];
        for (let x = Math.floor(g.x0) + 1; x < g.x1 - 1e-6; x++) xs.push(x);
        xs.forEach((x, k) => out.push({ t0: tAt(x), t1: tAt(k + 1 < xs.length ? xs[k + 1] : g.x1), g }));
      } else {
        if (i > 0 && segs[i - 1].key === g.key) continue;   // 마디를 넘어 이어지는 같은 코드는 한 번만
        let j = i;
        while (j + 1 < segs.length && segs[j + 1].key === g.key) j++;
        out.push({ t0: g.t0, t1: segs[j].t1, g });
      }
    }
    let cen = 62, lastKey = null, lastNotes = null;
    for (const s of out) {
      if (s.g.key !== lastKey) {
        const v = voicing(s.g.pcs, s.g.bassPc, cen);
        lastNotes = v.notes; lastKey = s.g.key;
        cen = 0.7 * v.cen + 0.3 * 62;                      // 음역이 한쪽으로 흘러가지 않게 가운데로 당김
      }
      s.notes = lastNotes;
    }
    S.strikes = out;
    S.strikeT = Float64Array.from(out, s => s.t0);
  }
  function playChord(notes, when, endAt) {
    const nRH = notes.length - 1;
    notes.forEach((m, i) => {
      const buf = pianoNote(m);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const vel = i === 0 ? 0.62 : 0.5 * Math.sqrt(3 / nRH);
      g.gain.value = vel;
      src.connect(g);
      let out = g;
      if (ctx.createStereoPanner) {                          // 낮은 음은 왼쪽, 높은 음은 오른쪽(연주자 시점)
        const pn = ctx.createStereoPanner();
        pn.pan.value = clamp((m - 60) / 36, -0.5, 0.5);
        g.connect(pn); out = pn;
      }
      out.connect(pianoBus);
      src.start(when);
      if (endAt < when + buf.duration) {                     // 다음 코드에서 댐퍼가 내려오듯 부드럽게 멈춤
        g.gain.setValueAtTime(vel, endAt);
        g.gain.setTargetAtTime(0, endAt, 0.06);
        src.stop(endAt + 0.4);
      }
      const v = { src, g, when };
      voices.push(v);
      src.onended = () => { const k = voices.indexOf(v); if (k >= 0) voices.splice(k, 1); try { out.disconnect(); g.disconnect(); } catch (e) { } };
    });
  }
  function cancelVoices() {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of voices) {
      try {
        if (v.when > now + 0.005) { v.src.stop(); continue; }   // 아직 시작 전이면 그냥 취소
        const p = v.g.gain;
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now);
        else { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); }
        p.setTargetAtTime(0, now, 0.02);                          // 끊김 소리 없이 빠르게 줄임
        v.src.stop(now + 0.15);
      } catch (e) { /* 이미 멈춘 음 */ }
    }
    voices.length = 0;
  }
  // 곡에 필요한 음을 처음 나오는 순서대로 미리 합성(재생 중 끊김 방지)
  let warmToken = 0;
  async function warmPiano() {
    if (!ctx || !prefs.piano) return;
    const tok = ++warmToken, need = [];
    for (const s of S.strikes) for (const m of s.notes) if (!pianoCache.has(m) && need.indexOf(m) < 0) need.push(m);
    for (const m of need) {
      if (tok !== warmToken) return;
      pianoNote(m);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  function decode(ab) {
    return new Promise((res, rej) => {
      try {
        const p = ensureCtx().decodeAudioData(ab, res, rej);   // 옛 사파리는 콜백 방식
        if (p && typeof p.then === 'function') p.then(res, rej);
      } catch (e) { rej(e); }
    });
  }
  function readFile(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(file); });
  }

  // ---------------- 재생기 + 메트로놈 스케줄러 ----------------
  // 클릭은 setInterval 타이밍이 아니라 AudioContext 시계에 미리(200 ms 앞) 예약한다.
  // 음악 소스와 같은 시계를 쓰므로 클릭 = startCtx + (비트 시각 − 재생 시작 위치) 로 샘플 단위 정렬된다.
  const player = {
    src: null, playing: false, startCtx: 0, startOff: 0, pausedAt: 0, next: 0, nextStrike: 0, timer: 0, clicks: [],
    dur() { return S.buffer ? S.buffer.duration : 0; },
    // 시작 예약(60 ms) 전에는 이동한 지점으로 고정: 그래야 → 키를 연달아(자동 반복) 눌러도 다음 마디로 계속 넘어감
    pos() { return this.playing ? this.startOff + Math.max(0, ctx.currentTime - this.startCtx) : this.pausedAt; },
    async play(from) {
      if (!S.buffer) return;
      ensureCtx();
      if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* 무시 */ } }
      if (from === undefined) from = this.pausedAt;
      if (from >= this.dur() - 0.05) from = 0;
      this.stopSource();
      const s = ctx.createBufferSource();
      s.buffer = S.buffer; s.connect(musicGain);
      const when = ctx.currentTime + 0.06;
      s.start(when, Math.max(0, from));
      s.onended = () => { if (this.src === s) this.finish(); };
      this.src = s; this.startCtx = when; this.startOff = Math.max(0, from); this.playing = true;
      this.resync();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.schedule(), 25);
      this.schedule();
      setPlayingUI(true);
    },
    finish() {
      this.playing = false; this.pausedAt = this.dur(); this.src = null;
      this.cancelClicks(); cancelVoices(); clearInterval(this.timer); setPlayingUI(false);
    },
    pause() {
      if (!this.playing) return;
      this.pausedAt = clamp(this.pos(), 0, this.dur());
      this.playing = false;
      this.stopSource(); this.cancelClicks(); cancelVoices(); clearInterval(this.timer);
      setPlayingUI(false);
    },
    toggle() { if (this.playing) this.pause(); else this.play(); },
    seek(t) {
      t = clamp(t, 0, this.dur());
      if (this.playing) this.play(t); else this.pausedAt = t;
    },
    stopSource() {
      const s = this.src; this.src = null;
      if (s) { s.onended = null; try { s.stop(); } catch (e) { } try { s.disconnect(); } catch (e) { } }
    },
    cancelClicks() {
      for (const c of this.clicks) { try { c.stop(); } catch (e) { } }
      this.clicks.length = 0;
    },
    // 지금 위치 다음부터 다시 예약(이동·보정·설정 변경 시). 클릭과 코드 연주는 따로 다시 맞출 수 있음
    resync() { this.resyncClicks(); this.resyncPiano(); },
    resyncPiano() {
      cancelVoices();
      const t = this.playing ? Math.max(this.startOff, this.pos()) : this.pausedAt;
      this.nextStrike = lastLE(S.strikeT, t - 1e-4) + 1;
      if (!this.playing || !prefs.piano) return;
      // 코드 한가운데서 재생을 시작하면 지금 코드를 곧바로 한 번 울림
      const s = S.strikes[this.nextStrike - 1];
      if (s && t < s.t1 - 0.1) playChord(s.notes, Math.max(ctx.currentTime, this.startCtx + (t - this.startOff)), this.startCtx + (s.t1 - this.startOff));
    },
    resyncClicks() {
      this.cancelClicks();
      if (!S.TL || !S.TL.beats.length) { this.next = 0; return; }
      const off = prefs.offsetMs / 1000;
      const t = this.playing ? Math.max(this.startOff, this.pos()) : this.pausedAt;
      this.next = lastLE(S.TL.beats, t - off - 1e-4) + 1;
    },
    schedule() {
      if (!this.playing || !S.TL) return;
      const beats = S.TL.beats, off = prefs.offsetMs / 1000, now = ctx.currentTime;
      const horizon = this.pos() + (document.hidden ? 1.5 : 0.2);   // 백그라운드 탭은 타이머가 느려지므로 길게
      while (this.next < beats.length) {
        const bt = beats[this.next] + off;
        if (bt > horizon) break;
        const when = this.startCtx + (bt - this.startOff);
        if (prefs.metro && bt >= 0 && bt <= this.dur() && when >= now - 0.004) {
          const acc = prefs.accent && S.TL.pos[this.next] === 0;
          const s = ctx.createBufferSource();
          s.buffer = acc ? clickHi : clickLo;
          s.connect(clickGain);
          s.start(Math.max(when, now));
          s.onended = () => { const k = this.clicks.indexOf(s); if (k >= 0) this.clicks.splice(k, 1); try { s.disconnect(); } catch (e) { } };
          this.clicks.push(s);
        }
        this.next++;
      }
      // 코드 연주: 음악 시각 그대로 예약(클릭 타이밍 보정은 적용하지 않음)
      const st = S.strikes;
      while (this.nextStrike < st.length) {
        const s = st[this.nextStrike];
        if (s.t0 > horizon) break;
        const when = this.startCtx + (s.t0 - this.startOff);
        if (prefs.piano && when >= now - 0.01 && s.t0 < this.dur()) playChord(s.notes, Math.max(when, now), this.startCtx + (s.t1 - this.startOff));
        this.nextStrike++;
      }
    },
  };

  // SVG 요소에는 .hidden 속성이 없으므로 attribute 로 직접 토글
  const showEl = (el, on) => { if (on) el.removeAttribute('hidden'); else el.setAttribute('hidden', ''); };
  function setPlayingUI(on) {
    showEl($('icoPlay'), !on); showEl($('icoPause'), on);
    $('play').setAttribute('aria-label', on ? '일시정지' : '재생');
  }

  // ---------------- 불러오기·분석 ----------------
  function setProgress(f, label) {
    $('fill').style.width = (f * 100).toFixed(1) + '%';
    $('pct').textContent = Math.round(f * 100) + '%';
    if (label) $('stage').textContent = label;
  }
  function showError(msg) { const e = $('err'); e.textContent = msg; e.hidden = false; }

  async function loadFile(file) {
    if (!file) return;
    if (!AC) { showError('이 브라우저는 Web Audio API를 지원하지 않아 분석할 수 없습니다.'); return; }
    const token = ++loadToken;
    player.pause();
    $('err').hidden = true;
    $('intro').hidden = true; $('app').hidden = true; $('busy').hidden = false;
    $('busyFile').textContent = file.name;
    setProgress(0, '파일 읽는 중');
    const restore = () => { $('busy').hidden = true; if (S.buffer) $('app').hidden = false; else $('intro').hidden = false; };
    let buf;
    try {
      const ab = await readFile(file);
      if (token !== loadToken) return;
      setProgress(0, '오디오 디코딩 중');
      buf = await decode(ab);
    } catch (e) {
      if (token !== loadToken) return;
      restore();
      showError('이 파일을 디코딩하지 못했습니다. 브라우저가 재생할 수 있는 오디오 형식(MP3, WAV, M4A 등)인지 확인해 주세요.');
      return;
    }
    if (token !== loadToken) return;
    if (!buf || buf.length < buf.sampleRate * 0.5) { restore(); showError('오디오가 너무 짧습니다. 몇 초 이상인 파일을 넣어 주세요.'); return; }
    let A;
    try {
      const chans = [];
      for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
      A = await Engine.analyze({ channels: chans, sampleRate: buf.sampleRate }, (f, label) => { if (token === loadToken) setProgress(f, label); });
    } catch (e) {
      if (token !== loadToken) return;
      console.error(e);
      restore();
      showError('분석 중 오류가 발생했습니다: ' + (e && e.message ? e.message : e));
      return;
    }
    if (token !== loadToken) return;
    S.buffer = buf; S.A = A; S.name = file.name.replace(/\.[^.]+$/, '');
    // 피아노를 이 녹음의 기준음에 맞춤(0.5 cent 넘게 달라지면 다시 합성)
    if (Math.abs(A.harm.tuning - pianoTune) > 0.005) { pianoCache.clear(); pianoTune = A.harm.tuning; }
    S.set = Object.assign(Engine.defaultSettings(), { vocab: prefs.vocab, res: +prefs.res === 2 ? 2 : 1, slash: !!prefs.slash });
    player.pausedAt = 0;
    $('busy').hidden = true; $('app').hidden = false;
    $('title').textContent = S.name;
    $('tDur').textContent = fmtTime(buf.duration);
    syncControls();
    rebuild();
    window.scrollTo(0, 0);
  }

  // 설정이 바뀔 때마다: 타임라인 재구성 → 화면 갱신 → 메트로놈 재동기화
  function rebuild() {
    S.TL = Engine.buildTimeline(S.A, S.set);
    buildFlat();
    buildStrikes();
    S.cur = { bar: -1, beat: -1, ev: -2, sec: -1 };
    renderFacts(); renderChart(); drawOverview(); renderText(); renderInfo(); renderApplied();
    player.resync();
    if (player.playing) player.schedule();
    warmPiano();
  }

  // 코드 변화 목록(현재·다음 코드 표시용): 마디를 넘어 이어지는 같은 코드는 하나로
  function buildFlat() {
    const TL = S.TL, out = [];
    if (!TL.empty) {
      const b = TL.beats, n = b.length;
      const tAt = x => {
        const i = Math.min(n - 2, Math.max(0, Math.floor(x)));
        return b[i] + (x - i) * (b[i + 1] - b[i]);
      };
      TL.bars.forEach((bar, bi) => bar.events.forEach(ev => {
        if (out.length && out[out.length - 1].label.text === ev.label.text) return;
        out.push({ t0: tAt(bar.startBeat + ev.off), label: ev.label, bar: bi });
      }));
    }
    S.flat = out;
    S.flatT = Float64Array.from(out, e => e.t0);
    S.barT0 = TL.empty ? new Float64Array(0) : Float64Array.from(TL.bars, b => b.t0);
  }

  // ---------------- 렌더링 ----------------
  function chordHTML(l) {
    if (l.nc) return 'N.C.';
    return esc(l.root) + (l.base ? '<span class="q">' + esc(l.base) + '</span>' : '') +
      (l.ext ? '<sup>' + esc(l.ext) + '</sup>' : '') + (l.bass ? '<span class="bs">/' + esc(l.bass) + '</span>' : '');
  }
  // 대략적인 글자 폭(em): 근음 1em, 성질 0.8em, 첨자 0.6em
  const labelEm = l => l.nc ? 2.2 : 0.56 * l.root.length + 0.46 * l.base.length + 0.34 * l.ext.length + (l.bass ? 0.46 * (1 + l.bass.length) : 0);

  function renderFacts() {
    const TL = S.TL, A = S.A;
    const cents = A.harm.tuning * 100;
    $('fTune').textContent = 'A4 ' + (440 * Math.pow(2, A.harm.tuning / 12)).toFixed(1) + ' Hz';
    $('fTune').title = (cents >= 0 ? '+' : '') + cents.toFixed(0) + ' cent';
    const optAuto = $('selMeter').querySelector('option[value="auto"]');
    if (TL.empty) {
      $('fBpm').textContent = '–'; $('fMeter').textContent = '–'; $('fKey').textContent = '–'; $('fBars').textContent = '0';
      optAuto.textContent = '자동';
      return;
    }
    $('fBpm').textContent = TL.bpm.toFixed(1) + (TL.meter.triple ? ' (점4분)' : '');
    $('fMeter').textContent = TL.meter.label;
    $('fKey').textContent = TL.key.name;
    const full = TL.bars.filter(b => !b.pickup).length;
    $('fBars').textContent = full + (TL.bars[0].pickup ? ' + 못갖춘마디' : '');
    optAuto.textContent = S.set.meter === 'auto' ? '자동 (' + TL.meter.label + ')' : '자동';
  }

  function renderChart() {
    const chart = $('chart'), TL = S.TL;
    chart.textContent = '';
    S.barEls = [];
    if (TL.empty) {
      const p = document.createElement('p');
      p.className = 'empty-msg';
      p.textContent = '박을 찾지 못했습니다. 리듬이 있는 구간이 너무 짧거나 소리가 거의 없는 파일일 수 있습니다. 재생은 그대로 할 수 있습니다.';
      chart.appendChild(p);
      return;
    }
    const per = narrow.matches ? 2 : 4;
    chart.style.setProperty('--per', per);
    const numW = narrow.matches ? 26 : 36;
    const barW = Math.max(60, (chart.clientWidth - numW) / per - 22);
    const fontPx = narrow.matches ? 21 : 25;
    S.width = chart.clientWidth;
    const m = TL.meter.m, res = TL.res;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < TL.bars.length; i += per) {
      const line = document.createElement('div'); line.className = 'line';
      const num = document.createElement('div'); num.className = 'num'; num.textContent = TL.bars[i].num;
      const row = document.createElement('div'); row.className = 'bars';
      for (let j = i; j < Math.min(i + per, TL.bars.length); j++) row.appendChild(makeBar(TL.bars[j], j, j === TL.bars.length - 1, m, res, barW, fontPx));
      line.appendChild(num); line.appendChild(row); frag.appendChild(line);
    }
    chart.appendChild(frag);
  }

  function makeBar(bar, idx, isLast, m, res, barW, fontPx) {
    const el = document.createElement('div');
    el.className = 'bar' + (bar.pickup ? ' pickup' : '') + (isLast ? ' final' : '');
    el.setAttribute('role', 'listitem');
    el.dataset.i = idx;
    const slots = bar.pickup ? Math.max(bar.nBeats, m) : bar.nBeats;   // 못갖춘마디는 마디 뒤쪽에 붙여 표시
    const shift = slots - bar.nBeats;
    const band = document.createElement('div'); band.className = 'band'; el.appendChild(band);
    const lane = document.createElement('div'); lane.className = 'lane';
    const names = [];
    bar.events.forEach((ev, k) => {
      const c = document.createElement('span');
      const last = k === bar.events.length - 1;
      const avail = ev.dur / slots * barW + (last ? 8 : -4);
      const need = labelEm(ev.label) * fontPx;
      let cls = 'chord';
      if (ev.label.nc) cls += ' nc';
      else if (need > avail) cls += need * 0.76 <= avail ? ' sm' : ' xs';
      if (ev.tied) cls += ' tied';
      c.className = cls;
      c.style.left = ((shift + ev.off) / slots * 100) + '%';
      c.innerHTML = chordHTML(ev.label);
      lane.appendChild(c);
      names.push(ev.label.text + (ev.tied ? ' (이어짐)' : ''));
    });
    el.appendChild(lane);
    const sl = document.createElement('div'); sl.className = 'slashes';
    const marks = [];
    for (let k = 0; k < bar.nBeats; k++) {
      const s = document.createElement('i');
      s.style.left = ((shift + k) / slots * 100) + '%';
      sl.appendChild(s); marks.push(s);
      if (res === 2) {
        const h = document.createElement('i'); h.className = 'off';
        h.style.left = ((shift + k + 0.5) / slots * 100) + '%';
        sl.appendChild(h);
      }
    }
    el.appendChild(sl);
    if (!bar.pickup && bar.nBeats !== m) {
      const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = bar.nBeats + '박';
      el.appendChild(tg);
    }
    el.setAttribute('aria-label', (bar.pickup ? '못갖춘마디' : bar.num + '마디') + ': ' + names.join(', '));
    S.barEls[idx] = { el, marks };
    return el;
  }

  function drawOverview() {
    if (!S.A || !S.buffer || $('app').hidden) return;
    const wrap = $('overview'), c1 = $('wave'), c2 = $('wave2');
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [c1, c2]) {
      c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(H * dpr));
      c.style.width = W + 'px'; c.style.height = H + 'px';
    }
    const cs = getComputedStyle(root);
    const col = cs.getPropertyValue('--wave').trim(), colP = cs.getPropertyValue('--wave-played').trim(), rule = cs.getPropertyValue('--rule').trim();
    const rms = S.A.rms, n = rms.length, dur = S.buffer.duration;
    const cols = Math.max(1, Math.floor(W / 3));
    const vals = new Float32Array(cols);
    let mx = 1e-9;
    for (let x = 0; x < cols; x++) {
      const f0 = Math.floor(x / cols * n), f1 = Math.max(f0 + 1, Math.floor((x + 1) / cols * n));
      let v = 0;
      for (let f = f0; f < f1 && f < n; f++) if (rms[f] > v) v = rms[f];
      vals[x] = v; if (v > mx) mx = v;
    }
    const draw = (c, color) => {
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      if (S.TL && !S.TL.empty) {
        g.fillStyle = rule;
        for (const b of S.TL.bars) g.fillRect(Math.round(b.t0 / dur * c.width), 0, Math.max(1, dpr), c.height * 0.2);
      }
      g.fillStyle = color;
      const mid = c.height / 2, bw = c.width / cols;
      for (let x = 0; x < cols; x++) {
        const h = Math.max(dpr * 0.75, Math.sqrt(vals[x] / mx) * c.height * 0.38);
        g.fillRect(x * bw, mid - h, Math.max(1, bw - dpr), 2 * h);
      }
    };
    draw(c1, col); draw(c2, colP);
  }

  function renderText() {
    $('txt').value = S.TL.empty ? '(박을 찾지 못해 차트를 만들지 못했습니다)' : Engine.chartText(S.TL, { title: S.name });
  }

  function renderInfo() {
    const A = S.A, TL = S.TL, rows = [];
    rows.push(['분석 시간', A.elapsed.toFixed(1) + '초']);
    rows.push(['원본', S.buffer.sampleRate + ' Hz, ' + S.buffer.numberOfChannels + '채널, ' + fmtTime(S.buffer.duration)]);
    const cents = A.harm.tuning * 100;
    rows.push(['기준음', 'A4 = ' + (440 * Math.pow(2, A.harm.tuning / 12)).toFixed(1) + ' Hz (' + (cents >= 0 ? '+' : '') + cents.toFixed(0) + ' cent)']);
    rows.push(['템포 후보', A.tempo.cands.map(c => c.bpm.toFixed(1) + ' (' + Math.round(c.rel * 100) + '%)').join(', ')]);
    rows.push(['정박 검증', '박 위치 강세 ' + A.phase.on.toFixed(2) + ', 반 박 위치 ' + A.phase.off.toFixed(2) + ' → ' + (A.phase.flipped ? '반 박 옮겨 교정함' : '그대로 유지')]);
    const lv = A.level;
    const act = { none: '그대로 유지', halve: '두 배로 잡혀 절반으로 교정', double: '절반으로 잡혀 두 배로 교정' }[lv.action] || lv.action;
    rows.push(['박 단계 검증', act + ' (짝·홀 박 드럼 세기 비 ' + lv.r2.toFixed(2) + ', 박 사이 스네어 비 ' + lv.snareMidOn.toFixed(2) + ')']);
    if (!TL.empty) {
      rows.push(['박 세분', TL.sub.triple ? '3분할 (셋잇단, 복합박자)' : '2분할']);
      if (TL.meter.alt) rows.push(['박자 판정', TL.meter.alt.map(a => a.m + '박 대비도 ' + a.contrast.toFixed(2)).join(', ')]);
      rows.push(['조성 상관', TL.key.score.toFixed(2)]);
      rows.push(['비트 수', String(TL.beats.length)]);
    }
    $('info').innerHTML = rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
  }

  const OPN = { half: '½박 옮김', x2: '템포 ×2', d2: '템포 ÷2', d3: '템포 ÷3' };
  function renderApplied() {
    const parts = S.set.ops.map(o => OPN[o] || o);
    if (S.set.downShift) parts.push('첫 박 ' + (S.set.downShift > 0 ? S.set.downShift + '박 늦춤' : (-S.set.downShift) + '박 앞당김'));
    if (S.set.meter !== 'auto') parts.push('마디당 ' + S.set.meter + '박');
    $('applied').innerHTML = parts.length ? parts.map(p => '<b>' + esc(p) + '</b>').join(', ') : '없음';
    $('appliedSum').textContent = parts.length ? '적용 중: ' + parts.join(', ') : '';
    $('resetBtn').disabled = !parts.length;
  }

  function renderLeds(n) {
    if (n === S.ledN) return;
    S.ledN = n;
    const box = $('leds');
    box.textContent = '';
    for (let k = 0; k < n; k++) { const i = document.createElement('i'); if (k === 0) i.className = 'down'; box.appendChild(i); }
  }

  // ---------------- 재생 위치 표시(매 프레임, 바뀐 것만 갱신) ----------------
  function frame() {
    requestAnimationFrame(frame);
    if (!S.buffer || $('app').hidden) return;
    const dur = S.buffer.duration;
    let t;
    if (S.scrub != null) t = S.scrub;
    else {
      t = player.pos();
      if (player.playing && ctx) t -= (ctx.outputLatency || ctx.baseLatency || 0);   // 실제로 들리는 시점에 맞춤
    }
    t = clamp(t, 0, dur);
    const sec = Math.floor(t);
    if (sec !== S.cur.sec) { S.cur.sec = sec; $('tNow').textContent = fmtTime(t); $('overview').setAttribute('aria-valuenow', String(Math.round(t / dur * 100))); }
    const pct = dur > 0 ? (t / dur * 100) : 0;
    $('played').style.width = pct + '%';
    $('head').style.left = pct + '%';
    const TL = S.TL;
    if (!TL || TL.empty) return;
    let i = lastLE(TL.beats, t);
    if (i >= 0 && t >= TL.bars[TL.bars.length - 1].t1) i = -1;
    const bi = i >= 0 ? TL.barOfBeat[i] : -1;
    const bb = i >= 0 ? i - TL.bars[bi].startBeat : -1;
    if (bi !== S.cur.bar || bb !== S.cur.beat) {
      const pb = S.cur.bar, pk = S.cur.beat;
      if (pb >= 0 && S.barEls[pb]) {
        if (pk >= 0 && S.barEls[pb].marks[pk]) S.barEls[pb].marks[pk].classList.remove('hit');
        if (pb !== bi) S.barEls[pb].el.classList.remove('cur');
      }
      if (bi >= 0 && S.barEls[bi]) {
        const be = S.barEls[bi];
        if (bi !== pb) {
          be.el.classList.add('cur');
          if (prefs.autoscroll && (player.playing || S.scrub != null)) keepVisible(be.el);
        }
        if (be.marks[bb]) be.marks[bb].classList.add('hit');
      }
      const bar = bi >= 0 ? TL.bars[bi] : null;
      renderLeds(bar ? bar.nBeats : TL.meter.m);
      const leds = $('leds').children;
      for (let k = 0; k < leds.length; k++) leds[k].classList.toggle('on', k === bb);
      $('where').textContent = bar ? (bar.pickup ? '못갖춘마디 ' : bar.num + '마디 ') + (bb + 1) + '박' : '\u00a0';
      S.cur.bar = bi; S.cur.beat = bb;
    }
    const ei = lastLE(S.flatT, t);
    if (ei !== S.cur.ev) {
      S.cur.ev = ei;
      const cur = ei >= 0 ? S.flat[ei] : null, nx = S.flat[ei + 1];
      $('cNow').innerHTML = cur ? chordHTML(cur.label) : '&nbsp;';
      if (nx) { $('cNext').innerHTML = chordHTML(nx.label); $('nxtWrap').hidden = false; }
      else $('nxtWrap').hidden = true;
    }
  }
  // 현재 마디가 고정 트랜스포트 아래 보이도록 스크롤
  function keepVisible(el) {
    const top = $('transport').getBoundingClientRect().bottom;
    const r = el.getBoundingClientRect(), vh = window.innerHeight;
    if (r.top >= top + 8 && r.bottom <= vh - 16) return;
    const y = window.scrollY + r.top - top - Math.max(16, (vh - top) * 0.3);
    window.scrollTo({ top: Math.max(0, y), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }

  function jumpBar(d) {
    const TL = S.TL;
    if (!TL || TL.empty) return;
    const t = player.pos();
    let bi = lastLE(S.barT0, t + 1e-3);
    let target;
    if (d < 0 && bi >= 0 && t - S.barT0[bi] > 0.6) target = bi;   // 마디 중간이면 그 마디 처음으로
    else target = bi + d;
    target = clamp(target, 0, TL.bars.length - 1);
    player.seek(TL.bars[target].t0);
  }

  function toggleMetro(v) {
    prefs.metro = v === undefined ? !prefs.metro : !!v;
    savePrefs();
    $('metro').setAttribute('aria-pressed', String(prefs.metro));
    if (prefs.metro) player.resyncClicks(); else player.cancelClicks();
  }
  function togglePiano(v) {
    prefs.piano = v === undefined ? !prefs.piano : !!v;
    savePrefs();
    $('pianoBtn').setAttribute('aria-pressed', String(prefs.piano));
    if (prefs.piano) { warmPiano(); player.resyncPiano(); if (player.playing) player.schedule(); }
    else cancelVoices();
  }

  function syncControls() {
    $('metro').setAttribute('aria-pressed', String(prefs.metro));
    $('pianoBtn').setAttribute('aria-pressed', String(prefs.piano));
    $('selPianoMode').value = prefs.pianoMode;
    document.querySelectorAll('[data-vol="piano"]').forEach(o => { o.value = prefs.pianoVol; });
    document.querySelectorAll('[data-vol="music"]').forEach(o => { o.value = prefs.musicVol; });
    document.querySelectorAll('[data-vol="click"]').forEach(o => { o.value = prefs.clickVol; });
    $('rOffset').value = prefs.offsetMs; $('offTxt').textContent = (prefs.offsetMs > 0 ? '+' : '') + prefs.offsetMs + ' ms';
    $('chkAccent').checked = !!prefs.accent; $('chkScroll').checked = !!prefs.autoscroll;
    $('selVocab').value = S.set.vocab; $('selRes').value = String(S.set.res); $('chkSlash').checked = !!S.set.slash;
    $('selMeter').value = String(S.set.meter);
  }

  // ---------------- 이벤트 ----------------
  for (const id of ['file', 'file2']) {
    $(id).addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; loadFile(f); });
  }
  const hasFiles = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0);
  let dragDepth = 0;
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('veil').hidden = false; });
  window.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('veil').hidden = true; });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; $('veil').hidden = true;
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  $('play').addEventListener('click', () => player.toggle());
  $('metro').addEventListener('click', () => toggleMetro());
  $('pianoBtn').addEventListener('click', () => togglePiano());
  $('selPianoMode').addEventListener('change', e => {
    prefs.pianoMode = e.target.value; savePrefs();
    if (!S.TL) return;
    buildStrikes(); player.resyncPiano(); if (player.playing) player.schedule(); warmPiano();
  });
  // 볼륨: 넓은 화면(트랜스포트 안)과 좁은 화면(아래 줄) 두 벌을 같은 값으로 묶음
  document.querySelectorAll('[data-vol]').forEach(inp => {
    inp.addEventListener('input', e => {
      const v = +e.target.value, kind = e.target.dataset.vol;
      if (kind === 'music') { prefs.musicVol = v; if (musicGain) musicGain.gain.value = v; }
      else if (kind === 'click') { prefs.clickVol = v; if (clickGain) clickGain.gain.value = v; }
      else { prefs.pianoVol = v; if (pianoGain) pianoGain.gain.value = v; }
      document.querySelectorAll('[data-vol="' + kind + '"]').forEach(o => { if (o !== e.target) o.value = v; });
    });
    inp.addEventListener('change', savePrefs);
  });
  $('rOffset').addEventListener('input', e => {
    prefs.offsetMs = Math.round(+e.target.value);
    $('offTxt').textContent = (prefs.offsetMs > 0 ? '+' : '') + prefs.offsetMs + ' ms';
    player.resyncClicks(); if (player.playing) player.schedule();
  });
  $('rOffset').addEventListener('change', savePrefs);
  $('chkAccent').addEventListener('change', e => { prefs.accent = e.target.checked; savePrefs(); player.resyncClicks(); if (player.playing) player.schedule(); });
  $('chkScroll').addEventListener('change', e => { prefs.autoscroll = e.target.checked; savePrefs(); });

  // 보정 연산
  document.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => {
    if (!S.A) return;
    S.set.ops = S.set.ops.concat([b.dataset.op]);
    S.set.downShift = 0;
    rebuild();
  }));
  $('dsPrev').addEventListener('click', () => { if (!S.A) return; S.set.downShift -= 1; rebuild(); });
  $('dsNext').addEventListener('click', () => { if (!S.A) return; S.set.downShift += 1; rebuild(); });
  $('selMeter').addEventListener('change', e => { const v = e.target.value; S.set.meter = v === 'auto' ? 'auto' : +v; S.set.downShift = 0; rebuild(); });
  $('selVocab').addEventListener('change', e => { S.set.vocab = prefs.vocab = e.target.value; savePrefs(); rebuild(); });
  $('selRes').addEventListener('change', e => { S.set.res = prefs.res = +e.target.value; savePrefs(); rebuild(); });
  $('chkSlash').addEventListener('change', e => { S.set.slash = prefs.slash = e.target.checked; savePrefs(); rebuild(); });
  $('resetBtn').addEventListener('click', () => {
    S.set.ops = []; S.set.downShift = 0; S.set.meter = 'auto';
    $('selMeter').value = 'auto';
    rebuild();
  });

  // 마디 누르기 → 그 마디로 이동
  $('chart').addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('.bar');
    if (!el || !S.TL || S.TL.empty) return;
    const bar = S.TL.bars[+el.dataset.i];
    if (bar) player.seek(bar.t0);
  });

  // 개요 파형: 누르거나 끌어서 이동
  const ov = $('overview');
  const posAt = e => { const r = ov.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * player.dur(); };
  ov.addEventListener('pointerdown', e => {
    if (!S.buffer) return;
    S.scrub = posAt(e);
    try { ov.setPointerCapture(e.pointerId); } catch (err) { }
  });
  ov.addEventListener('pointermove', e => { if (S.scrub != null) S.scrub = posAt(e); });
  const endScrub = () => { if (S.scrub == null) return; const t = S.scrub; S.scrub = null; player.seek(t); };
  ov.addEventListener('pointerup', endScrub);
  ov.addEventListener('pointercancel', () => { S.scrub = null; });

  $('copyBtn').addEventListener('click', async () => {
    const txt = $('txt').value;
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; }
    catch (e) { try { $('txt').focus(); $('txt').select(); ok = document.execCommand('copy'); } catch (e2) { ok = false; } }
    $('copied').textContent = ok ? '복사했습니다' : '복사하지 못했습니다. 텍스트를 직접 선택해 복사해 주세요.';
    setTimeout(() => { $('copied').textContent = ''; }, 2500);
  });

  // 단축키 (한글 입력 상태에서도 되도록 e.code 사용)
  document.addEventListener('keydown', e => {
    if (!S.buffer || $('app').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
    const activating = e.code === 'Space' || e.key === ' ' || e.key === 'Enter';
    if (/^(BUTTON|SUMMARY|LABEL)$/.test(tag) && activating) return;   // 버튼 기본 동작 존중
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); player.toggle(); }
    else if (e.code === 'KeyM') { toggleMetro(); }
    else if (e.code === 'KeyP') { togglePiano(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); jumpBar(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); jumpBar(-1); }
    else if (e.key === 'Home') { e.preventDefault(); player.seek(0); }
  });

  // 폭이 바뀌면 차트 다시 배치(한 줄 마디 수, 글자 크기)
  let rsTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(() => {
      if (!S.TL || $('app').hidden) return;
      drawOverview();
      if (Math.abs($('chart').clientWidth - S.width) > 30) { renderChart(); S.cur.bar = -1; S.cur.beat = -1; }
    }, 150);
  });
  onMq(narrow, () => { if (S.TL && !$('app').hidden) { renderChart(); S.cur.bar = -1; S.cur.beat = -1; } });
  document.addEventListener('visibilitychange', () => { if (player.playing) player.schedule(); });

  if (!AC) showError('이 브라우저는 Web Audio API를 지원하지 않아 사용할 수 없습니다.');
  requestAnimationFrame(frame);
})();
