"""Corta uma folha em grelha regular (colunas x linhas) e alinha os frames.

Usado quando as figuras se tocam e a separacao por componentes falha.
Alinha todos pela base (pes) e pela altura mediana - sem isto o ciclo "respira".

Uso: py cortar_grade.py <imagem> <pasta-saida> <colunas> <linhas>
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
        return np.abs(px.astype(np.int16) - bg.astype(np.int16)).sum() < 70

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
    src, dst, cols, rows = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    dst.mkdir(parents=True, exist_ok=True)
    for f in dst.glob("*.png"):
        f.unlink()

    im = Image.open(src).convert("RGB")
    cw, ch = im.width // cols, im.height // rows

    figuras = []
    for r in range(rows):
        for c in range(cols):
            cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            cut = sem_fundo(cell)
            bbox = cut.getbbox()
            if not bbox:
                continue
            figuras.append(cut.crop(bbox))

    if len(figuras) < 4:
        raise SystemExit(f"poucas figuras: {len(figuras)}")

    alturas = sorted(f.height for f in figuras)
    alvo_h = alturas[len(alturas) // 2]
    largura = max(round(f.width * alvo_h / f.height) for f in figuras) + 8

    for i, f in enumerate(figuras):
        s = f.resize((round(f.width * alvo_h / f.height), alvo_h), Image.LANCZOS)
        canvas = Image.new("RGBA", (largura, alvo_h + 6), (0, 0, 0, 0))
        canvas.paste(s, ((largura - s.width) // 2, alvo_h + 6 - s.height), s)
        canvas.save(dst / f"f{i:02d}.png")
    print(f"{len(figuras)} frames -> {dst} (altura {alvo_h}, largura {largura})")


if __name__ == "__main__":
    main()
