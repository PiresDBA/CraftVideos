"""Auditoria de continuidade: compara TODAS as fontes de sprite com as personagens aprovadas.

Referência canónica:
  chars/frida-v2-ok-flat.png
  chars/luna-v2-ok-flat.png

Para cada fonte (expressões aprovadas e todos os ciclos do banco) mede:
- cor média e desvio dos pixeis opacos;
- proporção da caixa (largura/altura);
- distância do histograma de cor (16 bins por canal);
- score combinado, onde 0 = idêntico à referência.

Escreve animacao/auditoria-continuidade.json e um contact sheet em card/_auditoria.png.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = Path(r"D:\CRAFT\work\frida-luna")
# UMA pose aprovada por personagem. As folhas de 3 vistas (frida-v2-ok-flat.png etc.)
# confundiam a metrica e faziam ate as expressoes aprovadas parecerem otra personagem.
REF = {"frida": BASE / "chars" / "poses-v3" / "frida" / "happy.png",
       "luna": BASE / "chars" / "poses-v3" / "luna" / "happy.png"}


def assinatura(p):
    a = np.array(Image.open(p).convert("RGBA"))
    m = a[:, :, 3] > 128
    px = a[m, :3].astype(np.float32)
    if len(px) == 0:
        return None
    ys, xs = np.nonzero(m)
    bbox = (xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)
    hist = []
    for c in range(3):
        h, _ = np.histogram(px[:, c], bins=16, range=(0, 256), density=True)
        hist.append(h)
    return {"mu": px.mean(axis=0), "sd": px.std(axis=0),
            "aspect": bbox[0] / bbox[1], "hist": np.concatenate(hist)}


def distancia(a, b):
    cor = float(np.linalg.norm(a["mu"] - b["mu"]) / 40 + np.linalg.norm(a["sd"] - b["sd"]) / 60)
    asp = abs(a["aspect"] - b["aspect"]) / max(0.01, b["aspect"])
    his = float(np.abs(a["hist"] - b["hist"]).sum() / 2)
    return round(cor + asp * 2 + his * 1.5, 3), round(cor, 2), round(asp, 3), round(his, 3)


def fontes():
    out = []
    for quem in ("frida", "luna"):
        out.append((f"{quem} (REFERÊNCIA)", quem, "referencia", REF[quem]))
        for p in sorted((BASE / "chars" / "poses-v3" / quem).glob("*.png")):
            out.append((f"{quem}/poses/{p.stem}", quem, "expressao-aprovada", p))
    man = json.loads((BASE / "movimentos" / "manifest.json").read_text(encoding="utf-8"))
    for quem, movs in man["personagens"].items():
        for nome in movs:
            p = BASE / "movimentos" / quem / nome / "f00.png"
            if p.exists():
                out.append((f"{quem}/{nome}", quem, "ciclo-gerado", p))
    return out


def main():
    refs = {q: assinatura(p) for q, p in REF.items()}
    linhas, imagens = [], []
    for nome, quem, tipo, p in fontes():
        s = assinatura(p)
        if s is None:
            continue
        score, cor, asp, his = distancia(s, refs[quem])
        linhas.append({"nome": nome, "personagem": quem, "tipo": tipo,
                       "score": score, "cor": cor, "proporcao": asp, "histograma": his,
                       "score_cor": round(cor, 2), "ficheiro": str(p)})
        imagens.append((nome, score, p))

    linhas.sort(key=lambda r: (r["personagem"], r["score"]))
    (BASE / "animacao").mkdir(exist_ok=True)
    (BASE / "animacao" / "auditoria-continuidade.json").write_text(
        json.dumps(linhas, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"{'fonte':36} {'tipo':20} {'score':>7} {'cor':>6} {'prop':>6} {'hist':>6}")
    for r in linhas:
        print(f"{r['nome']:36} {r['tipo']:20} {r['score']:7.2f} "
              f"{r['cor']:6.2f} {r['proporcao']:6.2f} {r['histograma']:6.2f}")

    # contact sheet: todas as fontes à mesma altura
    cw, ch = 190, 250
    cols = 8
    rows = (len(imagens) + cols - 1) // cols
    sheet = Image.new("RGB", (cw * cols, (ch + 34) * rows), (244, 231, 208))
    dr = ImageDraw.Draw(sheet)
    f = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 10)
    for i, (nome, score, p) in enumerate(imagens):
        im = Image.open(p).convert("RGBA")
        im.thumbnail((cw - 8, ch - 8), Image.LANCZOS)
        ox, oy = (i % cols) * cw, (i // cols) * (ch + 34)
        sheet.paste(im, (ox + (cw - im.width) // 2, oy + 30), im)
        dr.text((ox + 3, oy + 2), nome[:26], fill=(36, 22, 16), font=f)
        dr.text((ox + 3, oy + 14), f"score {score:.2f}", fill=(150, 40, 30), font=f)
    sheet.save(BASE / "card" / "_auditoria.png")

    maus = [r for r in linhas if r["tipo"] == "ciclo-gerado" and r["score"] > 1.2]
    print(f"\nCICLOS QUE QUEBRAM CONTINUIDADE (score > 1,2): {len(maus)}")
    for r in maus:
        print("  " + r["nome"])


if __name__ == "__main__":
    main()
