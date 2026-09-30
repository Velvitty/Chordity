#!/bin/sh
# 모든 시험을 new/ 에 저장(병렬)
mkdir -p new
node test.js > new/regress.txt 2>&1 &
: # stress는 따로
node keytest.js > new/key.txt 2>&1 &
node roman.js > new/roman.txt 2>&1 &
node roman-real.js > new/real.txt 2>&1 &
wait
