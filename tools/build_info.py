# 도움말 페이지 만들기: info.src.html 의 \( \)·\[ \] 수식을 MathML 로 바꾸고 앱 주소를 채움
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # 저장소 루트
SRC = os.path.join(ROOT, 'src')
from texmml import tex2mml
app_href = sys.argv[1] if len(sys.argv) > 1 else 'chordity.html'
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'information.html')
src = open(os.path.join(SRC, 'info.src.html'), encoding='utf-8').read()
cnt = {'block': 0, 'inline': 0}
def blk(m):
    cnt['block'] += 1
    return '<div class="eq">' + tex2mml(m.group(1).strip(), True) + '</div>'
def inl(m):
    cnt['inline'] += 1
    return tex2mml(m.group(1).strip(), False)
out = re.sub(r'\\\[(.+?)\\\]', blk, src, flags=re.S)
out = re.sub(r'\\\((.+?)\\\)', inl, out, flags=re.S)
out = out.replace('__APP_HREF__', app_href)
out = out.replace('__VERSION__', open(os.path.join(ROOT, 'VERSION'), encoding='utf-8').read().strip())   # 버전은 VERSION 파일 하나에서
left = re.findall(r'\\(?:frac|sum|tau|text|mathrm|left|right|max|ln)\b', out)
assert not left and '__APP_HREF__' not in out and '__VERSION__' not in out, ('남은 LaTeX', left[:5])
assert not re.search(r'\\[()\[\]]', out), ('짝이 맞지 않아 남은 수식 구분자', re.findall(r'.{0,20}\\[()\[\]].{0,20}', out)[:3])
ext = re.findall(r'(?:src|href)\s*=\s*"(https?:[^"]+)"', out)
assert not ext, ('외부 참조', ext)   # 외부 파일·CDN 금지
open(dst, 'w', encoding='utf-8', newline='\n').write(out)   # 운영체제와 관계없이 LF
print(f'written {dst} {len(out.encode())} bytes; 수식 블록 {cnt["block"]}, 문장 속 수식 {cnt["inline"]}; 앱 주소 {app_href}')
