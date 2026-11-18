"""Fatia as grelhas 4x2 (8 expressoes) geradas externamente em PNGs com alfa.

- divide a imagem em 4 colunas x 2 linhas
- em cada celula: remove o fundo (cor amostrada na borda da celula) por flood-fill
- recorta ao conteudo, normaliza para 512 px de altura, guarda RGBA
Uso: py fatiar_grelha.py <grelha.jpg> <frida|luna>
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ORDEM = ["happy", "sad", "angry", "excited", "scared", "surprised", "loved", "silly"]
DEST = Path(r"D:\CRAFT\work\frida-luna\chars\poses-v3")


def fatiar(img: Image.Image, cols: int = 4, rows: int = 2):
    w, h = img.size
    cw, ch = w // cols, h // rows
    for r in range(rows):
        for c in range(cols):
            yield img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))


def sem_fundo(cell: Image.Image) -> Image.Image:
    a = np.array(cell.convert("RGB"))
    h, w, _ = a.shape
    border = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3),
                             a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(border, axis=0)

    def is_bg(px):
        return np.abs(px.astype(np.int16) - bg.astype(np.int16)).sum() < 42

    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y, x] and is_bg(a[y, x]):
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y, x] and is_bg(a[y, x]):
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and is_bg(a[ny, nx]):
                seen[ny, nx] = True
                q.append((ny, nx))

    rgba = np.dstack([a, np.where(seen, 0, 255).astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA")


def main():
    src = Path(sys.argv[1])
    who = sys.argv[2].lower()
    out = DEST / who
    out.mkdir(parents=True, exist_ok=True)

    img = Image.open(src)
    cells = list(fatiar(img))
    made = []
    for name, cell in zip(ORDEM, cells):
        cut = sem_fundo(cell)
        bbox = cut.getbbox()
        if bbox:
            cut = cut.crop(bbox)
        scale = 512 / cut.height
        cut = cut.resize((max(1, round(cut.width * scale)), 512), Image.LANCZOS)
        p = out / f"{name}.png"
        cut.save(p)
        made.append(p)

    print(f"{who}: {len(made)} poses -> {out}")


if __name__ == "__main__":
    main()
