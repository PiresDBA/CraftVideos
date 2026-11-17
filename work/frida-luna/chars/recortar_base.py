"""Recorta a vista frontal de cada folha aprovada (para servir de base fixa).

Saida: chars/base/frida.png, chars/base/luna.png  (+ um recorte da cabeca para calibrar)
"""
from pathlib import Path

from PIL import Image

CHARS = Path(r"D:\CRAFT\work\frida-luna\chars")
BASE = CHARS / "base"
BASE.mkdir(parents=True, exist_ok=True)

# (ficheiro, caixa da figura 1 - vista 3/4, caixa da cabeca)
CROPS = {
    "frida": ("frida-v2-ok-flat.png", (70, 90, 410, 730), (135, 105, 350, 350)),
    "luna": ("luna-v2-ok-flat.png", (70, 90, 410, 730), (135, 105, 350, 350)),
}

for who, (src, fig_box, head_box) in CROPS.items():
    im = Image.open(CHARS / src).convert("RGBA")
    fig = im.crop(fig_box)
    fig.save(BASE / f"{who}.png")
    head = im.crop(head_box)
    head.save(BASE / f"_{who}-cabeca.png")
    print(f"{who}: figura {fig.size} -> base/{who}.png | cabeca {head.size}")

