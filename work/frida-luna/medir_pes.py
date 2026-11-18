"""Mede se as DUAS pernas andam, ou se o ciclo e coxo.

A perna de tras e desenhada mais escura que a da frente. Para cada quadro:
1. acha as zonas de contacto com o chao (colunas opacas nas ultimas linhas);
2. para cada zona, mede a cor media na faixa acima (a perna que a suporta);
3. agrupa por brilho em duas classes -> perna clara / perna escura.

Depois, por classe, mede o intervalo de x que a zona de contacto percorre ao longo do
ciclo. Se uma classe quase nao se mexe, essa perna fica parada: o ciclo e coxo.

Uso: py medir_pes.py <pasta-frames>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def contactos(a: np.ndarray):
    h, w = a.shape[:2]
    fundo = int(h * 0.90)
    zonas = (a[-5:, :, 3] > 128).any(axis=0)
    grupos, i = [], 0
    while i < w:
        if zonas[i]:
            j = i
            while j < w and zonas[j]:
                j += 1
            grupos.append((i, j - 1))
            i = j
        else:
            i += 1
    saida = []
    for a0, a1 in grupos:
        if a1 - a0 < 2:
            continue
        faixa = a[fundo:, a0:a1 + 1]
        op = faixa[faixa[:, :, 3] > 128]
        brilho = float(op[:, :3].mean()) if len(op) else 0.0
        saida.append({"x": (a0 + a1) / 2, "larg": a1 - a0 + 1, "brilho": brilho})
    return saida


def main():
    pasta = Path(sys.argv[1])
    fs = sorted(pasta.glob("*.png"))
    if not fs:
        raise SystemExit("sem PNGs")
    todos = []
    print(f"{'fr':4} {'contactos (x, brilho)'}")
    for p in fs:
        a = np.array(Image.open(p).convert("RGBA"))
        cs = contactos(a)
        todos.append(cs)
        print(f"{p.stem:4} " + "  ".join(f"x={c['x']:.0f}/b={c['brilho']:.0f}" for c in cs))

    brilhos = [c["brilho"] for cs in todos for c in cs]
    if not brilhos:
        raise SystemExit("sem contactos")
    corte = (max(brilhos) + min(brilhos)) / 2

    claro, escuro = [], []
    for cs in todos:
        for c in cs:
            (claro if c["brilho"] >= corte else escuro).append(c["x"])
    print()
    for nome, xs in (("perna clara ", claro), ("perna escura", escuro)):
        if xs:
            print(f"{nome}: {len(xs):2d} contactos | x de {min(xs):.0f} a {max(xs):.0f} "
                  f"-> varre {max(xs) - min(xs):.0f} px")
        else:
            print(f"{nome}: sem contactos identificados")
    n_cont = [len(cs) for cs in todos]
    print(f"contactos por quadro: min {min(n_cont)} max {max(n_cont)}")
    varre_claro = (max(claro) - min(claro)) if claro else 0
    varre_escuro = (max(escuro) - min(escuro)) if escuro else 0
    print()
    if min(varre_claro, varre_escuro) < 6:
        print("VEREDITO: ciclo coxo — uma perna praticamente nao avanca.")
    else:
        print("VEREDITO: as duas pernas varrem distancia comparavel — ciclo utilizavel.")


if __name__ == "__main__":
    main()
