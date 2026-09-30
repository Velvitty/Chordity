/* =====================================================================
 *  Chordity 엔진: 마디별 코드 인식 — 순수 JavaScript (외부 라이브러리 없음)
 *  흐름: 리샘플링 → 리듬 특징(대역별 스펙트럴 플럭스) → 템포(ACF 콤 + 사전분포)
 *        → DP 비트 추적 → 정박/엇박 위상 검증 → 피크 기반 크로마(튜닝 보정)
 *        → 박자·다운비트(HMM) → 코드(HMM, 전위 포함) → 마디 구성
 * ===================================================================== */
const Engine = (function () {
  'use strict';

  const TAU = Math.PI * 2;
  const ANA_SR = 22050;            // 리듬 분석 샘플레이트
  const HAR_SR = 11025;            // 화성 분석 샘플레이트
  const R_N = 1024, R_HOP = 256;   // 리듬 STFT: 46 ms 창, 11.6 ms 홉
  const FPS = ANA_SR / R_HOP;      // 리듬 프레임률 ≈ 86.13 fps
  const CALIB_SEC = 0.0065;        // 온셋 검출 지연 보정(초): 합성 타악기 기준 검출 정점이 6~7 ms 앞섬

  // ---------------------------------------------------------------
  // 공통 유틸
  // ---------------------------------------------------------------
  const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  // 제어권 양보: 백그라운드 탭에서 setTimeout 은 1초 단위로 늦춰지므로 MessageChannel 사용
  const nextTick = (() => {
    if (typeof setImmediate === 'function') return () => new Promise(r => setImmediate(r));   // Node(테스트)
    if (typeof MessageChannel !== 'undefined') {
      const ch = new MessageChannel(), q = [];
      ch.port1.onmessage = () => { const f = q.shift(); if (f) f(); };
      return () => new Promise(r => { q.push(r); ch.port2.postMessage(0); });
    }
    return () => new Promise(r => setTimeout(r, 0));
  })();

  // 진행률 보고 + 주기적으로 제어권 양보(UI 멈춤 방지)
  function makeTicker(onProgress) {
    let last = nowMs();
    const tick = async (frac) => {
      const t = nowMs();
      if (t - last >= 32) {
        if (onProgress) onProgress(Math.min(1, Math.max(0, frac)));
        await nextTick();
        last = nowMs();
      }
    };
    tick.force = async (frac, label) => {
      if (onProgress) onProgress(Math.min(1, Math.max(0, frac)), label);
      await nextTick();
      last = nowMs();
    };
    return tick;
  }

  function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function stdev(a) {
    const m = mean(a); let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - m; s += d * d; }
    return Math.sqrt(s / Math.max(1, a.length - 1));
  }
  function median(a) {
    if (!a.length) return 0;
    const b = Float64Array.from(a).sort();
    const h = b.length >> 1;
    return b.length % 2 ? b[h] : 0.5 * (b[h - 1] + b[h]);
  }
  function quantile(a, q) {
    if (!a.length) return 0;
    const b = Float64Array.from(a).sort();
    const pos = Math.min(b.length - 1, Math.max(0, q * (b.length - 1)));
    const i = Math.floor(pos), f = pos - i;
    return i + 1 < b.length ? b[i] * (1 - f) + b[i + 1] * f : b[i];
  }
  // 평균 0, 표준편차 1 로 정규화 (분산이 0이면 0 배열)
  function standardize(a) {
    const m = mean(a), s = stdev(a);
    const o = new Float64Array(a.length);
    if (!(s > 1e-12)) return o;
    for (let i = 0; i < a.length; i++) o[i] = (a[i] - m) / s;
    return o;
  }
  function hannWin(N) {
    const w = new Float64Array(N);
    for (let n = 0; n < N; n++) w[n] = 0.5 - 0.5 * Math.cos(TAU * n / N);
    return w;
  }
  // 배열의 frame 위치 주변(±rad) 최대값
  function sampleMax(arr, frame, rad) {
    const c = Math.round(frame); let v = 0;
    for (let k = c - rad; k <= c + rad; k++) if (k >= 0 && k < arr.length && arr[k] > v) v = arr[k];
    return v;
  }
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const timeToFrame = t => (t - CALIB_SEC) * FPS;
  const frameToTime = f => f / FPS + CALIB_SEC;

  // ---------------------------------------------------------------
  // 실수 FFT: N 실수 → N/2 복소 FFT + 후처리 (크기 스펙트럼만 반환)
  // ---------------------------------------------------------------
  function makeRealFFT(N) {
    const M = N >> 1;
    let levels = 0; while ((1 << levels) < M) levels++;
    const rev = new Uint32Array(M);
    for (let i = 0; i < M; i++) {
      let r = 0, v = i;
      for (let b = 0; b < levels; b++) { r = (r << 1) | (v & 1); v >>= 1; }
      rev[i] = r;
    }
    const cs = new Float64Array(M >> 1), sn = new Float64Array(M >> 1);
    for (let i = 0; i < (M >> 1); i++) { cs[i] = Math.cos(TAU * i / M); sn[i] = Math.sin(TAU * i / M); }
    const cN = new Float64Array(M + 1), sN = new Float64Array(M + 1);
    for (let k = 0; k <= M; k++) { cN[k] = Math.cos(TAU * k / N); sN[k] = Math.sin(TAU * k / N); }
    const re = new Float64Array(M), im = new Float64Array(M);

    return function (x, mag) {
      // 짝/홀 샘플을 실수/허수부로 묶고 비트 역순 배치
      for (let m = 0; m < M; m++) { const j = rev[m]; re[j] = x[2 * m]; im[j] = x[2 * m + 1]; }
      // 반복형 radix-2 DIT
      for (let size = 2; size <= M; size <<= 1) {
        const half = size >> 1, step = M / size;
        for (let i = 0; i < M; i += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const a = i + j, b = a + half;
            const c = cs[k], s = sn[k];
            const tr = re[b] * c + im[b] * s;
            const ti = im[b] * c - re[b] * s;
            re[b] = re[a] - tr; im[b] = im[a] - ti;
            re[a] += tr; im[a] += ti;
          }
        }
      }
      // 후처리: X[k] = Fe[k] + W^k · Fo[k]
      for (let k = 0; k <= M; k++) {
        const k1 = k === M ? 0 : k, k2 = k === 0 ? 0 : M - k;
        const a = re[k1], b = im[k1], c = re[k2], d = im[k2];
        const feR = 0.5 * (a + c), feI = 0.5 * (b - d);
        const foR = 0.5 * (b + d), foI = -0.5 * (a - c);
        const cc = cN[k], ss = sN[k];
        const xr = feR + cc * foR + ss * foI;
        const xi = feI + cc * foI - ss * foR;
        mag[k] = Math.sqrt(xr * xr + xi * xi);
      }
    };
  }

  // ---------------------------------------------------------------
  // 리샘플러: 블랙맨 창 싱크, 폴리페이즈, 대칭 커널(지연 0)
  // 재생 버퍼와 분석 신호의 시간축이 정확히 일치하도록 직접 구현
  // ---------------------------------------------------------------
  function gcdInt(a, b) {
    a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }
  async function resample(x, srIn, srOut, tick, p0, p1) {
    if (Math.round(srIn) === Math.round(srOut)) return Float32Array.from(x);
    const g = gcdInt(srIn, srOut);
    const L = Math.round(srOut / g), D = Math.round(srIn / g);
    const ratio = srOut / srIn;
    const fc = 0.5 * Math.min(1, ratio) * 0.92;   // 차단 주파수(입력 샘플 기준)
    const W = Math.ceil(10 / (2 * fc));             // 싱크 영점 10개 분량의 반폭
    const taps = 2 * W;
    const P = Math.min(L, 4096);                    // 위상 테이블 크기
    const ker = new Float32Array(P * taps);
    for (let p = 0; p < P; p++) {
      const frac = p / P;
      for (let j = 0; j < taps; j++) {
        const u = frac + W - 1 - j;                  // 출력 시각 − 입력 샘플 위치
        const xx = 2 * fc * u;
        const s = Math.abs(xx) < 1e-12 ? 1 : Math.sin(Math.PI * xx) / (Math.PI * xx);
        const r = u / (W + 1);
        const w = Math.abs(r) >= 1 ? 0 : 0.42 + 0.5 * Math.cos(Math.PI * r) + 0.08 * Math.cos(TAU * r);
        ker[p * taps + j] = 2 * fc * s * w;
      }
    }
    const nOut = Math.floor((x.length - 1) * ratio) + 1;
    const y = new Float32Array(nOut);
    const Dq = Math.floor(D / L), Dr = D % L, nx = x.length;
    let i0 = 0, rem = 0;
    for (let n = 0; n < nOut; n++) {
      const p = P === L ? rem : Math.floor(rem * P / L);
      const kb = p * taps, k = i0 - W + 1;
      let acc = 0;
      if (k >= 0 && k + taps <= nx) {
        for (let j = 0; j < taps; j++) acc += x[k + j] * ker[kb + j];
      } else {
        for (let j = 0; j < taps; j++) { const kk = k + j; if (kk >= 0 && kk < nx) acc += x[kk] * ker[kb + j]; }
      }
      y[n] = acc;
      i0 += Dq; rem += Dr;
      if (rem >= L) { rem -= L; i0++; }
      if ((n & 32767) === 0) await tick(p0 + (p1 - p0) * n / nOut);
    }
    return y;
  }

  // ---------------------------------------------------------------
  // 리듬 특징: 저/중/고 대역별 로그 스펙트럴 플럭스 + 프레임 RMS
  // ---------------------------------------------------------------
  async function rhythmFeatures(x, tick, p0, p1) {
    const N = R_N, hop = R_HOP, H = N >> 1;
    const fft = makeRealFFT(N), win = hannWin(N);
    const nF = Math.floor(x.length / hop) + 1;
    const binHz = ANA_SR / N;
    const k0 = 1;                                        // ≈ 21 Hz
    const kL = Math.round(200 / binHz);                  // 저역: 킥·베이스
    const kM = Math.round(2500 / binHz);                 // 중역: 스네어·화성 악기
    const k1 = Math.min(H - 2, Math.round(10000 / binHz)); // 고역: 하이햇
    const fl = new Float32Array(nF), fm = new Float32Array(nF), fh = new Float32Array(nF), rms = new Float32Array(nF);
    const frame = new Float64Array(N), mag = new Float64Array(H + 1);
    const LAG = 2;                                       // 창 겹침 50%에 해당하는 비교 간격
    const ring = [new Float64Array(H + 1), new Float64Array(H + 1), new Float64Array(H + 1)];
    const sc = 1000 * 4 / N;                             // 사인 진폭 정규화 × 로그 압축 계수
    const nx = x.length;
    for (let t = 0; t < nF; t++) {
      const c = t * hop, base = c - H;
      if (base >= 0 && base + N <= nx) for (let n = 0; n < N; n++) frame[n] = x[base + n] * win[n];
      else for (let n = 0; n < N; n++) { const i = base + n; frame[n] = (i >= 0 && i < nx) ? x[i] * win[n] : 0; }
      let e = 0, ce = 0;
      const ea = Math.max(0, c - (hop >> 1)), eb = Math.min(nx, c + (hop >> 1));
      for (let i = ea; i < eb; i++) { e += x[i] * x[i]; ce++; }
      rms[t] = ce ? Math.sqrt(e / ce) : 0;
      fft(frame, mag);
      const cur = ring[t % 3];
      for (let k = 0; k <= k1 + 1; k++) cur[k] = Math.log(1 + sc * mag[k]);
      if (t >= LAG) {
        const prev = ring[(t - LAG) % 3];
        let sl = 0, sm = 0, sh = 0;
        for (let k = k0; k <= k1; k++) {
          // 이전 프레임에 주파수 방향 최대값 필터(비브라토 억제)
          const ref = Math.max(prev[k - 1], prev[k], prev[k + 1]);
          const d = cur[k] - ref;
          if (d > 0) { if (k < kL) sl += d; else if (k < kM) sm += d; else sh += d; }
        }
        const ti = t - 1;                                // 비교 구간의 가운데 프레임에 기록
        fl[ti] = sl / (kL - k0); fm[ti] = sm / (kM - kL); fh[ti] = sh / (k1 - kM + 1);
      }
      if ((t & 255) === 0) await tick(p0 + (p1 - p0) * t / nF);
    }
    return { fl, fm, fh, rms, nF };
  }

  // 비트 추적용 온셋 포락선: 대역별 표준편차로 맞춘 뒤 가중합(고역은 절반 — 엇박 하이햇 억제)
  function onsetEnvelope(R) {
    const n = R.nF;
    const sl = stdev(R.fl) || 1, sm = stdev(R.fm) || 1, sh = stdev(R.fh) || 1;
    const O = new Float64Array(n);
    for (let t = 0; t < n; t++) O[t] = R.fl[t] / sl + R.fm[t] / sm + 0.5 * R.fh[t] / sh;
    return O;
  }

  // ---------------------------------------------------------------
  // 화성 특징: 스펙트럼 피크(포물선 보간) → 튜닝 추정 → 트레블/베이스 크로마
  // ---------------------------------------------------------------
  async function peakSTFT(x, N, hop, fmin, fmax, K, tick, p0, p1) {
    const H = N >> 1, fft = makeRealFFT(N), win = hannWin(N);
    const nF = Math.floor(x.length / hop) + 1;
    const midi = new Float32Array(nF * K), amp = new Float32Array(nF * K), cnt = new Uint8Array(nF);
    const frame = new Float64Array(N), mag = new Float64Array(H + 1), pre = new Float64Array(H + 2);
    const binHz = HAR_SR / N;
    const kmin = Math.max(2, Math.floor(fmin / binHz)), kmax = Math.min(H - 2, Math.ceil(fmax / binHz));
    const scale = 4 / N;
    const topA = new Float64Array(K), topM = new Float64Array(K);
    const nx = x.length, R = 6;
    for (let t = 0; t < nF; t++) {
      const base = t * hop - H;
      if (base >= 0 && base + N <= nx) for (let n = 0; n < N; n++) frame[n] = x[base + n] * win[n];
      else for (let n = 0; n < N; n++) { const i = base + n; frame[n] = (i >= 0 && i < nx) ? x[i] * win[n] : 0; }
      fft(frame, mag);
      let mx = 0;
      for (let k = kmin; k <= kmax; k++) if (mag[k] > mx) mx = mag[k];
      let nTop = 0;
      if (mx > 1e-9) {
        pre[0] = 0;
        for (let k = 0; k <= H; k++) pre[k + 1] = pre[k] + mag[k];
        const thr = mx * 0.0056;                          // 프레임 최대 대비 −45 dB
        for (let k = kmin; k <= kmax; k++) {
          const m = mag[k];
          if (m <= thr || m <= mag[k - 1] || m < mag[k + 1]) continue;
          const lo = Math.max(0, k - R), hi = Math.min(H, k + R);
          if (m < 2.0 * (pre[hi + 1] - pre[lo]) / (hi - lo + 1)) continue; // 주변보다 뚜렷한 피크만
          const a = Math.log(mag[k - 1] + 1e-12), b = Math.log(m + 1e-12), g = Math.log(mag[k + 1] + 1e-12);
          const den = a - 2 * b + g;
          let p = 0;
          if (den < 0) p = Math.max(-0.5, Math.min(0.5, 0.5 * (a - g) / den));
          const f = (k + p) * binHz;
          const A = Math.exp(b - 0.25 * (a - g) * p) * scale;
          const mm = 69 + 12 * Math.log2(f / 440);
          if (nTop < K) { topA[nTop] = A; topM[nTop] = mm; nTop++; }
          else {
            let mi = 0;
            for (let q = 1; q < K; q++) if (topA[q] < topA[mi]) mi = q;
            if (A > topA[mi]) { topA[mi] = A; topM[mi] = mm; }
          }
        }
      }
      cnt[t] = nTop;
      for (let q = 0; q < nTop; q++) { midi[t * K + q] = topM[q]; amp[t * K + q] = topA[q]; }
      if ((t & 31) === 0) await tick(p0 + (p1 - p0) * t / nF);
    }
    return { nF, K, midi, amp, cnt };
  }

  // 기준음 편차(반음 단위): 피크 음높이의 소수부를 원형 평균
  function estimateTuning(P) {
    let sx = 0, sy = 0;
    for (let t = 0; t < P.nF; t++) {
      for (let q = 0; q < P.cnt[t]; q++) {
        const m = P.midi[t * P.K + q];
        if (m < 40 || m > 90) continue;
        const a = Math.sqrt(P.amp[t * P.K + q]);
        const d = m - Math.round(m);
        sx += a * Math.cos(TAU * d); sy += a * Math.sin(TAU * d);
      }
    }
    return (sx === 0 && sy === 0) ? 0 : Math.atan2(sy, sx) / TAU;
  }

  const TREBLE_W = m => (m < 48 || m > 96) ? 0 : (m < 55 ? (m - 48) / 7 : (m <= 84 ? 1 : (96 - m) / 12));
  const BASS_W = m => (m < 28 || m > 57) ? 0 : (m < 33 ? (m - 28) / 5 : (m <= 48 ? 1 : (57 - m) / 9));

  // 피크 목록 → 12음 크로마 (음정이 맞을수록 가중치 큼: cos²)
  function chromaFromPeaks(P, tuning, wfn) {
    const C = new Float32Array(P.nF * 12);
    for (let t = 0; t < P.nF; t++) {
      for (let q = 0; q < P.cnt[t]; q++) {
        const m = P.midi[t * P.K + q] - tuning;
        const w = wfn(m);
        if (w <= 0) continue;
        const r = Math.round(m), c = Math.cos(Math.PI * (m - r));
        C[t * 12 + (((r % 12) + 12) % 12)] += P.amp[t * P.K + q] * w * c * c;
      }
    }
    return C;
  }

  async function harmonyFeatures(x, tick, p0, p1) {
    const pm = p0 + (p1 - p0) * 0.45;
    const B = await peakSTFT(x, 4096, 512, 32, 1400, 24, tick, p0, pm);   // 주파수 해상도 우선(베이스·튜닝)
    const T = await peakSTFT(x, 2048, 256, 110, 4200, 36, tick, pm, p1);  // 시간 해상도 우선(트레블)
    const tuning = estimateTuning(B);
    return {
      tuning,
      bass: chromaFromPeaks(B, tuning, BASS_W), hopB: 512 / HAR_SR,
      treble: chromaFromPeaks(T, tuning, TREBLE_W), hopT: 256 / HAR_SR,
    };
  }

  // 화성 변화량(크로마 노벨티)을 리듬 프레임률로 — 위상 검증에 사용
  function chromaNovelty(Hm, nR) {
    const C = Hm.treble, nT = C.length / 12, hop = Hm.hopT;
    const Cn = new Float64Array(nT * 12), en = new Float64Array(nT);
    for (let t = 0; t < nT; t++) {
      let s = 0, q = 0;
      for (let k = 0; k < 12; k++) s += C[t * 12 + k];
      en[t] = s;
      for (let k = 0; k < 12; k++) { const v = Math.sqrt(C[t * 12 + k]); Cn[t * 12 + k] = v; q += v * v; }
      q = Math.sqrt(q) || 1;
      for (let k = 0; k < 12; k++) Cn[t * 12 + k] /= q;
    }
    const eRef = quantile(en, 0.7) || 1e-9;
    const L = 4, nov = new Float64Array(nT);
    const a = new Float64Array(12), b = new Float64Array(12);
    for (let t = L; t + L <= nT; t++) {
      a.fill(0); b.fill(0);
      for (let d = 0; d < L; d++) for (let k = 0; k < 12; k++) { a[k] += Cn[(t + d) * 12 + k]; b[k] += Cn[(t - 1 - d) * 12 + k]; }
      let ab = 0, aa = 0, bb = 0;
      for (let k = 0; k < 12; k++) { ab += a[k] * b[k]; aa += a[k] * a[k]; bb += b[k] * b[k]; }
      const cos = ab / (Math.sqrt(aa * bb) + 1e-12);
      const w = Math.min(1, Math.sqrt(Math.min(en[t], en[t - 1]) / eRef));
      nov[t] = Math.max(0, 1 - cos) * w;
    }
    const out = new Float64Array(nR);
    for (let r = 0; r < nR; r++) {
      const xx = (r / FPS) / hop + 0.5;               // nov[t] 는 (t−½)·hop 시각의 변화
      const i = Math.floor(xx), f = xx - i;
      if (i >= 0 && i + 1 < nT) out[r] = nov[i] * (1 - f) + nov[i + 1] * f;
    }
    return out;
  }

  // ---------------------------------------------------------------
  // 템포: 음량 평준화한 온셋의 자기상관 → 배수 지연 콤 점수 × 로그정규 사전분포
  // ---------------------------------------------------------------
  function estimateTempo(O) {
    const n = O.length;
    const w = Math.round(3 * FPS);
    const cs = new Float64Array(n + 1);
    for (let t = 0; t < n; t++) cs[t + 1] = cs[t] + O[t] * O[t];
    const E = new Float64Array(n);
    let mu = 0;
    for (let t = 0; t < n; t++) {
      const a = Math.max(0, t - w), b = Math.min(n, t + w + 1);
      E[t] = O[t] / (Math.sqrt((cs[b] - cs[a]) / (b - a)) + 1e-9);
      mu += E[t];
    }
    mu /= n;
    for (let t = 0; t < n; t++) E[t] -= mu;
    const maxLag = Math.max(8, Math.min(n - 2, Math.ceil(FPS * 60 / 40 * 4.3)));
    const r = new Float64Array(maxLag + 2);
    for (let lag = 0; lag <= maxLag + 1; lag++) {
      let s = 0;
      for (let t = 0; t + lag < n; t++) s += E[t] * E[t + lag];
      r[lag] = s / Math.max(1, n - lag);
    }
    const r0 = r[0] || 1;
    const rs = new Float64Array(r.length);
    for (let i = 0; i < r.length; i++) rs[i] = (0.25 * r[Math.max(0, i - 1)] + 0.5 * r[i] + 0.25 * r[Math.min(r.length - 1, i + 1)]) / r0;
    const interp = xx => { const i = Math.floor(xx), f = xx - i; return i + 1 >= rs.length ? rs[rs.length - 1] : rs[i] * (1 - f) + rs[i + 1] * f; };
    const peakNear = (xx, tol) => { let b = -Infinity; for (let d = -tol; d <= tol + 1e-9; d += 0.25) { const v = interp(xx + d); if (v > b) b = v; } return b; };
    const CW = [1, 0.5, 0.33, 0.25];
    const bpms = [], sc = [];
    for (let bpm = 40; bpm <= 240.0001; bpm += 0.25) {
      const tau = 60 * FPS / bpm;
      let s = 0;
      for (let k = 1; k <= 4; k++) {
        const L = k * tau;
        if (L > maxLag) break;
        s += CW[k - 1] * peakNear(L, k === 1 ? 0.5 : 0.5 + 0.004 * L);
      }
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 110), 2));
      bpms.push(bpm); sc.push(Math.max(0, s) * prior);
    }
    let bi = 0;
    for (let i = 1; i < sc.length; i++) if (sc[i] > sc[bi]) bi = i;
    let bpm = bpms[bi];
    if (bi > 0 && bi < sc.length - 1) {
      const a = sc[bi - 1], b = sc[bi], c = sc[bi + 1], den = a - 2 * b + c;
      if (den < 0) bpm += 0.25 * 0.5 * (a - c) / den;
    }
    // 보고용 상위 후보
    const peaks = [];
    for (let i = 1; i < sc.length - 1; i++) if (sc[i] > sc[i - 1] && sc[i] >= sc[i + 1]) peaks.push({ bpm: bpms[i], s: sc[i] });
    peaks.sort((p, q) => q.s - p.s);
    const top = peaks.slice(0, 3).map(p => ({ bpm: p.bpm, rel: sc[bi] > 0 ? p.s / sc[bi] : 0 }));
    return { bpm, tau: 60 * FPS / bpm, cands: top };
  }

  // 국소 템포 곡선: 8초 창마다 자기상관으로 박 주기를 찾고(전체 주기 ±15% 안, 2배 지연도 함께 봄),
  // 7개 창(약 7초) 중앙값으로 필인 같은 순간적 흔들림은 거르고 실제 템포 변화(리타르단도 등)는 따라간다
  function localTempo(O, tau) {
    const n = O.length, W = Math.round(8 * FPS), H = Math.max(1, Math.round(FPS));
    const lo = Math.max(2, Math.floor(tau * 0.85)), hi = Math.ceil(tau * 1.15);
    // 구간 음량으로 평준화한 온셋(평균 제거)
    const w3 = Math.round(3 * FPS), cs = new Float64Array(n + 1), E = new Float64Array(n);
    for (let t = 0; t < n; t++) cs[t + 1] = cs[t] + O[t] * O[t];
    let mu = 0;
    for (let t = 0; t < n; t++) { const a = Math.max(0, t - w3), b = Math.min(n, t + w3 + 1); E[t] = O[t] / (Math.sqrt((cs[b] - cs[a]) / (b - a)) + 1e-9); mu += E[t]; }
    mu /= n; for (let t = 0; t < n; t++) E[t] -= mu;
    const centers = [], est = [];
    for (let c = 0; c < n; c += H) {
      const a = Math.max(0, c - (W >> 1)), b = Math.min(n, c + (W >> 1));
      centers.push(c);
      if (b - a < 3 * hi) { est.push(NaN); continue; }
      const r = lag => { let s = 0; for (let t = a; t + lag < b; t++) s += E[t] * E[t + lag]; return s / (b - a - lag); };
      let bl = -1, bv = -Infinity; const sc = [];
      for (let lag = lo - 1; lag <= hi + 1; lag++) { const v = r(lag) + 0.5 * r(2 * lag); sc.push(v); if (lag >= lo && lag <= hi && v > bv) { bv = v; bl = lag; } }
      const k = bl - (lo - 1), y0 = sc[k - 1], y1 = sc[k], y2 = sc[k + 1], den = y0 - 2 * y1 + y2;
      est.push(bv > 0 ? bl + (den < 0 ? 0.5 * (y0 - y2) / den : 0) : NaN);
    }
    const med = est.map((_, i) => { const w = est.slice(Math.max(0, i - 3), i + 4).filter(v => v === v); return w.length ? median(w) : tau; });
    const curve = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      const x = t / H, i = Math.min(med.length - 2, Math.max(0, Math.floor(x))), f = Math.min(1, Math.max(0, x - i));
      curve[t] = clamp(med[i] * (1 - f) + med[i + 1] * f, tau * 0.85, tau * 1.15);
    }
    return curve;
  }

  // ---------------------------------------------------------------
  // DP 비트 추적 (Ellis 2007): Σ온셋 + 간격 일관성 벌점(log 비율²)을 최대화
  // ---------------------------------------------------------------
  function trackBeats(O, tau, tightness, tauCurve) {
    tightness = tightness || 100;
    const n = O.length;
    const sd = stdev(O) || 1;
    const half = Math.max(1, Math.ceil(tau / 8));
    const g = new Float64Array(2 * half + 1);
    for (let i = -half; i <= half; i++) g[i + half] = Math.exp(-0.5 * Math.pow(i * 32 / tau, 2));
    const ls = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      let s = 0;
      const a = Math.max(-half, -t), b = Math.min(half, n - 1 - t);
      for (let i = a; i <= b; i++) s += O[t + i] * g[i + half];
      ls[t] = s / sd;
    }
    // 간격 벌점: 전체 주기 대신 프레임마다의 국소 주기 τ(i)와 비교(곡선이 없으면 전체 주기)
    let tMin = tau, tMax = tau;
    if (tauCurve) for (let i = 0; i < n; i++) { if (tauCurve[i] < tMin) tMin = tauCurve[i]; if (tauCurve[i] > tMax) tMax = tauCurve[i]; }
    const lo = Math.max(1, Math.round(tMin / 2)), hi = Math.round(2 * tMax);
    const logd = new Float64Array(hi + 1);
    for (let d = 1; d <= hi; d++) logd[d] = Math.log(d);
    const logTauG = Math.log(tau);
    const cum = new Float64Array(n), back = new Int32Array(n).fill(-1);
    let lsMax = 0;
    for (let t = 0; t < n; t++) if (ls[t] > lsMax) lsMax = ls[t];
    let first = true;
    for (let i = 0; i < n; i++) {
      let best = -Infinity, bj = -1;
      const lt = tauCurve ? Math.log(tauCurve[i]) : logTauG;
      const dlo = Math.max(lo, Math.round(Math.exp(lt) / 2)), dhi = Math.min(hi, Math.round(2 * Math.exp(lt)));
      for (let d = dlo; d <= dhi; d++) {
        const j = i - d, dv = logd[d] - lt;
        const v = (j >= 0 ? cum[j] : 0) - tightness * dv * dv;
        if (v > best) { best = v; bj = j; }
      }
      cum[i] = ls[i] + best;
      if (first && ls[i] < 0.01 * lsMax) back[i] = -1;
      else { back[i] = bj; first = false; }
    }
    // 마지막 비트: 누적 점수 국소최대 중 (중앙값/2) 을 넘는 마지막 지점
    const mx = [];
    for (let i = 1; i < n - 1; i++) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) mx.push(i);
    let last = n - 1;
    if (mx.length) {
      const med = median(mx.map(i => cum[i]));
      for (let q = mx.length - 1; q >= 0; q--) if (cum[mx[q]] * 2 > med) { last = mx[q]; break; }
    }
    const beats = [];
    for (let b = last; b >= 0; b = back[b]) beats.push(b);
    beats.reverse();
    // 앞뒤의 약한 비트 제거
    if (beats.length > 4) {
      const v = beats.map(i => ls[i]);
      const sm = v.map((_, i) => 0.5 * (i > 0 ? v[i - 1] : 0) + v[i] + 0.5 * (i + 1 < v.length ? v[i + 1] : 0));
      const thr = 0.5 * Math.sqrt(mean(sm.map(z => z * z)));
      let a = 0; while (a < sm.length && sm[a] <= thr) a++;
      let z = sm.length - 1; while (z >= 0 && sm[z] <= thr) z--;
      if (z - a >= 3) return beats.slice(a, z + 1);
    }
    return beats;
  }

  // 비트를 가까운(±2프레임) 온셋 정점으로 정밀화 + 포물선 보간.
  // 온셋이 약한 비트는 주변 강한 비트의 국소 선형회귀로 채움.
  function refineFrames(frames, O) {
    const n = frames.length;
    const pos = new Float64Array(n), ok = new Uint8Array(n);
    const str = new Float64Array(n);
    for (let i = 0; i < n; i++) str[i] = sampleMax(O, frames[i], 2);
    const medS = median(str) || 1e-9;
    for (let i = 0; i < n; i++) {
      const b = Math.round(frames[i]);
      let j = Math.min(O.length - 1, Math.max(0, b)), v = O[j] || 0;
      for (let d = -2; d <= 2; d++) { const k = b + d; if (k > 0 && k < O.length - 1 && O[k] > v) { v = O[k]; j = k; } }
      let p = 0;
      if (j > 0 && j < O.length - 1) {
        const a = O[j - 1], c = O[j + 1], den = a - 2 * v + c;
        if (den < 0) p = Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den));
      }
      pos[i] = j + p;
      ok[i] = v >= 0.35 * medS ? 1 : 0;
    }
    for (let i = 0; i < n; i++) {
      if (ok[i]) continue;
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, cntN = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) {
        if (!ok[j] || j === i) continue;
        const w = 1 / (1 + Math.abs(j - i));
        sw += w; sx += w * j; sy += w * pos[j]; sxx += w * j * j; sxy += w * j * pos[j]; cntN++;
      }
      const den = sw * sxx - sx * sx;
      if (cntN >= 2 && Math.abs(den) > 1e-9) {
        const bb = (sw * sxy - sx * sy) / den, aa = (sy - bb * sx) / sw;
        pos[i] = aa + bb * i;
      } else pos[i] = frames[i];
    }
    return pos;
  }
  function snapTimes(times, O) {
    const fr = Array.from(times, timeToFrame);
    return Float64Array.from(refineFrames(fr, O), frameToTime);
  }

  // 소리가 나는 전 구간을 덮도록 앞뒤로 비트 외삽
  function extendBeats(b, startT, endT) {
    const a = Array.from(b);
    if (a.length < 3) return Float64Array.from(a);
    const iv = [];
    for (let i = 1; i < a.length; i++) iv.push(a[i] - a[i - 1]);
    const pH = median(iv.slice(0, 8)), pT = median(iv.slice(-8));
    while (a[0] - pH >= Math.max(0, startT - 0.25 * pH)) a.unshift(a[0] - pH);
    // 끝쪽: 새 박 뒤로 최소 반 박 이상 소리가 남아 있을 때만(마지막 화음의 잔향 꼬리에 1박짜리 마디가 생기지 않게)
    while (a[a.length - 1] + pT <= endT - 0.5 * pT) a.push(a[a.length - 1] + pT);
    return Float64Array.from(a);
  }

  // 정박 판정용 강세 곡선: 저역(킥·베이스) + 중역(스네어) + 화성 변화, 고역은 거의 무시
  function beatSalience(A) {
    const n = A.nF;
    const nrm = arr => {
      let s = 0, c = 0;
      for (let i = 0; i < n; i++) if (A.audible[i]) { s += arr[i]; c++; }
      const m = c ? s / c : 1;
      return m > 1e-12 ? m : 1;
    };
    const ml = nrm(A.fl), mm = nrm(A.fm), mh = nrm(A.fh), mn = nrm(A.nov);
    const S = new Float64Array(n);
    for (let i = 0; i < n; i++) S[i] = 1.0 * A.fl[i] / ml + 0.7 * A.fm[i] / mm + 0.2 * A.fh[i] / mh + 0.8 * A.nov[i] / mn;
    return S;
  }
  // 비트 위치 vs 비트 사이 중간(½박) 위치의 평균 강세
  function phaseScores(beats, S) {
    let on = 0, off = 0, c = 0;
    for (let i = 0; i + 1 < beats.length; i++) {
      on += sampleMax(S, timeToFrame(beats[i]), 2);
      off += sampleMax(S, timeToFrame(0.5 * (beats[i] + beats[i + 1])), 2);
      c++;
    }
    return { on: on / Math.max(1, c), off: off / Math.max(1, c) };
  }
  function midpoints(b, dur) {
    const n = b.length, out = [];
    if (n < 2) return Float64Array.from(b);
    const p0 = b[1] - b[0];
    if (b[0] - p0 / 2 >= 0) out.push(b[0] - p0 / 2);
    for (let i = 0; i + 1 < n; i++) out.push(0.5 * (b[i] + b[i + 1]));
    const pl = b[n - 1] - b[n - 2];
    if (b[n - 1] + pl / 2 <= dur) out.push(b[n - 1] + pl / 2);
    return Float64Array.from(out);
  }

  // 드럼 층 곡선: 킥(저역) + 스네어(중역·고역이 동시에 오르는 광대역 성분).
  // 화성 악기의 음(좁은 대역)이나 하이햇(고역만)은 기하평균이라 작게 반영된다.
  function drumLayer(A) {
    const n = A.nF, sl = stdev(A.fl) || 1, sm = stdev(A.fm) || 1, sh = stdev(A.fh) || 1;
    const K = new Float64Array(n), Sn = new Float64Array(n);
    for (let i = 0; i < n; i++) { K[i] = A.fl[i] / sl; Sn[i] = Math.sqrt((A.fm[i] / sm) * (A.fh[i] / sh)); }
    return { K, Sn };
  }

  // 박 단계 검증
  //  · 두 배로 잡힘(8분음표를 박으로): 짝/홀 비트의 드럼 층 세기가 크게 비대칭 → 강한 쪽만 남김
  //  · 절반으로 잡힘: 비트엔 킥, 비트 사이 중간엔 스네어가 규칙적으로 옴 → 중간점 추가
  //  잘못 두 배로 늘리면 엇박 클릭이 생기므로 늘리는 쪽 조건을 훨씬 엄격하게 둔다.
  function levelCheck(A, beats) {
    const n = beats.length;
    const iv = [];
    for (let i = 1; i < n; i++) iv.push(beats[i] - beats[i - 1]);
    const bpm = n > 1 ? 60 / median(iv) : 0;
    const info = { bpm, r2: 1, snareMidOn: 0, kickOnMid: 0, action: 'none' };
    if (n < 16) return { beats, info };
    const { K, Sn } = A.drum;
    let e = 0, o = 0, ce = 0, co = 0, sOn = 0, sMid = 0, kOn = 0, kMid = 0;
    const kp = [0, 0], sp = [0, 0], np = [0, 0];            // 짝/홀 박의 킥, 스네어, 화성 변화 합
    for (let i = 0; i < n; i++) {
      const f = timeToFrame(beats[i]);
      const p = sampleMax(K, f, 2) + sampleMax(Sn, f, 2) + 0.5 * sampleMax(A.S, f, 2);
      kp[i % 2] += sampleMax(K, f, 2); sp[i % 2] += sampleMax(Sn, f, 2); np[i % 2] += sampleMax(A.nov, f, 2);
      if (i % 2) { o += p; co++; } else { e += p; ce++; }
      if (i + 1 < n) {
        const fm = timeToFrame(0.5 * (beats[i] + beats[i + 1]));
        sOn += sampleMax(Sn, f, 2); sMid += sampleMax(Sn, fm, 2);
        kOn += sampleMax(K, f, 2); kMid += sampleMax(K, fm, 2);
      }
    }
    e /= Math.max(1, ce); o /= Math.max(1, co);
    info.r2 = Math.max(e, o) / Math.max(1e-9, Math.min(e, o));
    info.snareMidOn = sMid / Math.max(1e-9, sOn);
    info.kickOnMid = kOn / Math.max(1e-9, kMid);
    // 같은 쪽 치우침: 킥이 강한 쪽을 +로 두고, 스네어와 화성 변화도 그쪽에 몰리는지.
    // 제 박에서는 백비트 때문에 스네어가 킥의 반대쪽(음수), 두 배로 잡히면 둘 다 같은 쪽(양수)에 온다
    const skew = (a) => (a[0] - a[1]) / (a[0] + a[1] + 1e-12);
    const sg = kp[0] >= kp[1] ? 1 : -1;
    info.dK = sg * skew(kp); info.dSn = sg * skew(sp); info.dNov = sg * skew(np);
    const sameSide = info.dK >= 0.15 && info.dSn >= 0.15 && info.dNov > 0 && info.r2 >= 1.3;
    if ((info.r2 >= 2.4 || sameSide) && bpm >= 110 && bpm / 2 >= 55) {
      const keep = e >= o ? 0 : 1;
      info.action = 'halve';
      return { beats: beats.filter((_, i) => i % 2 === keep), info };
    }
    if (bpm <= 100 && bpm * 2 <= 210 && info.snareMidOn >= 1.3 && info.kickOnMid >= 2) {
      info.action = 'double';
      return { beats: doubleBeats(beats, A), info };
    }
    return { beats, info };
  }

  // 한 박 내부의 온셋 분포 → 2분할(보통)인지 3분할(셋잇단·복합박자)인지
  function subdivision(beats, O) {
    const NB = 24, prof = new Float64Array(NB);
    let cnt = 0;
    for (let i = 0; i + 1 < beats.length; i++) {
      const f0 = timeToFrame(beats[i]), f1 = timeToFrame(beats[i + 1]);
      if (f1 - f0 < 6) continue;
      for (let k = 0; k < NB; k++) prof[k] += sampleMax(O, f0 + (f1 - f0) * k / NB, 1);
      cnt++;
    }
    if (!cnt) return { triple: false, d2: 0, d3: 0 };
    for (let k = 0; k < NB; k++) prof[k] /= cnt;
    const at = ph => { const k = Math.round(ph * NB) % NB; return Math.max(prof[(k + NB - 1) % NB], prof[k], prof[(k + 1) % NB]); };
    const d2 = at(0.5), d3a = at(1 / 3), d3b = at(2 / 3);
    const base = median(prof);
    const triple = Math.min(d3a, d3b) > 1.15 * d2 && 0.5 * (d3a + d3b) > 1.1 * base;
    return { triple, d2, d3: 0.5 * (d3a + d3b), base };
  }

  // ---------------------------------------------------------------
  // 1단계 분석(무거운 부분): 신호 → 특징 → 자동 비트
  // ---------------------------------------------------------------
  async function analyze(input, onProgress) {
    const tStart = nowMs();
    const tick = makeTicker(onProgress);
    const chans = input.channels, srIn = input.sampleRate;
    const len = chans[0].length, duration = len / srIn;
    await tick.force(0.005, '신호 준비');
    const mono = new Float32Array(len);
    const inv = 1 / chans.length;
    for (const ch of chans) for (let i = 0; i < len; i++) mono[i] += ch[i] * inv;

    await tick.force(0.01, '리샘플링');
    const x22 = await resample(mono, srIn, ANA_SR, tick, 0.01, 0.12);
    const x11 = await resample(x22, ANA_SR, HAR_SR, tick, 0.12, 0.17);
    let pk = 0;
    for (let i = 0; i < x22.length; i++) { const v = Math.abs(x22[i]); if (v > pk) pk = v; }
    if (pk > 1e-9) {
      const g = 1 / pk;
      for (let i = 0; i < x22.length; i++) x22[i] *= g;
      for (let i = 0; i < x11.length; i++) x11[i] *= g;
    }

    await tick.force(0.17, '리듬 특징 추출');
    const R = await rhythmFeatures(x22, tick, 0.17, 0.42);
    await tick.force(0.42, '화성 특징 추출');
    const Hm = await harmonyFeatures(x11, tick, 0.42, 0.86);

    await tick.force(0.87, '템포 추정');
    const O = onsetEnvelope(R);
    const nov = chromaNovelty(Hm, R.nF);
    // 소리 나는 구간(곡 상위 음량 대비 −38 dB 이상, 0.2초 평활)
    const ref = quantile(R.rms, 0.95) || 1e-9;
    const audible = new Uint8Array(R.nF);
    const sw = Math.round(0.1 * FPS);
    for (let t = 0; t < R.nF; t++) {
      let s = 0, c = 0;
      for (let k = Math.max(0, t - sw); k <= Math.min(R.nF - 1, t + sw); k++) { s += R.rms[k]; c++; }
      audible[t] = 20 * Math.log10(s / c / ref + 1e-12) > -38 ? 1 : 0;
    }
    let fA = 0; while (fA < R.nF && !audible[fA]) fA++;
    let fB = R.nF - 1; while (fB > 0 && !audible[fB]) fB--;
    const startT = fA / FPS, endT = Math.min(duration, fB / FPS);

    const tempo = estimateTempo(O);
    const A = {
      duration, sampleRate: srIn, fps: FPS, nF: R.nF,
      fl: R.fl, fm: R.fm, fh: R.fh, rms: R.rms, O, nov, audible, startT, endT,
      harm: Hm, tempo,
    };
    A.S = beatSalience(A);
    A.drum = drumLayer(A);
    // 주어진 박 주기(프레임)로 DP 추적 → 정밀화 → 소리 구간으로 정리·연장
    const trackAt = tauF => {
      // 간격 벌점을 절대 시간(ms) 기준으로: α = k·τ²(초) → 같은 ms 흔들림엔 같은 벌점. 국소 템포를 따르므로 단단해도 됨
      const tight = clamp(P.TIGHT_K * Math.pow(tauF / FPS, 2), 100, 1600);
      const curve = P.LOCAL_TEMPO ? localTempo(O, tauF) : null;
      let b = Float64Array.from(refineFrames(trackBeats(O, tauF, tight, curve), O), frameToTime);
      const per = tauF / FPS;
      const inside = Array.from(b).filter(t => t >= startT - 0.25 * per && t <= endT + 0.25 * per);
      return (fA < fB && inside.length >= 4) ? extendBeats(Float64Array.from(inside), startT, endT) : new Float64Array(0);
    };
    // 정박/엇박 위상 검증: ½박 옮긴 격자가 뚜렷하게 더 강하면 교정
    const phaseFix = b => {
      const ps = phaseScores(b, A.S);
      let flipped = false;
      if (b.length >= 8 && ps.off > ps.on * 1.1) {
        const perF = b[1] - b[0];
        b = extendBeats(snapTimes(midpoints(b, duration), O).filter(t => t >= startT - 0.25 * perF), startT, endT);
        flipped = true;
      }
      return { beats: b, on: ps.on, off: ps.off, flipped };
    };
    await tick.force(0.92, '비트 추적');
    let ph = phaseFix(trackAt(tempo.tau));
    let beats = ph.beats;
    A.beatsTracked = beats;                      // 박 단계 검증 전 비트(진단용)
    // 박 단계(두 배/절반) 검증 → 절반이면 비트를 솎아 내지 않고 새 박 주기로 다시 추적
    // (8분음표 단계 추적이 곡 중간에 한 칸 미끄러지면 솎아 낸 비트가 그 뒤로 엇박이 되므로)
    await tick.force(0.95, '박 단계 검증');
    const lv = levelCheck(A, beats);
    if (lv.info.action === 'halve') { ph = phaseFix(trackAt(tempo.tau * 2)); beats = ph.beats; }
    else if (lv.info.action === 'double') { ph = phaseFix(lv.beats.length >= 4 ? extendBeats(lv.beats, startT, endT) : lv.beats); beats = ph.beats; }
    A.phase = { on: ph.on, off: ph.off, flipped: ph.flipped };
    A.level = lv.info;
    A.beats = beats;
    A.elapsed = (nowMs() - tStart) / 1000;
    await tick.force(1, '완료');
    return A;
  }

  // ---------------------------------------------------------------
  // 사용자 보정 연산 (템포 단계·½박 이동)
  // ---------------------------------------------------------------
  function keepEvery(b, k, A) {
    let best = -Infinity, ph = 0;
    for (let p = 0; p < k; p++) {
      let s = 0, c = 0;
      for (let i = p; i < b.length; i += k) { s += sampleMax(A.S, timeToFrame(b[i]), 2); c++; }
      s /= Math.max(1, c);
      if (s > best) { best = s; ph = p; }
    }
    return b.filter((_, i) => i % k === ph);
  }
  function doubleBeats(b, A) {
    const n = b.length, out = [];
    for (let i = 0; i < n; i++) {
      out.push(b[i]);
      if (i + 1 < n) out.push(0.5 * (b[i] + b[i + 1]));
      else if (n > 1 && b[i] + 0.5 * (b[i] - b[i - 1]) <= A.duration) out.push(b[i] + 0.5 * (b[i] - b[i - 1]));
    }
    return snapTimes(Float64Array.from(out), A.O);
  }
  function applyOps(A, ops) {
    let b = Float64Array.from(A.beats);
    for (const op of ops || []) {
      if (b.length < 4) break;
      if (op === 'x2') b = doubleBeats(b, A);
      else if (op === 'd2') b = keepEvery(b, 2, A);
      else if (op === 'd3') b = keepEvery(b, 3, A);
      else if (op === 'half') {
        // 반 박 이동 시 앞에 덧붙는 박이 음악 시작 전(무음)에 오지 않도록 자름
        const per = b.length > 1 ? b[1] - b[0] : 0.5;
        b = snapTimes(midpoints(b, A.duration), A.O).filter(t => t >= A.startT - 0.25 * per);
      }
    }
    return b;
  }

  // ---------------------------------------------------------------
  // 비트/슬롯 동기 집계
  // ---------------------------------------------------------------
  // 프레임 크로마를 [t0,t1) 구간별로 가중 평균(구간 가운데일수록 큰 가중치)
  function aggregate(C, hopSec, t0, t1) {
    const nS = t0.length, nF = C.length / 12;
    const out = new Float64Array(nS * 12);
    for (let s = 0; s < nS; s++) {
      const a = t0[s], b = t1[s], L = b - a;
      if (!(L > 0)) continue;
      let j0 = Math.ceil(a / hopSec), j1 = Math.floor(b / hopSec - 1e-9);
      if (j1 < j0) j0 = j1 = Math.round(0.5 * (a + b) / hopSec);
      j0 = Math.max(0, j0); j1 = Math.min(nF - 1, j1);
      let ws = 0;
      for (let j = j0; j <= j1; j++) {
        const u = Math.min(1, Math.max(0, (j * hopSec - a) / L));
        const w = 0.1 + Math.sin(Math.PI * u);
        for (let k = 0; k < 12; k++) out[s * 12 + k] += w * C[j * 12 + k];
        ws += w;
      }
      if (ws > 0) for (let k = 0; k < 12; k++) out[s * 12 + k] /= ws;
    }
    return out;
  }

  // 베이스 크로마에서 곡 전체에 늘 깔린 성분(예: 음정 있는 킥 드럼) 제거:
  // 비트별 중앙값의 절반을 빼서, 코드마다 바뀌는 실제 베이스 음만 남긴다
  function bassFloor(bass) {
    const n = bass.length / 12, med = new Float64Array(12);
    const col = [];
    for (let k = 0; k < 12; k++) {
      col.length = 0;
      for (let i = 0; i < n; i++) col.push(bass[i * 12 + k]);
      med[k] = 0.5 * median(col);
    }
    return med;
  }
  function subFloor(bass, med) {
    const n = bass.length / 12;
    for (let i = 0; i < n; i++) for (let k = 0; k < 12; k++) bass[i * 12 + k] = Math.max(0, bass[i * 12 + k] - med[k]);
    return bass;
  }

  function beatFeatures(A, beats) {
    const n = beats.length;
    const t0 = new Float64Array(n), t1 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      t0[i] = beats[i];
      t1[i] = i + 1 < n ? beats[i + 1] : beats[i] + (n > 1 ? beats[n - 1] - beats[n - 2] : 0.5);
    }
    const treb = aggregate(A.harm.treble, A.harm.hopT, t0, t1);
    const bassRaw = aggregate(A.harm.bass, A.harm.hopB, t0, t1);
    const floor = bassFloor(bassRaw);
    const bass = subFloor(bassRaw, floor);
    const lo = new Float64Array(n), en = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      lo[i] = sampleMax(A.fl, timeToFrame(beats[i]), 2);
      const f0 = Math.max(0, Math.round(t0[i] * FPS)), f1 = Math.min(A.nF, Math.max(f0 + 1, Math.round(t1[i] * FPS)));
      let s = 0;
      for (let f = f0; f < f1; f++) s += A.rms[f] * A.rms[f];
      en[i] = 10 * Math.log10(s / Math.max(1, f1 - f0) + 1e-12);
    }
    return { t0, t1, treb, bass, lo, en, floor };
  }

  // ---------------------------------------------------------------
  // 코드 모델: 배음 포함 템플릿(트레블) + 베이스 음(전위) 우도 + 복잡도·조성 사전분포
  // ---------------------------------------------------------------
  const QUAL = {
    maj:   { iv: [0, 4, 7],     parts: ['', ''] },
    min:   { iv: [0, 3, 7],     parts: ['m', ''] },
    dom7:  { iv: [0, 4, 7, 10], parts: ['', '7'] },
    maj7:  { iv: [0, 4, 7, 11], parts: ['', 'maj7'] },
    min7:  { iv: [0, 3, 7, 10], parts: ['m', '7'] },
    sus4:  { iv: [0, 5, 7],     parts: ['sus', '4'], noInv: true },
    sus2:  { iv: [0, 2, 7],     parts: ['sus', '2'], noInv: true },
    dim:   { iv: [0, 3, 6],     parts: ['dim', ''], noInv: true },
    aug:   { iv: [0, 4, 8],     parts: ['aug', ''], noInv: true },
    hdim7: { iv: [0, 3, 6, 10], parts: ['m', '7♭5'], noInv: true },
    dim7:  { iv: [0, 3, 6, 9],  parts: ['dim', '7'], noInv: true },
  };
  const VOCAB = {
    basic: ['maj', 'min'],
    standard: ['maj', 'min', 'dom7', 'maj7', 'min7', 'sus4', 'dim'],
    extended: ['maj', 'min', 'dom7', 'maj7', 'min7', 'sus4', 'sus2', 'dim', 'aug', 'hdim7', 'dim7'],
  };

  const HARM = [[0, 1], [12, 0.6], [19, 0.36], [24, 0.216], [28, 0.13], [31, 0.078]]; // 배음 1~6
  const P = {
    GAMMA: 0.45, BETA: 30, BB: 1.5, NDELTA: 0.12, KEY: 0.6, RHO: 0.25,
    DB_EPS: 3e-4,
    KEY_WIN: 6, KEY_SWITCH: 6, KEY_MIN: 24,              // 전조 추적: 창(±박), 조 바꿈 벌점, 최소 구간(박)
    KEY_CHROMA_W: 1.2,                                   // 코드로 조성을 정할 때 섞는 음 분포 상관의 비중(18곡 시험으로 정함)
    TIGHT_K: 2000,                                       // DP 간격 벌점 강도 α = k·τ²(τ: 박 주기, 초)
    LOCAL_TEMPO: true,                                   // 국소 템포 곡선 사용                                        // 마디 길이가 바뀔(변박) 사전 확률
    PRI: { maj: 0, min: 0, dom7: -0.4, maj7: -0.6, min7: -0.4, sus4: -1.2, sus2: -1.4, dim: -1.3, aug: -1.8, hdim7: -1.2, dim7: -1.6 },
    INV: [0, -0.7, -1.0, -1.0],                          // 근음/3음/5음/7음 베이스
  };

  function notePattern(pc, out, w) {
    for (const [o, h] of HARM) out[(pc + o) % 12] += w * h;
  }
  function makeTemplate(pcs, bassPc) {
    const v = new Float64Array(12);
    for (const pc of pcs) notePattern(pc, v, 1);
    if (bassPc >= 0) notePattern(bassPc, v, P.RHO);      // 베이스 배음의 트레블 누설
    let mx = 0; for (let k = 0; k < 12; k++) if (v[k] > mx) mx = v[k];
    let q = 0;
    for (let k = 0; k < 12; k++) { v[k] = Math.pow(v[k] / mx, P.GAMMA); q += v[k] * v[k]; }
    q = Math.sqrt(q);
    for (let k = 0; k < 12; k++) v[k] /= q;
    return v;
  }
  const stateCache = new Map();
  function getStates(vocab, inv) {
    const key = vocab + (inv ? '+inv' : '');
    if (stateCache.has(key)) return stateCache.get(key);
    const S = [];
    for (const q of VOCAB[vocab]) {
      const Q = QUAL[q];
      for (let r = 0; r < 12; r++) {
        const pcs = Q.iv.map(i => (r + i) % 12);
        const invs = (!inv || Q.noInv) ? [0] : Q.iv.map((_, i) => i);
        for (const vi of invs) {
          const bass = pcs[vi];
          S.push({ q, root: r, pcs, bass, inv: vi,
            id: q + ':' + r + '/' + bass, baseId: q + ':' + r, T: makeTemplate(pcs, bass) });
        }
      }
    }
    S.push({ q: 'N', root: -1, pcs: [], bass: -1, inv: 0, prior: 0, id: 'N', baseId: 'N', T: null });
    stateCache.set(key, S);
    return S;
  }

  const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function estimateKey(treb, bass) {
    const n = treb.length / 12, prof = new Float64Array(12);
    for (let i = 0; i < n; i++) {
      let st = 0, sb = 0;
      for (let k = 0; k < 12; k++) { st += treb[i * 12 + k]; sb += bass[i * 12 + k]; }
      if (st <= 0) continue;
      for (let k = 0; k < 12; k++) prof[k] += Math.sqrt(treb[i * 12 + k] / st) + (sb > 0 ? 0.5 * Math.sqrt(bass[i * 12 + k] / sb) : 0);
    }
    const pm = mean(prof);
    let best = { tonic: 0, mode: 'major', score: -Infinity };
    for (let t = 0; t < 12; t++) {
      for (const [mode, Pf] of [['major', KK_MAJ], ['minor', KK_MIN]]) {
        const qm = mean(Pf);
        let sxy = 0, sxx = 0, syy = 0;
        for (let k = 0; k < 12; k++) {
          const a = prof[k] - pm, b = Pf[(k - t + 12) % 12] - qm;
          sxy += a * b; sxx += a * a; syy += b * b;
        }
        const r = sxy / (Math.sqrt(sxx * syy) + 1e-12);
        if (r > best.score) best = { tonic: t, mode, score: r };
      }
    }
    return best;
  }
  function keyScale(key) {
    const iv = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10, 11]; // 단조는 이끎음 포함
    return iv.map(i => (key.tonic + i) % 12);
  }

  // ---------------------------------------------------------------
  // 전조 추적: 비트마다 앞뒤 창의 음 분포를 24개 조성 프로필과 비교하고,
  // 조표 단위(장조 c 와 나란한 단조 c+9 를 한 부류로 묶은 12종) HMM으로 구간을 나눈다.
  // 나란한 장·단조 사이 이동(예: C 장조 ↔ A 단조)은 조표가 같으므로 전조로 보지 않는다.
  // ---------------------------------------------------------------
  const KEY_TPL = [];                                   // 0~11 장조, 12~23 단조 (평균 0, 길이 1)
  for (const [Pf, mode] of [[KK_MAJ, 'major'], [KK_MIN, 'minor']]) {
    for (let t = 0; t < 12; t++) {
      const v = new Float64Array(12);
      let mu = 0;
      for (let k = 0; k < 12; k++) { v[k] = Pf[(k - t + 12) % 12]; mu += v[k]; }
      mu /= 12;
      let q = 0;
      for (let k = 0; k < 12; k++) { v[k] -= mu; q += v[k] * v[k]; }
      q = Math.sqrt(q);
      for (let k = 0; k < 12; k++) v[k] /= q;
      KEY_TPL.push({ tonic: t, mode, v });
    }
  }
  const dot12 = (a, v) => { let s = 0; for (let q = 0; q < 12; q++) s += a[q] * v[q]; return s; };
  // 12칸 분포를 평균 0·길이 1로(소리가 없으면 false)
  function normalize12(buf) {
    let mu = 0;
    for (let q = 0; q < 12; q++) mu += buf[q];
    mu /= 12;
    let e = 0;
    for (let q = 0; q < 12; q++) { buf[q] -= mu; e += buf[q] * buf[q]; }
    if (e < 1e-12) return false;
    e = Math.sqrt(e);
    for (let q = 0; q < 12; q++) buf[q] /= e;
    return true;
  }
  function keyName(k) { return spelling(k)[k.tonic] + (k.mode === 'major' ? ' 장조' : ' 단조'); }

  function keySegments(F) {
    const n = F.t0.length, h = new Float64Array(n * 12);
    for (let i = 0; i < n; i++) {
      let st = 0, sb = 0;
      for (let q = 0; q < 12; q++) { st += F.treb[i * 12 + q]; sb += F.bass[i * 12 + q]; }
      if (st <= 0) continue;
      for (let q = 0; q < 12; q++) h[i * 12 + q] = Math.sqrt(F.treb[i * 12 + q] / st) + (sb > 0 ? 0.5 * Math.sqrt(F.bass[i * 12 + q] / sb) : 0);
    }
    const W = P.KEY_WIN, cls = new Float64Array(n * 12), raw = new Float64Array(n * 12), buf = new Float64Array(12);
    const scoreInto = (dst, i) => {
      if (!normalize12(buf)) return;
      for (let c = 0; c < 12; c++) dst[i * 12 + c] = Math.max(dot12(buf, KEY_TPL[c].v), dot12(buf, KEY_TPL[12 + (c + 9) % 12].v));
    };
    for (let i = 0; i < n; i++) {
      buf.fill(0);
      for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) {
        const w = 1 - Math.abs(j - i) / (W + 1);
        for (let q = 0; q < 12; q++) buf[q] += w * h[j * 12 + q];
      }
      scoreInto(cls, i);                                // 창으로 모은 점수(구간 나누기용)
      for (let q = 0; q < 12; q++) buf[q] = h[i * 12 + q];
      scoreInto(raw, i);                                // 비트 하나의 점수(경계 정밀화용)
    }
    // 12부류 HMM: 유지 0, 바꿈 −KEY_SWITCH → O(T·12)
    const L = P.KEY_SWITCH;
    let prev = new Float64Array(12), cur = new Float64Array(12);
    const back = new Int8Array(n * 12);
    for (let c = 0; c < 12; c++) prev[c] = cls[c];
    for (let i = 1; i < n; i++) {
      let M = -Infinity, am = 0;
      for (let c = 0; c < 12; c++) if (prev[c] > M) { M = prev[c]; am = c; }
      for (let c = 0; c < 12; c++) {
        if (prev[c] >= M - L) { cur[c] = prev[c] + cls[i * 12 + c]; back[i * 12 + c] = c; }
        else { cur[c] = M - L + cls[i * 12 + c]; back[i * 12 + c] = am; }
      }
      const tmp = prev; prev = cur; cur = tmp;
    }
    let c = 0;
    for (let q = 1; q < 12; q++) if (prev[q] > prev[c]) c = q;
    const path = new Int8Array(n);
    for (let i = n - 1; i >= 0; i--) { path[i] = c; if (i > 0) c = back[i * 12 + c]; }
    // 구간으로 묶고, KEY_MIN 박보다 짧은 구간은 더 잘 맞는 이웃 구간에 흡수
    let segs = [];
    for (let i = 0; i < n; i++) {
      if (!segs.length || segs[segs.length - 1].cls !== path[i]) segs.push({ start: i, end: i + 1, cls: path[i] });
      else segs[segs.length - 1].end = i + 1;
    }
    const fit = (g, cl) => { let s = 0; for (let i = g.start; i < g.end; i++) s += cls[i * 12 + cl]; return s; };
    for (;;) {
      let k = -1, len = Infinity;
      segs.forEach((g, j) => { const l = g.end - g.start; if (l < P.KEY_MIN && l < len) { len = l; k = j; } });
      if (k < 0 || segs.length < 2) break;
      const g = segs[k], a = segs[k - 1], b = segs[k + 1];
      const to = !a ? b : !b ? a : (fit(g, a.cls) >= fit(g, b.cls) ? a : b);
      if (to === a) a.end = g.end; else b.start = g.start;
      segs.splice(k, 1);
      const merged = [];
      for (const x of segs) { if (merged.length && merged[merged.length - 1].cls === x.cls) merged[merged.length - 1].end = x.end; else merged.push(x); }
      segs = merged;
    }
    return { segs, h, raw };
  }
  // 구간의 장조/나란한 단조 결정
  function segKey(h, g) {
    const buf = new Float64Array(12);
    for (let i = g.start; i < g.end; i++) for (let q = 0; q < 12; q++) buf[q] += h[i * 12 + q];
    if (!normalize12(buf)) return { tonic: g.cls, mode: 'major', score: 0 };
    const a = dot12(buf, KEY_TPL[g.cls].v), b = dot12(buf, KEY_TPL[12 + (g.cls + 9) % 12].v);
    return a >= b ? { tonic: g.cls, mode: 'major', score: a } : { tonic: (g.cls + 9) % 12, mode: 'minor', score: b };
  }
  // 경계 정밀화: ±8박 안에서 앞 16박은 이전 조, 뒤 16박은 새 조에 가장 잘 맞는 비트(마디 첫 박을 조금 선호)
  function refineKeyBoundary(raw, b0, A, B, pos, lo, hi) {
    const n = pos.length;
    let best = -Infinity, bb = b0;
    for (let b = Math.max(lo + 1, b0 - 8); b <= Math.min(hi - 1, b0 + 8); b++) {
      let sc = 0;
      for (let j = Math.max(0, b - 16); j < b; j++) sc += raw[j * 12 + A] - raw[j * 12 + B];
      for (let j = b; j < Math.min(n, b + 16); j++) sc += raw[j * 12 + B] - raw[j * 12 + A];
      if (pos[b] === 0) sc += 0.5;
      if (sc > best) { best = sc; bb = b; }
    }
    return bb;
  }

  function emissions(states, treb, bass, key) {
    const nS = treb.length / 12, K = states.length;
    const E = new Float64Array(nS * K);
    const tE = new Float64Array(nS), bE = new Float64Array(nS);
    for (let s = 0; s < nS; s++) {
      let a = 0, b = 0;
      for (let k = 0; k < 12; k++) { a += treb[s * 12 + k]; b += bass[s * 12 + k]; }
      tE[s] = a; bE[s] = b;
    }
    const tRef = quantile(tE, 0.6) || 1e-12, bRef = quantile(bE, 0.6) || 1e-12;
    // 조성 가산점: key 가 함수면 슬롯마다 그 자리의 조성(전조 반영)
    const keyAt = typeof key === 'function' ? key : () => key;
    const inKeyCache = new Map();
    const inKeyFor = k => {
      if (!k) return null;
      const id = k.tonic * 2 + (k.mode === 'major' ? 0 : 1);
      let a = inKeyCache.get(id);
      if (!a) {
        a = new Uint8Array(K);
        const sc = new Set(keyScale(k));
        for (let i = 0; i < K; i++) a[i] = states[i].root >= 0 && states[i].pcs.every(p => sc.has(p)) ? 1 : 0;
        inKeyCache.set(id, a);
      }
      return a;
    };
    const pri = new Float64Array(K);
    for (let i = 0; i < K; i++) if (states[i].root >= 0) pri[i] = (P.PRI[states[i].q] || 0) + P.INV[states[i].inv];
    const o = new Float64Array(12), bn = new Float64Array(12);
    const base0 = Math.log(0.06 + 1 / 12), sq12 = Math.sqrt(12);
    for (let s = 0; s < nS; s++) {
      const inKey = inKeyFor(keyAt(s));
      let mx = 0;
      for (let k = 0; k < 12; k++) if (treb[s * 12 + k] > mx) mx = treb[s * 12 + k];
      let q = 0, so = 0;
      for (let k = 0; k < 12; k++) { o[k] = mx > 0 ? Math.pow(treb[s * 12 + k] / mx, P.GAMMA) : 1; q += o[k] * o[k]; }
      q = Math.sqrt(q) || 1;
      for (let k = 0; k < 12; k++) { o[k] /= q; so += o[k]; }
      const flat = so / sq12;
      const rel = tE[s] / tRef;
      const quiet = rel < 0.02 ? 12 : (rel < 0.08 ? 6 * (0.08 - rel) / 0.06 : 0);  // 조용할수록 N 선호
      const bRel = Math.min(1, bE[s] / (0.5 * bRef));
      for (let k = 0; k < 12; k++) bn[k] = bE[s] > 0 ? bass[s * 12 + k] / bE[s] : 1 / 12;
      for (let i = 0; i < K; i++) {
        const st = states[i];
        let e;
        if (st.root < 0) e = P.BETA * (flat - P.NDELTA) + quiet;
        else {
          const T = st.T;
          let d = 0;
          for (let k = 0; k < 12; k++) d += o[k] * T[k];
          e = P.BETA * d + pri[i] + (inKey && inKey[i] ? P.KEY : 0) + P.BB * bRel * (Math.log(0.06 + bn[st.bass]) - base0);
        }
        E[s * K + i] = e;
      }
    }
    return E;
  }

  // 전이: 유지 0, 변경 −λ(메트릭 위치별) → O(T·K) 비터비
  function viterbiChords(E, nS, K, lam) {
    const back = new Int16Array(nS * K);
    let prev = new Float64Array(K), cur = new Float64Array(K);
    for (let k = 0; k < K; k++) prev[k] = E[k];
    for (let s = 1; s < nS; s++) {
      let M = -Infinity, am = 0;
      for (let k = 0; k < K; k++) if (prev[k] > M) { M = prev[k]; am = k; }
      const sw = M - lam[s];
      for (let k = 0; k < K; k++) {
        const e = E[s * K + k];
        if (prev[k] >= sw) { cur[k] = prev[k] + e; back[s * K + k] = k; }
        else { cur[k] = sw + e; back[s * K + k] = am; }
      }
      const tmp = prev; prev = cur; cur = tmp;
    }
    let k = 0;
    for (let q = 1; q < K; q++) if (prev[q] > prev[k]) k = q;
    const path = new Int32Array(nS);
    for (let s = nS - 1; s >= 0; s--) { path[s] = k; if (s > 0) k = back[s * K + k]; }
    return path;
  }

  // ---------------------------------------------------------------
  // 박자·다운비트
  // ---------------------------------------------------------------
  function rowsNorm(C) {
    const n = C.length / 12, out = new Float64Array(C.length);
    for (let i = 0; i < n; i++) {
      let q = 0;
      for (let k = 0; k < 12; k++) { const v = Math.sqrt(Math.max(0, C[i * 12 + k])); out[i * 12 + k] = v; q += v * v; }
      q = Math.sqrt(q) || 1;
      for (let k = 0; k < 12; k++) out[i * 12 + k] /= q;
    }
    return out;
  }
  function dotRows(X, i, j) { let s = 0; for (let k = 0; k < 12; k++) s += X[i * 12 + k] * X[j * 12 + k]; return s; }

  // 각 비트가 마디 첫 박일 증거: 화성 변화, 예비 코드 변화, 베이스 변화, 저역 온셋, 음량 상승, 으뜸화음 진입
  function downbeatEvidence(F, st0, lab0, key) {
    const n = F.t0.length;
    const hc = new Float64Array(n), lc = new Float64Array(n), bc = new Float64Array(n), en = new Float64Array(n), ton = new Float64Array(n);
    const tn = rowsNorm(F.treb), bnn = rowsNorm(F.bass);
    const keyAt = typeof key === 'function' ? key : () => key;
    for (let i = 1; i < n; i++) {
      hc[i] = 1 - dotRows(tn, i, i - 1);
      bc[i] = 1 - dotRows(bnn, i, i - 1);
      lc[i] = st0[lab0[i]].baseId !== st0[lab0[i - 1]].baseId ? 1 : 0;
      en[i] = Math.max(0, F.en[i] - F.en[i - 1]);
      const s = st0[lab0[i]];
      const kk = keyAt(i);
      ton[i] = lc[i] && s.root === kk.tonic && s.q === (kk.mode === 'major' ? 'maj' : 'min') ? 1 : 0;
    }
    const Z = [standardize(hc), standardize(lc), standardize(bc), standardize(F.lo), standardize(en), standardize(ton)];
    const Wt = [1.0, 1.0, 0.5, 0.6, 0.3, 0.4];
    const z = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let q = 0; q < Z.length; q++) s += Wt[q] * Z[q][i]; z[i] = s; }
    return z;
  }

  // 마디 내 위치 HMM: 정상 진행 + 드물게 마디 단축/연장(변박·잘린 마디 대응)
  function downbeatViterbi(z, m, alpha, eps) {
    alpha = alpha || 1.5; eps = eps || P.DB_EPS;
    const n = z.length;
    if (m < 2 || n === 0) return { m, pos: new Int8Array(n), contrast: 0 };
    const le = Math.log(eps), ln = Math.log(1 - 2 * eps);
    const emit = (i, p) => p === 0 ? alpha * z[i] : ((m >= 4 && m % 2 === 0 && p === m / 2) ? 0.3 * alpha * z[i] : 0);
    let prev = new Float64Array(m), cur = new Float64Array(m);
    const back = new Int8Array(n * m);
    for (let p = 0; p < m; p++) prev[p] = -Math.log(m) + emit(0, p);
    for (let i = 1; i < n; i++) {
      for (let p = 0; p < m; p++) {
        const pp = (p - 1 + m) % m;
        let best = prev[pp] + ln, arg = pp;
        if (p === 0) for (let k = 1; k <= m - 2; k++) { const v = prev[k] + le; if (v > best) { best = v; arg = k; } }
        if (p === m - 1) { const v = prev[m - 1] + le; if (v > best) { best = v; arg = m - 1; } }
        cur[p] = best + emit(i, p);
        back[i * m + p] = arg;
      }
      const tmp = prev; prev = cur; cur = tmp;
    }
    let p = 0;
    for (let q = 1; q < m; q++) if (prev[q] > prev[p]) p = q;
    const pos = new Int8Array(n);
    for (let i = n - 1; i >= 0; i--) { pos[i] = p; if (i > 0) p = back[i * m + p]; }
    let s0 = 0, c0 = 0, s1 = 0, c1 = 0;
    for (let i = 0; i < n; i++) { if (pos[i] === 0) { s0 += z[i]; c0++; } else { s1 += z[i]; c1++; } }
    return { m, pos, contrast: (c0 ? s0 / c0 : 0) - (c1 ? s1 / c1 : 0) };
  }

  function meterLabel(m, triple) {
    if (triple) return (m * 3) + '/8';
    return m + '/4';
  }

  // ---------------------------------------------------------------
  // 음이름 표기 (조성에 맞춰 ♯/♭ 선택)
  // ---------------------------------------------------------------
  const N_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const N_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const N_MIXED = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  function spelling(key) {
    const majT = key.mode === 'major' ? key.tonic : (key.tonic + 3) % 12;
    const table = [7, 2, 9, 4, 11, 6].includes(majT) ? N_SHARP : ([5, 10, 3, 8, 1].includes(majT) ? N_FLAT : N_MIXED);
    const scale = new Set([0, 2, 4, 5, 7, 9, 11].map(i => (majT + i) % 12));
    const names = [];
    for (let pc = 0; pc < 12; pc++) names.push(scale.has(pc) ? table[pc] : N_MIXED[pc]);
    if (key.mode === 'minor') { const lt = (key.tonic + 11) % 12; if (!scale.has(lt)) names[lt] = N_SHARP[lt]; }
    return names;
  }
  // ---------------------------------------------------------------
  // 로마 숫자 화성 분석: 그 자리의 조성을 기준으로
  //  도수(로마 숫자, 대문자 = 장3화음 계열, 소문자 = 단3화음 계열), 화음 성질(°, ø, +, M),
  //  자리바꿈 숫자(3화음 6·64, 7화음 7·65·43·42), 부속화음(V/x, vii°/x, ii/x), 차용 화음(♭VI 등)
  // ---------------------------------------------------------------
  const RN_MAJ = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
  const RN_MIN = ['I', '♭II', 'II', 'III', '♯III', 'IV', '♯IV', 'V', 'VI', '♯VI', 'VII', '♯VII'];   // 자연단음계 기준
  const RN_LOWER = { min: 1, min7: 1, dim: 1, hdim7: 1, dim7: 1 };
  const RN_QUAL = { dim: '°', dim7: '°', hdim7: 'ø', aug: '+', maj7: 'M' };
  const RN_FIG3 = ['', '6', '64'], RN_FIG7 = ['7', '65', '43', '42'];
  const RN_SEV = { dom7: 1, min7: 1, maj7: 1, hdim7: 1, dim7: 1 };
  const dimFam = st => st.q === 'dim' || st.q === 'dim7' || st.q === 'hdim7';
  function degreeNumeral(root, key, lower, dimLike) {
    const d = (root - key.tonic + 12) % 12;
    let n = key.mode === 'minor' ? RN_MIN[d] : RN_MAJ[d];
    if (key.mode === 'minor' && d === 11 && dimLike) n = 'VII';             // 단조의 이끎음 화음은 임시표 없이 vii°
    return lower ? n.replace(/[IV]+/, x => x.toLowerCase()) : n;
  }
  const inKeyAll = (st, key) => { const sc = new Set(keyScale(key)); return st.pcs.every(p => sc.has(p)); };
  const inKeyTriad = (st, key) => { const sc = new Set(keyScale(key)); return st.pcs.slice(0, 3).every(p => sc.has(p)); };
  const targetNumeral = (t, key) => degreeNumeral(t.root, key, !!RN_LOWER[t.q], dimFam(t)) + (t.q === 'dim' ? '°' : '');
  // 코드로 조성 정하기: 구간의 코드들이 어느 조성 음계에 들어맞는지(시간 비율)에, 으뜸화음이 차지하는 시간,
  // V(7)→I 종지 수, 처음·마지막 코드가 으뜸화음인지를 더해 24개 조성 중 고름(음 분포 조성은 동점 가르기에만)
  function keyFromChords(runs, chromaR, phraseSt) {
    const total = runs.reduce((a, r) => a + r.dur, 0);
    if (!total) return null;
    const isTonic = (st, t, mode) => st.root === t && (mode === 'major' ? (st.q === 'maj' || st.q === 'maj7') : (st.q === 'min' || st.q === 'min7'));
    let best = null;
    for (let t = 0; t < 12; t++) for (const mode of ['major', 'minor']) {
      const sc = new Set(keyScale({ tonic: t, mode }));
      let cover = 0, ton = 0, cad = 0;
      runs.forEach((r, k) => {
        if (r.st.pcs.every(p => sc.has(p))) cover += r.dur;
        if (isTonic(r.st, t, mode)) {
          ton += r.dur;
          const p = k > 0 ? runs[k - 1].st : null;
          if (p && p.root === (t + 7) % 12 && (p.q === 'maj' || p.q === 'dom7')) cad++;
        }
      });
      let v = cover / total + 0.5 * ton / total + 0.3 * Math.min(1, cad / 3)
        + 0.15 * isTonic(runs[0].st, t, mode) + 0.15 * isTonic(runs[runs.length - 1].st, t, mode);
      // 4마디 악구의 첫 박에 으뜸화음이 오는 비율(악구는 으뜸화음에서 시작하는 경우가 많음)
      if (phraseSt && phraseSt.length) v += 0.4 * phraseSt.filter(st => isTonic(st, t, mode)).length / phraseSt.length;
      if (chromaR) v += P.KEY_CHROMA_W * chromaR[mode === 'major' ? t : 12 + t];   // 음 분포(조성 프로필 상관)와 섞음
      if (!best || v > best.score) best = { tonic: t, mode, score: v };
    }
    return best;
  }
  // st: 이 코드, key: 이 자리의 조성, inv: 자리바꿈(0~3), nx: 다음에 오는 다른 코드(없으면 null), nxKey: 그 코드 자리의 조성
  function romanOf(st, key, inv, nx, nxKey) {
    if (!st || st.root < 0) return { nc: true, acc: '', num: 'N.C.', qual: '', fig: '', sus: '', sec: '', text: 'N.C.', ascii: 'N.C.' };
    const lower = !!RN_LOWER[st.q], sev = !!RN_SEV[st.q];
    const fig = sev ? RN_FIG7[inv] : ((st.q === 'sus4' || st.q === 'sus2') ? '' : RN_FIG3[inv]);
    const domLike = st.q === 'maj' || st.q === 'dom7';
    const d = (st.root - key.tonic + 12) % 12;
    let num, sec = '';
    if (nx && nx.root >= 0 && nxKey && (nxKey.tonic !== key.tonic || nxKey.mode !== key.mode)
        && domLike && nx.root === nxKey.tonic && (st.root + 5) % 12 === nx.root) {
      num = 'V';                                                            // 전조 직전의 새 조 딸림화음: 새 조 기준 V
    } else {
      const tgt = nx && nx.root >= 0 && nx.root !== key.tonic && inKeyTriad(nx, key) ? nx : null;
      const td = tgt ? (tgt.root - key.tonic + 12) % 12 : -1;
      if (tgt && domLike && (st.root + 5) % 12 === tgt.root && (!inKeyAll(st, key) || (key.mode === 'minor' && d === 10 && td === 3))) {
        num = 'V'; sec = targetNumeral(tgt, key);                           // 부속 딸림화음(단조의 VII→III 포함)
      } else if (tgt && dimFam(st) && (st.root + 1) % 12 === tgt.root && !inKeyAll(st, key)) {
        num = 'vii'; sec = targetNumeral(tgt, key);                         // 부속 이끎음 화음
      } else num = degreeNumeral(st.root, key, lower, dimFam(st));
    }
    return rnPack(num, RN_QUAL[st.q] || '', fig, st.q === 'sus4' ? 'sus4' : st.q === 'sus2' ? 'sus2' : '', sec);
  }
  function rnPack(num, qual, fig, sus, sec) {
    const acc = /^[♭♯]/.test(num) ? num[0] : '', n = acc ? num.slice(1) : num;
    const text = num + qual + fig + sus + (sec ? '/' + sec : '');
    return { nc: false, acc, num: n, qual, fig, sus, sec, text, ascii: text.replace(/♯/g, '#').replace(/♭/g, 'b') };
  }

  // 카멜롯 휠: C 장조 = 8B, 완전5도 위로 갈 때마다 +1(12 다음은 1). 단조는 나란한 장조와 같은 번호에 A
  function camelot(tonic, mode) {
    const t = mode === 'minor' ? (tonic + 3) % 12 : tonic;
    return ((7 * t + 7) % 12 + 1) + (mode === 'minor' ? 'A' : 'B');
  }
  // 코드의 카멜롯 표기: 3음이 단3도인 코드(m, m7, dim, m7♭5, dim7)는 A, 나머지는 B. 첨자로 코드 종류를 남김
  const CAM_MINOR = { min: 1, min7: 1, dim: 1, hdim7: 1, dim7: 1 };
  const CAM_EXT = { maj: '', min: '', dom7: '7', maj7: 'maj7', min7: '7', sus4: 'sus4', sus2: 'sus2', dim: 'dim', aug: 'aug', hdim7: '7♭5', dim7: 'dim7' };
  function formatChord(st, names, withBass) {
    if (!st || st.root < 0) return { root: 'N.C.', base: '', ext: '', bass: '', text: 'N.C.', ascii: 'N.C.', nc: true };
    const root = names[st.root];
    const [base, ext] = QUAL[st.q].parts;
    const bass = withBass && st.bass !== st.root ? names[st.bass] : '';
    const text = root + base + ext + (bass ? '/' + bass : '');
    const code = camelot(st.root, CAM_MINOR[st.q] ? 'minor' : 'major'), cx = CAM_EXT[st.q];
    return { root, base, ext, bass, text, ascii: text.replace(/♯/g, '#').replace(/♭/g, 'b'), nc: false,
      cam: { code, ext: cx, text: code + cx, ascii: (code + cx).replace(/♭/g, 'b') } };
  }

  // ---------------------------------------------------------------
  // 2단계(가벼운 부분): 비트 → 박자·다운비트 → 코드 → 마디
  // ---------------------------------------------------------------
  function defaultSettings() {
    return { ops: [], meter: 'auto', downShift: 0, vocab: 'standard', res: 1, slash: true };
  }

  function buildTimeline(A, userSet) {
    const set = Object.assign(defaultSettings(), userSet || {});
    const beats = applyOps(A, set.ops);
    const n = beats.length;
    if (n < 4) return { empty: true, beats, bars: [], pos: new Int8Array(n), barOfBeat: new Int32Array(n) };

    // 비트 단위 특징 + 예비 코드(장·단3화음) + 조성
    const F = beatFeatures(A, beats);
    const keyG = estimateKey(F.treb, F.bass);           // 곡 전체 조성(전조가 없으면 그대로 씀)
    const KS = keySegments(F);
    const segs = KS.segs.map(g => ({ start: g.start, end: g.end, cls: g.cls }));
    const setKeys = () => segs.forEach(g => { g.key = segs.length === 1 ? keyG : segKey(KS.h, g); });
    setKeys();
    const segOfBeat = new Int32Array(n);
    const indexSegs = () => segs.forEach((g, k) => { for (let i = g.start; i < g.end; i++) segOfBeat[i] = k; });
    indexSegs();
    const keyAtBeat = i => segs[segOfBeat[i]].key;
    const st0 = getStates('basic', false);
    const lab0 = viterbiChords(emissions(st0, F.treb, F.bass, keyAtBeat), n, st0.length, new Float64Array(n).fill(3.0));

    // 박자·다운비트
    const sub = subdivision(beats, A.O);
    const z = downbeatEvidence(F, st0, lab0, keyAtBeat);
    let met, alt = null;
    if (set.meter === 'auto') {
      const cands = sub.triple ? [4, 2] : [4, 3];
      const r = cands.map(m => downbeatViterbi(z, m));
      met = r[1].contrast > r[0].contrast + (sub.triple ? 0.3 : 0.25) ? r[1] : r[0];
      alt = r;
    } else {
      met = downbeatViterbi(z, set.meter);
    }
    const m = met.m;
    let pos = met.pos;
    if (set.downShift) {
      const sh = ((set.downShift % m) + m) % m;
      pos = pos.map(p => (p - sh + m) % m);
    }

    // 최종 코드 (1박 또는 ½박 해상도)
    const res = set.res === 2 ? 2 : 1, nS = n * res;
    const t0 = new Float64Array(nS), t1 = new Float64Array(nS), lam = new Float64Array(nS);
    for (let i = 0; i < n; i++) {
      const a = F.t0[i], b = F.t1[i];
      for (let r = 0; r < res; r++) {
        const s = i * res + r;
        t0[s] = a + (b - a) * r / res; t1[s] = a + (b - a) * (r + 1) / res;
        if (r > 0) lam[s] = 6.0;
        else lam[s] = pos[i] === 0 ? 1.5 : ((m % 2 === 0 && pos[i] === m / 2) ? 3.0 : 4.0);
      }
    }
    // 전조 경계를 마디 위치까지 고려해 비트 단위로 다듬음
    for (let g = 1; g < segs.length; g++) {
      const b = refineKeyBoundary(KS.raw, segs[g].start, segs[g - 1].cls, segs[g].cls, pos, segs[g - 1].start, segs[g].end);
      segs[g - 1].end = b; segs[g].start = b;
    }
    setKeys(); indexSegs();
    const treb = aggregate(A.harm.treble, A.harm.hopT, t0, t1);
    const bass = subFloor(aggregate(A.harm.bass, A.harm.hopB, t0, t1), F.floor);
    const states = getStates(set.vocab, true);
    const lab = viterbiChords(emissions(states, treb, bass, s => keyAtBeat(Math.floor(s / res))), nS, states.length, lam);
    // 딸림화음을 거쳐 전조하면(새 조의 V·V7·Vsus4 → I), 악보 관례대로 으뜸화음이 오는 자리부터 새 조
    for (let g = 1; g < segs.length; g++) {
      const k = segs[g].key, b = segs[g].start, stAt = i => states[lab[i * res]];
      const d = stAt(b);
      const isDom = x => x.root === (k.tonic + 7) % 12 && (x.q === 'maj' || x.q === 'dom7' || x.q === 'sus4');
      if (!isDom(d)) continue;
      for (let j = b + 1; j <= Math.min(segs[g].end - 1, b + 8); j++) {
        const x = stAt(j);
        if (isDom(x)) continue;
        const tonic = x.root === k.tonic && (k.mode === 'major' ? (x.q === 'maj' || x.q === 'maj7') : (x.q === 'min' || x.q === 'min7'));
        if (tonic) { segs[g - 1].end = j; segs[g].start = j; }
        break;
      }
    }
    indexSegs();
    // 구간마다 인식된 코드로 조성을 다시 정함(음 분포만으로는 나란한조·5도 관계 조를 헷갈릴 수 있음)
    segs.forEach(g => {
      const runs = [];
      for (let s2 = g.start * res; s2 < g.end * res; s2++) {
        const st = states[lab[s2]];
        if (st.root < 0) continue;
        if (runs.length && runs[runs.length - 1].st.baseId === st.baseId && runs[runs.length - 1].end === s2) { runs[runs.length - 1].dur++; runs[runs.length - 1].end = s2 + 1; }
        else runs.push({ st, dur: 1, end: s2 + 1 });
      }
      const prof = new Float64Array(12);
      for (let i = g.start; i < g.end; i++) for (let q = 0; q < 12; q++) prof[q] += KS.h[i * 12 + q];
      const chromaR = normalize12(prof) ? KEY_TPL.map(T => dot12(prof, T.v)) : null;
      // 코드가 처음 나오는 마디부터 4마디마다의 첫 박 코드(악구 시작). 드럼만 나오는 도입부는 세지 않음
      const phraseSt = [];
      let bc = -1;
      for (let i = g.start; i < g.end; i++) {
        if (pos[i] !== 0) continue;
        const st = states[lab[i * res]];
        if (bc < 0 && st.root < 0) continue;
        bc++;
        if (bc % 4 === 0 && st.root >= 0) phraseSt.push(st);
      }
      const k = runs.length >= 3 ? keyFromChords(runs, chromaR, phraseSt) : null;
      if (k) g.key = { tonic: k.tonic, mode: k.mode, score: g.key.score };
    });
    const namesSeg = segs.map(g => spelling(g.key));   // 구간마다 그 조성에 맞는 ♯/♭ 표기

    // 마디 구성
    const idOf = s => set.slash ? states[lab[s]].id : states[lab[s]].baseId;
    const bars = [], barOfBeat = new Int32Array(n);
    let start = 0;
    for (let i = 1; i <= n; i++) if (i === n || pos[i] === 0) { bars.push({ startBeat: start, nBeats: i - start }); start = i; }
    let num = pos[0] === 0 ? 1 : 0;
    const lastEnd = F.t1[n - 1];
    bars.forEach((b, bi) => {
      b.num = num++;
      b.pickup = bi === 0 && pos[0] !== 0;
      b.t0 = beats[b.startBeat];
      b.t1 = b.startBeat + b.nBeats < n ? beats[b.startBeat + b.nBeats] : lastEnd;
      for (let i = b.startBeat; i < b.startBeat + b.nBeats; i++) barOfBeat[i] = bi;
      const s0 = b.startBeat * res, s1 = (b.startBeat + b.nBeats) * res;
      const ev = [];
      for (let s = s0; s < s1; s++) {
        if (s === s0 || idOf(s) !== idOf(s - 1)) {
          const st = states[lab[s]];
          ev.push({ off: (s - s0) / res, slot: s, tied: s === s0 && s > 0 && idOf(s) === idOf(s - 1),
            pcs: st.pcs.slice(),                                            // 구성음 음이름 번호(0=C)
            bassPc: st.root < 0 ? -1 : (set.slash ? st.bass : st.root),     // 연주할 베이스(표기와 일치)
            label: formatChord(st, namesSeg[segOfBeat[Math.floor(s / res)]], set.slash) });
        }
      }
      for (let e = 0; e < ev.length; e++) ev[e].dur = (e + 1 < ev.length ? ev[e + 1].off : b.nBeats) - ev[e].off;
      b.events = ev;
    });

    // 로마 숫자: 그 자리의 조성, 자리바꿈(베이스 표기를 끄면 기본형), 다음에 오는 다른 코드로 부속화음 판정
    {
      const flat = [];
      bars.forEach(b => b.events.forEach(ev => flat.push(ev)));
      const stOf = ev => states[lab[ev.slot]];
      const keyOfEv = ev => segs[segOfBeat[Math.floor(ev.slot / res)]].key;
      const nextOf = k => { const id = stOf(flat[k]).baseId; for (let j = k + 1; j < flat.length; j++) if (stOf(flat[j]).baseId !== id) return j; return -1; };
      const nx = flat.map((_, k) => nextOf(k));
      flat.forEach((ev, k) => {
        const st = stOf(ev), j = nx[k];
        ev.label.rn = romanOf(st, keyOfEv(ev), set.slash ? st.inv : 0, j >= 0 ? stOf(flat[j]) : null, j >= 0 ? keyOfEv(flat[j]) : null);
      });
      // ii/x: 조성 밖 단3화음·m7·m7♭5 가 완전5도 아래의 부속 딸림화음(V/x)으로 이어지면 "ii7/x"
      flat.forEach((ev, k) => {
        const st = stOf(ev), j = nx[k];
        if (j < 0 || !(st.q === 'min' || st.q === 'min7' || st.q === 'hdim7')) return;
        const r2 = flat[j].label.rn;
        if (!r2.sec || r2.num !== 'V' || (st.root + 5) % 12 !== stOf(flat[j]).root || inKeyAll(st, keyOfEv(ev))) return;
        const inv = set.slash ? st.inv : 0;
        ev.label.rn = rnPack('ii', RN_QUAL[st.q] || '', RN_SEV[st.q] ? RN_FIG7[inv] : RN_FIG3[inv], '', r2.sec);
      });
    }

    const iv = [];
    for (let i = 1; i < n; i++) iv.push(beats[i] - beats[i - 1]);
    const medIv = median(iv);
    return {
      empty: false, beats, pos, barOfBeat, bars, res,
      bpm: 60 / medIv,
      meter: { m, triple: sub.triple, label: meterLabel(m, sub.triple), contrast: met.contrast,
        alt: alt ? alt.map(r => ({ m: r.m, contrast: r.contrast })) : null },
      key: { tonic: segs[0].key.tonic, mode: segs[0].key.mode, score: segs[0].key.score, name: keyName(segs[0].key), cam: camelot(segs[0].key.tonic, segs[0].key.mode) },
      // 조성 구간: 시작 비트, 마디 번호와 박(못갖춘마디는 마디 안 실제 박 위치), 시각
      keys: segs.map(g => {
        const b = g.start, bi = barOfBeat[b], bar = bars[bi], off = b - bar.startBeat;
        return { tonic: g.key.tonic, mode: g.key.mode, score: g.key.score, name: keyName(g.key), cam: camelot(g.key.tonic, g.key.mode),
          startBeat: b, bar: bi, barNum: bar.num, beat: bar.pickup ? (m - bar.nBeats) + off + 1 : off + 1, t0: beats[b] };
      }),
      sub, settings: set,
      dbg: { z, lab0: Array.from(lab0, k => st0[k].id), treb: F.treb, bass: F.bass },   // 진단용
    };
  }

  // 텍스트 코드 차트 (슬래시 표기: 박마다 코드명 또는 '/')
  function chartText(TL, meta) {
    if (!TL || TL.empty) return '';
    const out = [];
    const head = [];
    if (meta && meta.title) head.push(meta.title);
    const kn = x => x.replace(/♯/g, '#').replace(/♭/g, 'b');
    const cam = !!(meta && meta.notation === 'camelot');            // 카멜롯 표기
    const kstr = k => cam ? kn(k.name) + '(' + k.cam + ')' : kn(k.name);
    const keys = TL.keys && TL.keys.length ? TL.keys : [TL.key];
    head.push('BPM ' + TL.bpm.toFixed(1), '박자 ' + TL.meter.label, '조성 ' + keys.map(kstr).join(' → '));
    out.push('# ' + head.join('  |  '));
    const res = TL.res;
    const barStr = b => {
      const tok = [];
      for (let k = 0; k < b.nBeats * res; k++) {
        const e = b.events.find(ev => Math.round(ev.off * res) === k);
        const rom = meta && meta.notation === 'roman';
        tok.push(e ? (e.label.nc ? 'N.C.' : cam ? e.label.cam.ascii : rom && e.label.rn ? e.label.rn.ascii : e.label.ascii) : (k % res === 0 ? '/' : '.'));
      }
      return tok.join(' ');
    };
    const per = 4;
    for (let i = 0; i < TL.bars.length; i += per) {
      const chunk = TL.bars.slice(i, i + per);
      for (const k of keys.slice(1)) if (k.bar >= i && k.bar < i + per) out.push(`      [${k.barNum}마디 ${k.beat}박부터 ${kstr(k)}]`);
      const num = String(chunk[0].num).padStart(3, ' ');
      out.push(num + ' | ' + chunk.map(barStr).join(' | ') + ' |');
    }
    return out.join('\n');
  }

  return {
    analyze, buildTimeline, chartText, defaultSettings,
    // 테스트용 내부 함수
    _: { camelot, romanOf, makeRealFFT, resample, estimateTempo, trackBeats, refineFrames, extendBeats, P, getStates, spelling, formatChord, FPS, clearCache: () => stateCache.clear() },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
