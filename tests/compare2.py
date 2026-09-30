# 여러 설정의 통합 채점(JSONL)을 묶음별 합계와 곡별 차이로 비교
import json, sys
names = sys.argv[1::2]; files = sys.argv[2::2]
D = [{j['name']: j for j in map(json.loads, open(f, encoding='utf-8'))} for f in files]
G = {'R': '회귀 18곡(대중)', 'P': '대중음악형 새 곡', 'S': '특수 장르'}
def agg(d, g):
    xs = [v for v in d.values() if v['grp'] == g]
    s = lambda k: sum(v[k] for v in xs)
    return dict(beat=100 * s('hit') / s('nb'), off=s('off'), down=100 * s('dh') / s('nd'), extra=s('extra'), ex=100 * s('ex') / s('tot'), fam=100 * s('fam') / s('tot'), root=100 * s('root') / s('tot'),
                key=sum(1 for v in xs if v['keyOk']) if g == 'R' else None, sec=sum(v['sec'] for v in xs) / len(xs))
for g in 'RPS':
    print(f'【{G[g]}】')
    for nm, d in zip(names, D):
        a = agg(d, g)
        print(f'  {nm:10} 비트 {a["beat"]:5.1f}%  엇박 {a["off"]:3}  첫박 {a["down"]:5.1f}% (+{a["extra"]})  코드 정확 {a["ex"]:5.1f}% 계열 {a["fam"]:5.1f}% 근음 {a["root"]:5.1f}%' + (f'  조성 {a["key"]}/18' if a['key'] is not None else '') + f'  분석 {a["sec"]:.2f}s')
print('【곡별 차이】(첫 설정 대비)')
for k, v0 in D[0].items():
    row = []
    for nm, d in zip(names[1:], D[1:]):
        v = d.get(k)
        if not v: continue
        diff = [f'{q} {v0[q]}→{v[q]}' for q in ['hit', 'off', 'meter', 'dh', 'extra', 'ex', 'keyOk'] if v0.get(q) != v.get(q)]
        if diff: row.append(f'{nm}: ' + ', '.join(diff))
    if row: print(f'  {k[:22]:22} ' + ' | '.join(row))
