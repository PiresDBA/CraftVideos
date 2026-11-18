"""Calibra a métrica de continuidade usando UMA pose aprovada por personagem.

A auditoria anterior usou os ficheiros frida-v2-ok-flat.png / luna-v2-ok-flat.png,
que são folhas de 3 vistas — por isso até as expressões aprovadas davam score alto.
A referência correcta é UMA imagem da personagem final:
  chars/poses-v3/frida/happy.png
  chars/poses-v3/luna/happy.png

Imprime a distância de cada expressão aprovada à sua referência (deve ser baixa) e a
distância de cada ciclo em quarentena (deve ser alta). O valor entre as duas distribuições
é o limiar que o validador vai usar.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")


def assinatura(p):
    a = np.array(Image.open(p).convert("RGBA"))
    m = a[:, :, 3] > 128
    px = a[m, :3].astype(np.float32)
    ys, xs = np.nonzero(m)
    hist = np.concatenate([
        np.histogram(px[:, c], bins=16, range=(0, 256), density=True)[0] for c in range(3)])
    return {"mu": px.mean(axis=0), "sd": px.std(axis=0),
            "aspect": (xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1),
            "hist": hist}


def distancia(a, b):
    cor = float(np.linalg.norm(a["mu"] - b["mu"]) / 40 + np.linalg.norm(a["sd"] - b["sd"]) / 60)
    asp = abs(a["aspect"] - b["aspect"]) / max(0.01, b["aspect"])
    his = float(np.abs(a["hist"] - b["hist"]).sum() / 2)
    return round(cor + asp * 2 + his * 1.5, 3)


def main():
    for quem in ("frida", "luna"):
        ref = BASE / "chars" / "poses-v3" / quem / "happy.png"
        A = assinatura(ref)
        print(f"\n=== {quem} — referencia {ref.name} ===")
        vals = []
        for p in sorted((BASE / "chars" / "poses-v3" / quem).glob("*.png")):
            d = distancia(assinatura(p), A)
            vals.append(d)
            print(f"  aprovada {p.stem:12} {d:6.2f}")
        quar = BASE / "movimentos" / "_quarentena" / quem
        if quar.exists():
            for pasta in sorted(quar.iterdir()):
                f = pasta / "f00.png"
                if f.exists():
                    d = distancia(assinatura(f), A)
                    print(f"  quarentena {pasta.name:18} {d:6.2f}")
        print(f"  max aprovadas = {max(vals):.2f}")
        (BASE / "animacao" / f"calibracao-{quem}.json").write_text(
            json.dumps({"referencia": str(ref), "max_aprovadas": max(vals)}, indent=1),
            encoding="utf-8")


if __name__ == "__main__":
    main()
