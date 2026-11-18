"""Escolhe a tira de marcha certa: as duas pernas tem de AVANCAR e CRUZAR.

Uma tira pode parecer uma caminhada e ser coxa: a perna de tras oscila mas nunca passa
a frente. Aqui:
1. corta a tira (cortar_mascara);
2. por quadro, mede o centro x da perna clara (frente) e da perna escura (tras),
   relativo ao centro do corpo;
3. mede a amplitude de cada uma e quanto os intervalos se sobrepoem;
4. veredito: aceite se ambas tem amplitude >= 10% da altura E os intervalos se cruzam.

Uso: py analisar_pernas.py <pasta-com-tiras>
"""
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")


def serie(pasta: Path):
    res = []
    for p in sorted(pasta.glob("*.png")):
        a = np.array(Image.open(p).convert("RGBA")).astype(int)
        h, w, _ = a.shape
        al = a[:, :, 3] > 128
        corpo = al[int(h * 0.35):int(h * 0.70), :]
        ys, xs = np.nonzero(corpo)
        cx = xs.mean() if len(xs) else w / 2
        zona = slice(int(h * 0.62), h)
        m = al[zona]
        rgb = a[zona][:, :, :3]
        L = rgb.mean(axis=2)
        op = m & (L > 30)
        if not op.any():
            continue
        t = (np.percentile(L[op], 25) + np.percentile(L[op], 75)) / 2
        escuro = op & (L < t)
        claro = op & (L >= t)
        ys1, xs1 = np.nonzero(escuro)
        ys2, xs2 = np.nonzero(claro)
        if not len(xs1) or not len(xs2):
            continue
        res.append((p.stem, xs2.mean() - cx, xs1.mean() - cx, h))
    return res


def avaliar(tira: Path, area_min=2500):
    out = BASE / "_analise" / tira.stem
    if out.exists():
        shutil.rmtree(out)
    subprocess.run([sys.executable, str(BASE / "cortar_mascara.py"), str(tira), str(out),
                    "--area-min", str(area_min)],
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
    fs = sorted(out.glob("*.png"))
    if len(fs) < 6:
        return None
    s = serie(out)
    if len(s) < 6:
        return None
    h = s[0][3]
    cl = [r[1] for r in s]
    es = [r[2] for r in s]
    amp_c, amp_e = max(cl) - min(cl), max(es) - min(es)
    sobrep = min(max(cl), max(es)) - max(min(cl), min(es))
    # anticorrelacao: as pernas devem andar em oposicao
    ac = float(np.corrcoef(cl, es)[0, 1]) if np.std(cl) > 0 and np.std(es) > 0 else 0.0
    ok = amp_c >= 0.10 * h and amp_e >= 0.10 * h and sobrep > 0 and ac < 0
    return {"tira": tira.stem, "n": len(s), "h": h, "amp_clara": amp_c, "amp_escura": amp_e,
            "sobreposicao": sobrep, "anticorr": ac, "ok": ok,
            "cl": cl, "es": es}


def main():
    pasta = Path(sys.argv[1])
    tiras = [p for p in sorted(pasta.glob("*.webp")) if p.stem not in ("flow-07", "flow-11")]
    print(f"{'tira':12} {'n':>3} {'h':>4} {'ampClara':>9} {'ampEscura':>10} "
          f"{'sobrep':>7} {'anticorr':>9}  veredito")
    bons = []
    for t in tiras:
        r = avaliar(t)
        if r is None:
            print(f"{t.stem:12}   -- figuras insuficientes")
            continue
        print(f"{r['tira']:12} {r['n']:3d} {r['h']:4d} {r['amp_clara']:9.1f} "
              f"{r['amp_escura']:10.1f} {r['sobreposicao']:7.1f} {r['anticorr']:9.2f}  "
              f"{'ACEITE' if r['ok'] else 'coxo/insuficiente'}")
        if r["ok"]:
            bons.append(r)
    print()
    if not bons:
        print("NENHUMA tira tem as duas pernas a andar. E preciso gerar outra no Flow")
        print("(pedir explicitamente: a perna de tras passa a frente, alternando).")
        return
    bons.sort(key=lambda r: min(r["amp_clara"], r["amp_escura"]), reverse=True)
    print("melhor(es):")
    for r in bons:
        print(f"  {r['tira']:12} amp {r['amp_clara']:.1f}/{r['amp_escura']:.1f} px  "
              f"sobreposicao {r['sobreposicao']:.1f}  anticorr {r['anticorr']:.2f}")
        print("    clara : " + " ".join(f"{v:+5.1f}" for v in r["cl"]))
        print("    escura: " + " ".join(f"{v:+5.1f}" for v in r["es"]))


if __name__ == "__main__":
    main()
