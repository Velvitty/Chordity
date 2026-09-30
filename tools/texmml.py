# 도움말 페이지용 LaTeX(일부) → MathML 변환기. 외부 라이브러리 없이 브라우저가 직접 그리는 수식을 만든다.
import re
from html import escape as _esc

def esc(s): return _esc(s, quote=False)

GREEK = {'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ϵ', 'varepsilon': 'ε', 'zeta': 'ζ', 'eta': 'η',
         'theta': 'θ', 'kappa': 'κ', 'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'pi': 'π', 'rho': 'ρ', 'sigma': 'σ',
         'tau': 'τ', 'phi': 'ϕ', 'varphi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω', 'ell': 'ℓ',
         'Delta': 'Δ', 'Lambda': 'Λ', 'Sigma': 'Σ', 'Omega': 'Ω', 'Gamma': 'Γ', 'Theta': 'Θ', 'Pi': 'Π', 'Phi': 'Φ', 'Psi': 'Ψ'}
UPRIGHT = {'Delta', 'Lambda', 'Sigma', 'Omega', 'Gamma', 'Theta', 'Pi', 'Phi', 'Psi'}
SYMS = {'le': '≤', 'ge': '≥', 'leq': '≤', 'geq': '≥', 'approx': '≈', 'equiv': '≡', 'in': '∈', 'subset': '⊂', 'to': '→',
        'leftarrow': '←', 'rightarrow': '→', 'Rightarrow': '⇒', 'gg': '≫', 'll': '≪', 'gtrsim': '≳', 'propto': '∝',
        'times': '×', 'cdot': '·', 'pm': '±', 'land': '∧', 'lor': '∨', 'iff': '⟺', 'neq': '≠', 'infty': '∞',
        'dots': '…', 'ldots': '…', 'cdots': '⋯', 'langle': '⟨', 'rangle': '⟩', 'lceil': '⌈', 'rceil': '⌉',
        'lvert': '|', 'rvert': '|', 'mid': '∣', 'sum': '∑', 'prod': '∏'}
FUNCS = {'max', 'min', 'arg', 'ln', 'log', 'exp', 'sin', 'cos', 'tan', 'lim', 'sup', 'inf'}
LIMITS = {'max', 'min', 'lim', 'sup', 'inf', 'sum', 'prod'}
SPACE = {',': '0.1667em', ':': '0.2222em', ';': '0.2778em', ' ': '0.25em', 'quad': '1em', 'qquad': '2em', '!': ''}
DELIM = {'\\{': '{', '\\}': '}', '\\lvert': '|', '\\rvert': '|', '\\langle': '⟨', '\\rangle': '⟩', '\\|': '‖'}
BIG = {'big': '1.2em', 'Big': '1.6em', 'bigg': '2.1em', 'Bigg': '2.6em'}
TOK = re.compile(r'\\\\|\\[A-Za-z]+|\\.|[{}^_&]|\s+|[0-9]+(?:\.[0-9]+)?|.', re.S)

class Conv:
    def __init__(self, src, display):
        self.texts = []
        def keep(m):
            self.texts.append((m.group(1), m.group(2)))
            if len(self.texts) > 26: raise ValueError('한 수식의 \\text·\\mathrm 은 26개까지')   # 자리표시 이름이 A~Z 한 글자
            return '\\KEEP' + chr(65 + len(self.texts) - 1) + ' '
        src = re.sub(r'\\(text|mathrm)\{([^{}]*)\}', keep, src)       # 글자 부분은 토큰으로 쪼개지 않음
        self.t = [x for x in TOK.findall(src) if not x.isspace()]
        self.i = 0
        self.display = display

    def peek(self): return self.t[self.i] if self.i < len(self.t) else None
    def next(self):
        tok = self.peek(); self.i += 1; return tok
    def expect(self, x):
        if self.next() != x: raise ValueError('기대한 토큰 ' + x + ' 없음')

    def expr(self, stop):
        out = []
        while True:
            tok = self.peek()
            if tok is None or tok == stop: break
            a = self.atom()
            if a and a[0]: out.append(self.scripts(a))
        return ''.join(out)

    def arg(self):
        if self.peek() == '{':
            self.next(); inner = self.expr('}'); self.expect('}'); return inner
        tok = self.peek()
        if tok and re.fullmatch(r'[0-9]{2,}', tok):          # LaTeX 처럼 괄호 없는 인수는 숫자 한 자리(\tfrac12 = 1/2)
            self.t[self.i] = tok[1:]
            return '<mn>' + tok[0] + '</mn>'
        a = self.atom()
        return a[0] if a else ''

    def scripts(self, a):
        mml, kind = a
        sub = sup = None
        while self.peek() in ('^', '_'):
            t = self.next(); v = self.arg()
            if t == '^': sup = v
            else: sub = v
        if sub is None and sup is None: return mml
        wrap = lambda x: '<mrow>' + x + '</mrow>'
        if kind == 'lim' and self.display:
            if sub is not None and sup is not None: return '<munderover>' + mml + wrap(sub) + wrap(sup) + '</munderover>'
            if sub is not None: return '<munder>' + mml + wrap(sub) + '</munder>'
            return '<mover>' + mml + wrap(sup) + '</mover>'
        if sub is not None and sup is not None: return '<msubsup>' + mml + wrap(sub) + wrap(sup) + '</msubsup>'
        if sub is not None: return '<msub>' + mml + wrap(sub) + '</msub>'
        return '<msup>' + mml + wrap(sup) + '</msup>'

    def atom(self):
        tok = self.next()
        if tok is None: return None
        if tok == '{':
            inner = self.expr('}'); self.expect('}'); return ('<mrow>' + inner + '</mrow>', 'n')
        if re.fullmatch(r'[0-9]+(\.[0-9]+)?', tok): return ('<mn>' + tok + '</mn>', 'n')
        if tok == "'": return ('<mo>′</mo>', 'n')
        if tok.startswith('\\'): return self.command(tok)
        if tok.isalpha(): return ('<mi>' + esc(tok) + '</mi>', 'n')
        if tok == '|': return ('<mo stretchy="false" lspace="0" rspace="0">|</mo>', 'n')   # 절댓값 막대는 여백 없이
        if tok in '()[]': return ('<mo stretchy="false">' + esc(tok) + '</mo>', 'n')
        if tok == '-': return ('<mo>\u2212</mo>', 'n')
        return ('<mo>' + esc(tok) + '</mo>', 'n')

    def delim(self):
        d = self.next()
        return DELIM.get(d, d)

    def command(self, tok):
        name = tok[1:]
        if name.startswith('KEEP'):
            kind, body = self.texts[ord(name[4]) - 65]
            if kind == 'text': return ('<mtext>' + esc(body) + '</mtext>', 'n')
            return ('<mi mathvariant="normal">' + esc(body) + '</mi>' if len(body) == 1 else '<mi>' + esc(body) + '</mi>', 'n')
        if name in ('frac', 'tfrac', 'dfrac'):
            a = self.arg(); b = self.arg()
            ds = ' displaystyle="false"' if name == 'tfrac' else ''
            return ('<mfrac' + ds + '><mrow>' + a + '</mrow><mrow>' + b + '</mrow></mfrac>', 'n')
        if name == 'sqrt':
            if self.peek() == '[': raise ValueError('지원하지 않는 명령 \\sqrt[n]')   # 거듭제곱근은 조용히 틀리게 그리지 않고 멈춤
            return ('<msqrt><mrow>' + self.arg() + '</mrow></msqrt>', 'n')
        if name in ('hat', 'bar', 'tilde', 'vec', 'widehat', 'overline'):
            ch = {'hat': '^', 'widehat': '^', 'bar': '\u00AF', 'overline': '\u203E', 'tilde': '~', 'vec': '→'}[name]
            st = 'true' if name in ('widehat', 'overline') else 'false'
            return ('<mover accent="true"><mrow>' + self.arg() + '</mrow><mo stretchy="' + st + '">' + ch + '</mo></mover>', 'n')
        if name == 'left':                                   # \left( … \right) 를 짝지어 한 묶음으로
            lch = self.delim()
            inner = self.expr('\\right')
            self.expect('\\right')
            rch = self.delim()
            mo = lambda ch: '' if ch == '.' else '<mo stretchy="true">' + esc(ch) + '</mo>'
            return ('<mrow>' + mo(lch) + inner + mo(rch) + '</mrow>', 'n')
        if name in BIG:
            ch = self.delim()
            return ('<mo stretchy="true" minsize="' + BIG[name] + '" maxsize="' + BIG[name] + '">' + esc(ch) + '</mo>', 'n')
        if name in GREEK:
            v = ' mathvariant="normal"' if name in UPRIGHT else ''
            return ('<mi' + v + '>' + GREEK[name] + '</mi>', 'n')
        if name in SYMS: return ('<mo>' + SYMS[name] + '</mo>', 'lim' if name in LIMITS else 'n')
        if name in FUNCS: return ('<mi>' + name + '</mi>', 'lim' if name in LIMITS else 'n')
        if name in SPACE: return (('<mspace width="' + SPACE[name] + '"/>') if SPACE[name] else '', 'n')
        if name == 'bmod': return ('<mo lspace="0.3em" rspace="0.3em">mod</mo>', 'n')
        if name == 'pmod':
            x = self.arg()
            return ('<mrow><mspace width="0.4em"/><mo>(</mo><mi>mod</mi><mspace width="0.3em"/>' + x + '<mo>)</mo></mrow>', 'n')
        if name in ('{', '}'): return ('<mo>' + name + '</mo>', 'n')
        raise ValueError('지원하지 않는 명령 ' + tok)

def tex2mml(src, display=True):
    c = Conv(src, display)
    body = c.expr(None)
    if c.peek() is not None: raise ValueError('남은 토큰: ' + ''.join(c.t[c.i:c.i + 8]))
    attr = ' display="block"' if display else ''
    return '<math' + attr + '><mrow>' + body + '</mrow></math>'
