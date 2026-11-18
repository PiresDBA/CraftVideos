"""Corta uma fila de figuras pelos gaps verticais (perfil de colunas).

Usado quando as figuras se tocam ou quando a grelha regular amputa o desenho:
1. remove o fundo (flood-fill das bordas);
2. conta pixeis opacos por coluna;
3. corta nos troços de colunas vazias (>=3 px);
4. alinha todos pela base e pela altura mediana.

Uso: py cortar_fila.py <imagem> <pasta-saida> [minimo-colunas-vazias]
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def sem_fundo(im: Image.Image) -> Image.Image:
    a = np.array(im.convert("RGB"))
    h, w, _ = a.shape
    border = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3),
                             a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(border, axis=0)

    def is_bg(px):
        # tolerancia apertada: a pelagem creme e o peito branco sao quase da cor do fundo
        return np.abs(px.astype(np.int16) - bg.astype(np.int16)).sum() < 18

    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y, x] and is_bg(a[y, x]):
                seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y, x] and is_bg(a[y, x]):
                seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and is_bg(a[ny, nx]):
                seen[ny, nx] = True; q.append((ny, nx))
    return Image.fromarray(np.dstack([a, np.where(seen, 0, 255).astype(np.uint8)]), "RGBA")


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    gap_min = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    dst.mkdir(parents=True, exist_ok=True)
    for f in dst.glob("*.png"):
        f.unlink()

    cut = sem_fundo(Image.open(src))
    arr = np.array(cut)
    alpha = arr[:, :, 3].copy()

    # a folha traz uma linha de chao continua: apaga as linhas quase cheias
    # (senao todas as figuras ficam ligadas e o corte por colunas nao encontra gaps)
    densidade = (alpha > 0).sum(axis=1) / alpha.shape[1]
    base = int(alpha.shape[0] * 0.86)              # so a faixa de baixo conta
    linhas_cheias = np.zeros_like(densidade, dtype=bool)
    linhas_cheias[base:] = densidade[base:] > 0.90  # linha de chao e fina e quase cheia
    arr[linhas_cheias, :, 3] = 0
    cut = Image.fromarray(arr, "RGBA")
    alpha = arr[:, :, 3]

    col = (alpha > 0).sum(axis=0)

    segmentos, inicio, vazio = [], None, 0
    for x, v in enumerate(col):
        if v > 0:
            if inicio is None:
                inicio = x
            vazio = 0
        else:
            vazio += 1
            if inicio is not None and vazio >= gap_min:
                segmentos.append((inicio, x - vazio + 1))
                inicio = None
    if inicio is not None:
        segmentos.append((inicio, len(col)))

    segmentos = [(a, b) for a, b in segmentos if b - a > 25]
    print("segmentos:", len(segmentos))

    figuras = []
    for a, b in segmentos:
        sub = cut.crop((a, 0, b, cut.height))
        bbox = sub.getbbox()
        if bbox:
            figuras.append(sub.crop(bbox))

    if len(figuras) < 4:
        raise SystemExit(f"poucas figuras: {len(figuras)}")

    alturas = sorted(f.height for f in figuras)
    alvo = alturas[len(alturas) // 2]
    largura = max(round(f.width * alvo / f.height) for f in figuras) + 10

    for i, f in enumerate(figuras):
        s = f.resize((round(f.width * alvo / f.height), alvo), Image.LANCZOS)
        canvas = Image.new("RGBA", (largura, alvo + 8), (0, 0, 0, 0))
        canvas.paste(s, ((largura - s.width) // 2, alvo + 8 - s.height), s)
        canvas.save(dst / f"f{i:02d}.png")
    print(f"{len(figuras)} frames -> {dst} (altura {alvo})")


if __name__ == "__main__":
    main()



