"""Avalia várias tiras de ciclo de marcha e ordena-as por qualidade.

Metricas (todas objectivas):
- n         numero de figuras detectadas (tem de ser >= 6)
- abert     abertura dos pes no desenho (max-min da largura da base)
- rel       passada relativa = 2*abert / altura  (quanto mais alto, mais se ve a passada)
- deriva    variacao do centro do corpo (px) — o que causava a "passadeira"
- emenda    diferenca f_ultimo -> f_primeiro. Tem de ser <= media dos outros passos;
            se for muito maior, o ciclo nao fecha e a animacao salta.

Uso: py avaliar_tiras.py <pasta-das-tiras> [--area-min 2500]
"""
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")


def avaliar(p: Path, out: Path, area_min: int):
    if out.exists():
        shutil.rmtree(out)
    subprocess.run([sys.executable, str(BASE / "cortar_mascara.py"), str(p), str(out),
                    "--area-min", str(area_min)],
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
    fs = sorted(out.glob("*.png"))
    if len(fs) < 6:
        return None
    imgs = [np.array(Image.open(f).convert("RGBA"), dtype=np.float32) for f in fs]
    h = imgs[0].shape[0]
    larguras, centros = [], []
    for a in imgs:
        al = a[:, :, 3] > 60
        base = al[int(h * 0.82):, :]
        bb = np.nonzero(base)[1]
        larguras.append(int(bb.max() - bb.min()) if len(bb) else 0)
        corpo = al[int(h * 0.35):int(h * 0.70), :]
        ys, xs = np.nonzero(corpo)
        centros.append(float(xs.mean()) if len(xs) else 0.0)
    cinza = [np.array(Image.open(f).convert("L"), dtype=np.float32) for f in fs]
    ds = [float(np.abs(cinza[i] - cinza[(i + 1) % len(cinza)]).mean()) for i in range(len(cinza))]
    abert = max(larguras) - min(larguras)
    return {
        "tira": p.stem, "n": len(fs), "h": h, "abert": abert,
        "passada": 2 * abert, "rel": (2 * abert) / h,
        "deriva": max(centros) - min(centros),
        "emenda": ds[-1], "media": float(np.mean(ds[:-1])),
    }


def main():
    pasta = Path(sys.argv[1])
    area_min = int(sys.argv[sys.argv.index("--area-min") + 1]) if "--area-min" in sys.argv else 2500
    candidatos = [p for p in sorted(pasta.glob("*.webp")) if not p.stem.startswith("_")]
    res = []
    print(f"{'tira':12} {'n':>3} {'h':>4} {'abert':>6} {'passada':>8} {'rel':>6} "
          f"{'deriva':>7} {'emenda':>7} {'media':>6}")
    for p in candidatos:
        r = avaliar(p, BASE / "_av" / p.stem, area_min)
        if r is None:
            print(f"{p.stem:12}   -- figuras insuficientes")
            continue
        res.append(r)
        print(f"{r['tira']:12} {r['n']:3d} {r['h']:4d} {r['abert']:6d} {r['passada']:8d} "
              f"{r['rel']:6.2f} {r['deriva']:7.1f} {r['emenda']:7.2f} {r['media']:6.2f}")

    validas = [r for r in res if r["emenda"] <= r["media"] * 1.35 and r["deriva"] < 12]
    validas.sort(key=lambda r: r["rel"], reverse=True)
    print("\nmelhores (ciclo fechado, corpo estavel), por amplitude de passada:")
    for r in validas[:4]:
        print(f"  {r['tira']:12} rel={r['rel']:.2f}  passada={r['passada']} px  "
              f"deriva={r['deriva']:.1f}  emenda={r['emenda']:.2f} vs {r['media']:.2f}")


if __name__ == "__main__":
    main()
