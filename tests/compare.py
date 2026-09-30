# 기준선(base/)과 새 결과(new/)를 곡마다 나란히 비교
import re, sys
def parse_reg(path):
    out = {}
    for l in open(path, encoding='utf-8'):
        m = re.match(r'^(.{26}) bpm\s+([\d.]+)/\d+\s+beats (\d+)/(\d+) off (\d+)\s+err ([-\d.]+)±([\d.]+)ms\s+(\S+)\s+down (\d+)/(\d+)(?: extra (\d+))?\s+chords ([\d.]+)%', l)
        if m: out[m.group(1).strip()] = dict(bpm=float(m.group(2)), beats=f'{m.group(3)}/{m.group(4)}', off=int(m.group(5)), mae=float(m.group(7)), meter=m.group(8), down=f'{m.group(9)}/{m.group(10)}' + (f'+{m.group(11)}' if m.group(11) else ''), chords=float(m.group(12)))
    return out
def parse_stress(path):
    out = {}
    for l in open(path, encoding='utf-8'):
        m = re.match(r'^(.+?)\s+템포 ([\d.]+)/\S+\s+비트 (\d+/\d+)(?: \(2박 층위 (\d+)%\))?\s+엇박 (\d+)\s+(\S+)\s+첫박 (\d+/\d+)\s+코드 정확 (\d+)% 계열 (\d+)% 근음 (\d+)%\s+조성 (.*)$', l)
        if m: out[m.group(1).strip()] = dict(bpm=float(m.group(2)), beats=m.group(3) + (f'(2박 {m.group(4)}%)' if m.group(4) else ''), off=int(m.group(5)), meter=m.group(6), down=m.group(7), ex=int(m.group(8)), fam=int(m.group(9)), root=int(m.group(10)), key=m.group(11).strip())
    return out
b, n = parse_reg('base/regress.txt'), parse_reg('new/regress.txt')
print('【합성 회귀 18곡】 바뀐 곡만(비트·엇박·박자·첫박·코드)')
same = 0
for k in b:
    x, y = b[k], n.get(k)
    if not y: print('  누락', k); continue
    keys = ['beats', 'off', 'meter', 'down', 'chords']
    if all(x[q] == y[q] for q in keys): same += 1; continue
    print(f'  {k:26} ' + '  '.join(f'{q} {x[q]}→{y[q]}' for q in keys if x[q] != y[q]))
print(f'  그대로: {same}/{len(b)}')
bs, ns = parse_stress('base/stress.txt'), parse_stress('new/stress.txt')
POP = ['템포 급변 96→132', '루바토 피아노 66', '코드 밖 베이스(F/G 등) 100', '테이프 음높이 0→+40 cent', '케이팝·EDM 126', '팝록 파워 코드→3화음 138', 'R&B 발라드 슬래시 72', '드럼이 큰 힙합 90', '어쿠스틱 스트로크 팝 104']
order = [k for k in bs if k in POP] + [k for k in bs if k not in POP]
print('【새 곡: 대중음악형 9 / 특수 장르 7】')
for k in order:
    if k == order[len([q for q in bs if q in POP])] : print('  --- 특수 장르')
    x, y = bs[k], ns.get(k)
    if not y: print('  누락', k); continue
    print(f'  {k[:18]:18} 비트 {x["beats"]}→{y["beats"]}  엇박 {x["off"]}→{y["off"]}  박자 {x["meter"]}→{y["meter"]}  첫박 {x["down"]}→{y["down"]}  코드(정확/계열/근음) {x["ex"]}/{x["fam"]}/{x["root"]}→{y["ex"]}/{y["fam"]}/{y["root"]}  조성 {x["key"]}→{y["key"]}')
kb = sum(1 for l in open('base/key.txt', encoding='utf-8') if '✓' in l); kn = sum(1 for l in open('new/key.txt', encoding='utf-8') if '✓' in l)
rb = sum(1 for l in open('base/roman.txt', encoding='utf-8') if l.startswith('✓')); rn = sum(1 for l in open('new/roman.txt', encoding='utf-8') if l.startswith('✓'))
print(f'【조성·전조】 {kb}/18 → {kn}/18   【로마 숫자】 {rb}/3 → {rn}/3')
print('【실제 녹음】 기준선:', open('base/real.txt', encoding='utf-8').readline().strip(), '| 새:', open('new/real.txt', encoding='utf-8').readline().strip())
rl_b = [l.strip() for l in open('base/real.txt', encoding='utf-8')][1:11]; rl_n = [l.strip() for l in open('new/real.txt', encoding='utf-8')][1:11]
diff = [(x, y) for x, y in zip(rl_b, rl_n) if x != y]
print('  첫 10마디 코드 차이:', len(diff), '마디', *(f'\n    {x}\n  → {y}' for x, y in diff[:4]))
