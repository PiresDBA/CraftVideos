#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Folha de contacto das imagens em chars/folhas/_semanticos.

Cada miniatura com o nome do ficheiro e, opcionalmente, a distância de continuidade
à referência mais próxima. Fundo xadrez para expor transparência.
Saida: card/analise-_semanticos.png
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = Path(r"D:\CRAFT\work\frida-luna")
SRC = BASE / "chars" / "folhas" / "_semanticos"
OUT = BASE / "card" / "analise-_semanticos.png"
TW, TH = 340, 205
COLS = 4
LABEL = 26
GAP = 8

meta = {}
mp = BASE / "card" / "analise-_semanticos.json"
if mp.exists():
    meta = {r["ficheiro"]: r for r in json.loads(mp.read_text(encoding="utf-8"))}


def checker(w, h, s=14):
    a = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(0, h, s):
        for x in range(0, w, s):
            v = 210 if ((x // s + y // s) % 2 == 0) else 172
            a[y:y + s, x:x + s] = v
    return Image.fromarray(a, "RGB")


def font(sz):
    for fp in (r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\arial.ttf"):
        if Path(fp).exists():
            return ImageFont.truetype(fp, sz)
    return ImageFont.load_default()


def main():
    imgs = sorted(SRC.glob("*.webp"))
    rows = (len(imgs) + COLS - 1) // COLS
    W = GAP + COLS * (TW + GAP)
    H = GAP + rows * (TH + LABEL + GAP)
    sheet = Image.new("RGB", (W, H), (245, 245, 245))
    d = ImageDraw.Draw(sheet)
    f = font(15)
    fs = font(12)
    for i, p in enumerate(imgs):
        c, r = i % COLS, i // COLS
        x = GAP + c * (TW + GAP)
        y = GAP + r * (TH + LABEL + GAP)
        im = Image.open(p).convert("RGBA")
        # fit into TW x TH
        im.thumbnail((TW, TH), Image.LANCZOS)
        bg = checker(TW, TH)
        px = (TW - im.width) // 2
        py = (TH - im.height) // 2
        bg.paste(im, (px, py), im)
        sheet.paste(bg, (x, y))
        d.rectangle([x, y, x + TW - 1, y + TH - 1], outline=(90, 90, 90))
        m = meta.get(p.name, {})
        info = (f"{p.name}  F{m.get('cont_frida','?')} L{m.get('cont_luna','?')} "
                f"a0={m.get('frac_a0','?')}")
        d.rectangle([x, y + TH, x + TW, y + TH + LABEL], fill=(30, 30, 30))
        d.text((x + 4, y + TH + 4), info, fill=(255, 255, 255), font=fs)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    print(f"{OUT}  {sheet.width}x{sheet.height}  {len(imgs)} imagens")


if __name__ == "__main__":
    main()
