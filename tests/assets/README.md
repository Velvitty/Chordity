# 실제 녹음 시험 자료(저장소에 올리지 않음)

`realagree.js`, `realhp.js`, `calib.js`, `e2e-key.js` 등은 실제 녹음 한 곡으로 결과가 바뀌지 않았는지 확인합니다. 기준 곡은 최호섭 「세월이 가면」(68 BPM, E♭ 장조 → E 장조)입니다. 저작권이 있는 음원이므로 이 폴더는 `.gitignore`로 제외하고, 각자 가진 파일을 넣습니다.

- `song.mp3`: 원본 파일
- `song.f32`: 44.1 kHz 스테레오 32비트 실수 PCM(인터리브). 만드는 법:

```
ffmpeg -i song.mp3 -f f32le -ac 2 -ar 44100 song.f32
```
