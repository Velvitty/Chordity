#!/bin/sh
# 사용: sh run3.sh 결과파일 [엔진] [덮어쓸 설정]  — 두 묶음을 병렬로 끝까지
# 묶음 하나라도 도중에 멈추면 종료 코드 1(반쯤 찬 결과로 비교가 이어지지 않게)
OUT=$1; ENG=${2:-../src/engine.js}; OV=${3:-}
ENGINE=$ENG node evalset.js $OUT 0 2 "$OV" & P0=$!
ENGINE=$ENG node evalset.js $OUT 1 2 "$OV" & P1=$!
RC=0; wait $P0 || RC=1; wait $P1 || RC=1
exit $RC
