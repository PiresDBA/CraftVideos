"""Monta a pagina de aprovacao dos personagens (imagens embutidas em base64).

Porque base64: a pagina funciona em file://, offline e em qualquer browser, sem
depender de caminhos relativos quebrados.
"""
import base64
import html
from pathlib import Path

CHARS = Path(r"D:\CRAFT\work\frida-luna\chars")
OUT = Path(r"D:\CRAFT\work\frida-luna\APROVACAO.html")

ORDER = [
    ("frida-v2-ok-flat.png", "Frida — LIMPA (halo removido) — aprovada?"),
    ("luna-v2-ok-flat.png", "Luna — LIMPA (halo removido) — aprovada?"),
    ("frida-v2.png", "Frida — original com halo de autocolante (só referência)"),
    ("luna-v2.png", "Luna — original (só referência)"),
    ("frida-expressoes.png", "Frida — grelha antiga (reprovada por inconsistência)"),
    ("luna-expressoes.png", "Luna — grelha antiga (reprovada por inconsistência)"),
    ("expressoes-v2/_contact.png", "Expressões v2 — consistentes, corpo fixo"),
]

cards = []
for name, title in ORDER:
    p = CHARS / name
    if not p.exists():
        cards.append(f"<section><h2>{html.escape(title)}</h2><p class=miss>ainda não gerado ({html.escape(name)})</p></section>")
        continue
    b64 = base64.b64encode(p.read_bytes()).decode("ascii")
    kb = len(p.read_bytes()) / 1024
    cards.append(
        f"<section><h2>{html.escape(title)}</h2>"
        f"<p class=meta>{html.escape(name)} · {kb:.0f} KB</p>"
        f"<img src='data:image/png;base64,{b64}' alt='{html.escape(title)}'></section>"
    )

doc = f"""<!doctype html>
<html lang=pt><head><meta charset=utf-8><title>Aprovação — Frida & Luna</title>
<style>
 body{{background:#f4e9d8;color:#2b2118;font:16px/1.5 system-ui,Segoe UI,sans-serif;margin:0;padding:28px}}
 h1{{font-size:26px;margin:0 0 6px}} .sub{{opacity:.7;margin:0 0 28px}}
 section{{background:#fff;border:2px solid #2b2118;border-radius:14px;padding:16px;margin:0 0 22px}}
 h2{{font-size:18px;margin:0 0 4px}} .meta{{opacity:.55;font-size:13px;margin:0 0 10px}}
 img{{width:100%;height:auto;border-radius:10px;background:#fff}}
 .miss{{color:#b5532e;font-weight:600}} .note{{background:#fff3d6;border-left:6px solid #d9a441;padding:12px 16px;border-radius:8px}}
</style></head><body>
<h1>Frida &amp; Luna — aprovação antes de animar</h1>
<p class=sub>Nada é animado antes do teu OK. Ficheiros em <code>D:\\CRAFT\\work\\frida-luna\\chars\\</code></p>
<div class=note><b>Regra:</b> personagem final nunca sai de IA — estas propostas são a base de desenho; a animação usa as poses aprovadas.</div>
{''.join(cards)}
</body></html>"""

OUT.write_text(doc, encoding="utf-8")
print(f"{OUT} ({len(doc)/1024:.0f} KB) | {sum(1 for n,_ in ORDER if (CHARS/n).exists())} imagens embutidas")
