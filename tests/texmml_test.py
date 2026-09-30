from texmml import tex2mml
F = [r"y[n] = \sum_{j=0}^{2W-1} x[\,i_n - W + 1 + j\,]\; h(\phi_n + W - 1 - j)",
 r"h(u) = 2f_c\,\mathrm{sinc}(2f_c u)\,w\!\left(\frac{u}{W+1}\right),\quad w(r) = 0.42 + 0.5\cos \pi r + 0.08\cos 2\pi r,\quad f_c = 0.46\,\min\!\left(1, \frac{f_\text{out}}{f_\text{in}}\right)",
 r"X[k] = F_e[k] + e^{-2\pi i k/N} F_o[k],\qquad F_e[k] = \tfrac12\left(Z[k] + \overline{Z[N/2-k]}\right),\quad F_o[k] = -\tfrac{i}{2}\left(Z[k] - \overline{Z[N/2-k]}\right)",
 r"\Delta(t,k) = \max\!\Big(0,\; Y(t,k) - \max_{|\nu| \le 1} Y(t-2,\, k+\nu)\Big)",
 r"J(v) = \pi(v)\cdot \max\!\Big(0,\ \sum_{k=1}^{4} c_k \max_{|\delta| \le \delta_k} \tilde r(k\tau_v + \delta)\Big),\qquad \pi(v) = \exp\!\left(-\frac12 \log_2^2 \frac{v}{110}\right)",
 r"C(t) = \ell(t) + \max_{\tau(t)/2 \le d \le 2\tau(t)}\Big[\,C(t-d) - \alpha \ln^2\frac{d}{\tau(t)}\,\Big]",
 r"\tau_w = \arg\max_{\ell \in [0.85\tau,\ 1.15\tau]} \Big( r_w(\ell) + \tfrac12\, r_w(2\ell) \Big)",
 r"\text{off} > 1.1\cdot\text{on} \;\Rightarrow\; \text{반 박 옮김}",
 r"C(t,q) = \sum_{j:\ \mathrm{round}(\tilde m_j) \bmod 12 = q} A_j\, w(\tilde m_j)\cos^2\!\big(\pi(\tilde m_j - \mathrm{round}(\tilde m_j))\big)",
 r"e_s(c) = \beta\,\langle o_s, T_c\rangle + \pi_q + \pi_\text{inv} + \kappa\,[\,c \subset \text{key}\,] + \eta\,g_s\Big(\ln\big(0.06 + \hat b_s(p_\text{bass})\big) - \ln\big(0.06 + \tfrac{1}{12}\big)\Big)",
 r"V_s(c) = e_s(c) + \max\!\Big(V_{s-1}(c),\ \max_{c'} V_{s-1}(c') - \lambda_s\Big)",
 r"c_i(g) = \max\Big(\mathrm{corr}\big(H_i, \vec K_\text{major}(g)\big),\ \mathrm{corr}\big(H_i, \vec K_\text{minor}(g+9)\big)\Big)",
 r"n_\text{major}(t) = \big((7t + 7) \bmod 12\big) + 1,\qquad x \equiv y \pmod{12}",
 r"t^\text{click}_i = t_s + (b_i + \delta - o_s),\qquad \text{pos}_\text{display} = \text{pos} - L_\text{out}",
 r"y(t) = \sum_k \sum_{s=1}^{S_k} \frac{a_k}{S_k}\left(0.60\,e^{-t/\tau^F_k} + 0.40\,e^{-t/\tau^S_k}\right)\sin\!\left(2\pi f_k 2^{d_s/1200} t + \varphi_k\right)",
 r"B = \frac{\pi^3 E d^4}{64\, T L^2},\qquad \Delta t\,\Delta f \ge \frac{1}{4\pi},\qquad S_n(t) = \sqrt{\frac{f_\text{mid}(t)}{\sigma_\text{mid}}\cdot\frac{f_\text{high}(t)}{\sigma_\text{high}}}"]
ok = 0
for f in F:
    try: m = tex2mml(f); ok += 1
    except Exception as e: print('실패:', e, '|', f[:60])
print('변환 성공', ok, '/', len(F)); print(tex2mml(F[3])[:300]); print(tex2mml(r"\tau", False))
