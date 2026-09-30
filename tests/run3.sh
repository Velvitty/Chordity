#!/bin/sh
# 사용: sh run3.sh 결과파일 [엔진] [덮어쓸 설정]  — 두 묶음을 병렬로 끝까지
OUT=$1; ENG=${2:-../src/engine.js}; OV=${3:-}
ENGINE=$ENG node evalset.js $OUT 0 2 "$OV" & ENGINE=$ENG node evalset.js $OUT 1 2 "$OV" & wait
