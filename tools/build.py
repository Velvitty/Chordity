import os, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # 저장소 루트
SRC = os.path.join(ROOT, 'src')
# 엔진 + UI 를 페이지 템플릿에 인라인해 단일 HTML 생성
import re, sys
page = open(os.path.join(SRC, 'page.html'), encoding='utf-8').read()
eng = open(os.path.join(SRC, 'engine.js'), encoding='utf-8').read()
ui = open(os.path.join(SRC, 'ui.js'), encoding='utf-8').read()
assert '/*__ENGINE__*/' in page and '/*__UI__*/' in page
for name, js in (('engine', eng), ('ui', ui)):
    assert '</script' not in js.lower(), name
    assert '<!--' not in js, name
out = page.replace('/*__ENGINE__*/', eng.rstrip()).replace('/*__UI__*/', ui.rstrip())
# 도움말 주소: 저장소에서는 옆 파일(information.html), 미리보기 게시본은 게시된 도움말 주소
info_href = sys.argv[1] if len(sys.argv) > 1 else 'information.html'
out = out.replace('__INFO_HREF__', info_href)
version = open(os.path.join(ROOT, 'VERSION')).read().strip()   # 버전은 VERSION 파일 하나에서
out = out.replace('__VERSION__', version)
assert '__INFO_HREF__' not in out and '__VERSION__' not in out
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'chordity.html')
open(dst, 'w', encoding='utf-8').write(out)
scripts = re.findall(r'<script>(.*?)</script>', out, re.S)
for i, sc in enumerate(scripts):
    open(os.path.join(tempfile.gettempdir(), f'chordity_built_{i}.js'), 'w', encoding='utf-8').write(sc)
ext = re.findall(r'(?:src|href)\s*=\s*"(https?:[^"]+)"', out)
print('written', dst, len(out.encode('utf-8')), 'bytes;', len(scripts), 'scripts; external refs:', ext)
