# Chordity — Claude Code 작업 안내

Chordity는 음악 파일을 브라우저에서 분석해 마디별 코드 차트와 음악에 맞춘 메트로놈을 보여 주는 **단일 HTML 도구**입니다. 모든 분석은 클라이언트(Web Audio API)에서 하고, 외부 라이브러리·CDN·서버를 쓰지 않습니다. 이 파일은 개발 이어받기용 안내이며, 공개 문서는 `README.md`와 `information.html`(도움말)입니다.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `src/engine.js` | 분석 엔진(리듬·박·박자·첫 박·템포·코드·조성·로마 숫자·카멜롯·철자) |
| `src/ui.js` | 화면(차트, 재생·메트로놈·코드 연주, 보정, 설정, 테마) |
| `src/page.html` | 앱 페이지 틀과 CSS(`/*__ENGINE__*/`, `/*__UI__*/`, `__VERSION__`, `__INFO_HREF__` 자리표시) |
| `src/info.src.html` | 도움말 원본(`\( \)`·`\[ \]` 수식은 빌드 때 MathML로) |
| `tools/build.py` | `src/`를 합쳐 `chordity.html` 만들기 |
| `tools/build_info.py`, `tools/texmml.py` | 도움말 `information.html` 만들기(수식 변환기 포함, 외부 의존 없음) |
| `chordity.html`, `information.html`, `docs/` | 빌드 결과와 README 이미지(저장소에 함께 둠) |
| `tests/` | 합성곡 생성기, 채점기, 비교·진단 스크립트, 브라우저 시험, 기준 결과(`tests/baselines/`) |
| `VERSION` | 버전 한 곳(앱·도움말 머리의 배지에 들어감) |
| `LICENSE` | 이용 조건. README 맨 위 안내와 앱·도움말 바닥글의 저작권·이용 조건 줄은 이 내용의 요약 |

## 빌드

```
python3 tools/build.py              # chordity.html  (인자: [도움말 주소] [출력 경로])
python3 tools/build_info.py         # information.html (인자: [앱 주소] [출력 경로])
npm run build                       # 둘 다
```

빌드 스크립트는 합친 스크립트를 임시 폴더에 `chordity_built_0.js`(엔진), `chordity_built_1.js`(UI)로도 써 두므로 `node --check`로 문법을 확인할 수 있습니다(경로는 빌드 출력 끝에 나옴). 외부 참조(`http(s)://` src·href)나 남은 LaTeX·수식 구분자가 있으면 빌드가 멈춥니다. 출력은 운영체제와 관계없이 LF이고, 지금 `src/`로 빌드하면 저장소의 `chordity.html`·`information.html`과 바이트 단위로 같습니다.

## 시험과 검증

준비: `npm install`, `npx playwright install chromium`, 그다음 `npm run wavs`(시험용 합성 WAV: `make-wavs.js`의 13곡과 `hold_truth.json`, 옛 진단 스크립트용 `mkwav.js`의 `test-*.wav/json`, README 표기 이미지용 `demo-eb.wav`). 시험 스크립트는 **`tests/` 폴더에서** 실행합니다. npm 스크립트는 POSIX 셸(macOS·Linux)을 전제합니다(Windows는 WSL이나 Git Bash).

브라우저를 내려받을 수 없는 환경(Claude Code 클라우드 등)에 Chromium이 미리 깔려 있으면, 그 리비전에 맞는 Playwright를 저장 없이 설치한다. 예: `/opt/pw-browsers/chromium-1194`면 `npm install --no-save playwright@1.56.1`(생긴 `package-lock.json`은 지움).

| 명령 | 내용 |
|---|---|
| `npm run eval` | 합성곡 37곡(회귀 18곡 + 대중음악형 + 특수 장르)을 채점해 `baselines/ev_184.jsonl`(현재 기준)과 묶음별·곡별로 비교. 1.9.1은 기준과 곡별 차이 없음 |
| `node test.js`, `node keytest.js`, `npm run test:roman` | 회귀 18곡, 조성·전조, 로마 숫자 시험. 조성·로마 숫자는 `baselines/v142/key.txt`·`roman.txt`와 같아야 함 |
| `npm run test:real` | 실제 녹음이 1.4.2와 같은지(코드·첫 박·비트). `tests/assets/README.md`의 자료가 필요. 인자 `X`는 스위치를 뒤집지 않고 채택한 설정 한 줄만 돌린다는 뜻(인자 없이는 스위치를 하나씩 뒤집어 비교). 합격 여부는 자동 판정하지 않으니 README 값(코드 100%, 첫 박 66/66, 비트 257/257)과 눈으로 대조 |
| `npm run test:labels` | 조사 규칙 전수 대조(516개), 코드 이름표 전수(76만여 개), 기능 철자 전수(36만여 개) |
| `npm run test:ui` | 이름표 화면(32항목), 재생 막대 템포(13항목), 회색 표시(패드 곡 8곳 중 7곳 이상, 팝 회색 0), 곡 따라 타건(`e2e-song.js`), 테마 막대(98항목) 브라우저 시험 |
| `npm run test:tex` | 도움말 수식 변환기 시험 |
| `npm run shots` | README 이미지 다시 찍기: 스크린샷 2장(`shots.js`)과 코드 표기 이미지 3장(`notation-shots-eb.js`, `demo-eb.wav` 필요) |

시험 스크립트(위 표의 것과 `e2e-hold.js`, `e2e-song.js`, `keytest.js`)는 실패하면 종료 코드 1을 내므로 npm 사슬(`&&`)이 거기서 멈춘다. `test.js`는 수치만 출력하니 `baselines/v142/regress.txt`와 대조한다. `run3.sh`는 채점 묶음 하나라도 멈추면, `compare2.py`는 첫 파일의 곡이 뒤 파일에 빠지면 종료 코드 1.

`tests/stress.js`의 `CASES`가 합성곡 목록(대중음악형은 `POPULAR`), `tests/testlib.js`가 회귀 18곡과 생성기입니다. 생성기 코드 표기에서 `~`는 앞 코드를 새로 치지 않고 끌어 둠(패드 방식에서 의미 있음)입니다.

## 검증 시 기준(꼭 지킬 것)

- **대중음악 우선.** 대중음악 곡(회귀 18곡, 대중음악형 곡, 실제 녹음)의 결과가 나빠지는 수정은 특수 장르(재즈·메탈 등)가 좋아져도 넣지 않는다. 대중음악이 좋아지면 특수 장르가 조금 나빠져도 넣는다.
- **퇴행 금지.** 알고리즘을 바꾸면 `npm run eval`로 곡별 차이를 보고, 실제 녹음 일치(`test:real`)와 로마 숫자 시험을 확인한다. 효과가 증명되지 않은 규칙은 넣지 않는다(되돌린다).
- **새 기능은 스위치로.** 엔진의 설정 객체 `P`에 켜고 끄는 스위치를 두고 켜기 전·후를 비교한 뒤 기본값을 정한다. 넣지 않은 방법도 꺼진 스위치로 남겨 비교를 다시 할 수 있게 한다.
- **UI는 재서 확인.** 명암비(비텍스트 3:1 이상), 정렬(요소 상자 오차), 모바일 폭(360·375·390px 넘침·줄바꿈)을 브라우저에서 측정하고 사진으로 본다.

## 작업 원칙

- 결과물은 외부 파일 없는 단일 HTML(JS·CSS 인라인). 외부 라이브러리·CDN 금지.
- **코드 주석은 한국어.**
- `README.md` 등 공개 문서는 **그 문서를 읽을 사용자 대상으로만** 쓴다. 저장소 주인에게 하는 안내·지시나 대화에서 나온 표현은 넣지 않는다.
- 버전: `주.부.빌드`. 새 기능은 부 번호, 고침·작은 개선은 빌드 번호를 올린다. `VERSION`만 바꾸면 앱·도움말에 들어간다. README 끝의 업데이트 내역에 사용자 입장의 문장으로 적는다.
- 저장소 반영은 **git 커밋으로**(GitHub 웹 화면 업로드 쓰지 않음). 릴리스는 `release/x.y.z` 브랜치에 커밋한다.
- 파일을 묶어 전달할 때는 **무압축 zip**. 배포 zip에는 `LICENSE`를 함께 넣는다.
- 이용 조건을 바꾸면 `LICENSE`, README 맨 위 안내, 앱(`src/page.html`)·도움말(`src/info.src.html`) 바닥글의 저작권·이용 조건 줄을 함께 고친다.

릴리스 순서: 스위치 비교와 검증 → `VERSION` → `npm run build` → 시험(eval, real, roman, labels, ui) → `npm run shots` → README·도움말(`src/info.src.html`) 갱신 → 다시 빌드 → 커밋.

## 엔진 요약

- 리듬: 22,050 Hz, STFT N=1024, hop=256(약 86.13 fps). 8초 창 국소 템포(7창 중앙값), Ellis(2007) DP 박 추적, 정박·박 단계 검증.
- 화성: 11,025 Hz 피크 크로마(트레블·베이스), 6배음 템플릿, 코드 HMM, 조성 HMM(KK 프로필), 로마 숫자·카멜롯.
- 설정 객체 `P`의 스위치(켬): `LOCAL_TEMPO`(국소 템포 곡선, `TEMPO_HMM`은 이 안에서만 작동), `TEMPO300`, `WALK_DOUBLE`, `TEMPO_HMM`(템포 도약만 판정), `METERS_EXT`(4·3박에 5·7박 후보 추가, 반 마디 증거가 `HALF_BAR` 이상이면 2박), `POWER`(곡 단위 조건), `SLASH2`(F/G형), `INV_SMOOTH`, `METER_CHANGE`(박자 변화, 새 박자가 4마디 이상), `RESTRIKE`(회색은 새로 치지 않은 코드만, 어택 비 1.2), `EDGE_ATTACK`(약박 바뀜을 앞 강박으로).
- 비교했지만 넣지 않음(끔): `VARIANTS`(9·13 확장음, 실제 녹음 코드 18% 바뀜), `HPSS`(대중음악 이득 없이 분석 시간 2배), `NNLS`(대중음악 코드 정확도 하락), `BAR_POINTER`(손으로 만든 활성으로는 층위·박자를 못 가름).
- 템포 표시: 박마다 템포(앞뒤 4박 간격 중앙값), 급변 표시(앞뒤 8박 템포의 |로그 비| 0.12 이상 ≈12%, 직전 표시와 0.08 이상 ≈8%, 직전 표시에서 16박 이상 떨어져야), 서서히 바뀌는 구간(다듬은 템포가 한 방향으로 8% 넘게, 16박 이상).
- 코드 이름 철자: 로마 숫자의 도수로 글자를 정하고 임시표를 붙임(C 장조 ♭II = D♭). 겹임시표나 조에 없는 F♭·C♭·E♯·B♯는 한소리 이름.

## 화면 설계 결정(사용자와 정한 것)

- 조성·박자 이름표(검은 알약, 위쪽): 곡 첫 마디에는 시작 값(`C 장조`, `4/4`), 바뀐 곳에는 새 값에 맞춤법대로 `로/으로`(`D 장조로`, `3/4으로`). 조사는 조 이름·카멜롯·박자·템포 네 종류에만(코드 이름에는 붙이지 않음).
- 템포(흰 알약, 슬래시 아래 줄): 곡 첫 박은 숫자만(`72`), 급변한 곳은 `132로`·`63으로`.
- 서서히 바뀌는 구간: 슬래시 아래 줄의 긴 육각형 틀(양 끝 삼각형). 평소 `여기까지 63`, 재생 위치가 안에 있으면 `현재 67`. 재생 중 지나온 만큼 형광펜 색으로 차고, 도착 박에서 0.8초 동안 옅어짐. 도착 알약은 도착 박에서 **한 박 × 1.1 + 0.06초** 동안 켜짐(페이드 없음).
- 위쪽 템포 칸과 재생 막대(스크롤해도 고정)의 템포는 박마다 바뀜.
- 회색 코드 = 앞 마디 코드를 새로 치지 않고 끌어 둠. 코드 연주 기본 "곡 따라": 검은 글자에서 다시 치고 회색에서는 이어 울림.
- 테마: 시스템·밝게·어둡게 세 칸 막대(코드 표기 막대와 같은 모양, 고른 칸을 글자색으로 채움), 바탕이 80ms 가감속으로 미끄러짐, 앱과 도움말이 저장값 `chordity-prefs-v1`의 `theme`을 함께 씀.
- 앱 좁은 화면: 머리글 `flex-wrap`(약 310px 미만에서 테마 막대가 다음 줄), 359px 이하 볼륨 슬라이더 셋이 폭을 나눠 가짐, 보정 패널 선택 상자 `max-width: 100%`(`border-box`, 높이 36px 유지), 텍스트 차트 상자 `border-box`(높이 246px 유지), 패널 제목 `keep-all`. 280~1180px에서 화면 넘침과 부모 상자 넘침 0.
- 도움말 머리글: 480px 이하에서 '도움말' 딱지 숨김(자리가 모자라면 딱지 글자가 세로로 눌려 머리글이 커짐), 900px 이하에서는 빈 칸(`.grow`) 대신 테마 막대에 `margin-left: auto`, 360px 이하 여백 12px, 그래도 안 들어가면(315px 이하) 테마 막대가 다음 줄로(`flex-wrap`).
- 바닥글: 정확도 안내(누르면 도움말) 아래에 저작권·이용 조건 한 줄(`© 2026 Velvitty 및 Chordity 공동작업자 · 기여자` + LICENSE 요약). 글자색 `--foot`(밝게 #666e7b, 종이 위 4.65:1 / 어둡게 #8d95a1, 5.89:1).

## 알려진 한계

스윙 재즈 근음 약 32%, 보사노바는 두 배 길이 마디로 잡힘, 디스토션이 강한 메탈의 파워 코드·조성, 레게 원드롭은 두 배 템포, 6마디보다 짧은 전조, 단박자↔겹박자를 오가는 곡, 이음매 없이 다시 치는 패드는 회색으로 남을 수 있음. 자세한 목록은 README의 4-8(레게는 4-4 표).

## 이 대화 환경에서 옮겨 올 때 달라진 점

- 경로를 저장소 기준으로 바꿨다(원래는 `/home/claude/chord`, `/mnt/user-data/outputs`, `/tmp`). 진단 스크립트의 임시 파일은 운영체제 임시 폴더를 쓴다.
- claude.ai 게시 미리보기용 빌드(도움말·앱 주소를 게시 주소로 넣는 것)는 빌드 인자로만 남아 있고, 저장소 기본값은 옆 파일(`information.html`, `chordity.html`)이다.
- `tests/`에는 개발 중 쓴 진단 스크립트(diag*, sweep, levdiag 등)도 그대로 들어 있다. 핵심은 위 표의 스크립트들이다.
- 옮긴 뒤 진단 스크립트의 옛 이름·경로(`chord-chart.html`, `tests/ui.js`, `#themeBtn`, `#selNotation`, 도착 알약 `63`)는 지금 것으로 고쳤다. 그래도 그대로 돌지 않는 것: `verify-theme.js`(개발 중 모형 `/tmp/theme-sim.html`용, `verify-theme-app.js`로 대체), `compare.py`·`runall.sh`(옛 `base/`·`new/` 비교, `compare2.py`로 대체), `e2e-ramp.js`(1.7.0 구조, `e2e-ramp2.js`로 대체), `tight.js`(없어진 `P.TIGHT`), `flagdiag.js`·`sweep.js`·`realagree.js`의 스위치 목록은 1.8 이후 스위치(`METER_CHANGE`, `RESTRIKE`, `EDGE_ATTACK`)를 빠뜨림.
- 실제 녹음 자료(`tests/assets/song.*`)는 저장소에 없으므로 `test:real`과 `calib.js`·`diag_*`·`keyreal.js`·`e2e-key/cam/roman.js`는 자료를 넣어야 돈다.
