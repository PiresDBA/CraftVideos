"""Corta uma tira de frames (8 personagens em fila) em PNGs alinhados.

Regras que fazem a diferenca na animacao:
- mesma altura para todos (mediana, nao por frame -> nao "respira")
- mesma linha de base (pes no mesmo y)
- mesma largura de canvas (centrado no eixo dos pes)

Uso: py ciclo_de_tira.py <imagem.webp|png> <pasta-saida>
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
        return np.abs(px.astype(np.int16) - bg.astype(np.int16)).sum() < 60

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


def componentes(alpha: np.ndarray, minimo=800):
    """Caixas dos 8 maiores componentes (as figuras), ordenadas por x."""
    h, w = alpha.shape
    visto = np.zeros((h, w), bool)
    caixas = []
    for sy in range(h):
        for sx in range(w):
            if alpha[sy, sx] == 0 or visto[sy, sx]:
                continue
            comp, q = [], deque([(sy, sx)])
            visto[sy, sx] = True
            x0, x1, y0, y1 = sx, sx, sy, sy
            while q:
                y, x = q.popleft(); comp.append((y, x))
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and not visto[ny, nx] and alpha[ny, nx] > 0:
                        visto[ny, nx] = True; q.append((ny, nx))
            if len(comp) >= minimo:
                caixas.append((x0, y0, x1 + 1, y1 + 1))
    # ordena por linha (y) e, dentro da linha, por coluna (x) - senao o ciclo embaralha
    caixas.sort(key=lambda b: (round((b[1] + b[3]) / 2 / 60), b[0]))
    return caixas


def main():
    src = Path(sys.argv[1]); dst = Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    for f in dst.glob("*.png"):
        f.unlink()

    cut = sem_fundo(Image.open(src))
    caixas = componentes(np.array(cut)[:, :, 3])
    print("figuras encontradas:", len(caixas))
    if len(caixas) < 4:
        raise SystemExit("poucas figuras — verifica a imagem")

    figuras = [cut.crop(b) for b in caixas]
    alturas = sorted(f.height for f in figuras)
    alvo_h = alturas[len(alturas) // 2]
    largura = max(round(f.width * alvo_h / f.height) for f in figuras)

    for i, f in enumerate(figuras):
        s = f.resize((round(f.width * alvo_h / f.height), alvo_h), Image.LANCZOS)
        canvas = Image.new("RGBA", (largura, alvo_h), (0, 0, 0, 0))
        canvas.paste(s, ((largura - s.width) // 2, alvo_h - s.height), s)
        canvas.save(dst / f"f{i:02d}.png")
    print(f"{len(figuras)} frames -> {dst} (altura {alvo_h}, largura {largura})")


if __name__ == "__main__":
    main()

