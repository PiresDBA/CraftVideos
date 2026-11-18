#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Descarrega as imagens semanticas novas do Flow (--hires) e faz a folha de contacto.

Uso: py descarregar_semanticos.py [pasta-destino] [n]
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = Path(r"D:\CRAFT\work\frida-luna")
DOWN = Path(r"C:\Users\Pires\StickFilms\.tools\flow_dl_all.mjs")
PROJ = "https://flow.google.com/u/0/project/62cb2bc8-7c82-4351-850d-d8453429108e"
CDP = "http://127.0.0.1:18800"


def contact(dirimgs, out):
    imgs = sorted(dirimgs.glob("*.webp"))
    if not imgs:
        print("sem imagens")
        return
    TW, TH, COLS, LBL, GAP = 340, 205, 4, 24, 8
    rows = (len(imgs) + COLS - 1) // COLS
    sheet = Image.new("RGB", (GAP + COLS * (TW + GAP),
                              GAP + rows * (TH + LBL + GAP)), (245, 245, 245))
    d = ImageDraw.Draw(sheet)
    try:
        f = ImageFont.truetype(r"C:\Windows\Fonts\consola.ttf", 12)
    except Exception:
        f = ImageFont.load_default()
    chk = np.zeros((TH, TW, 3), dtype=np.uint8)
    for y in range(0, TH, 14):
        for x in range(0, TW, 14):
            chk[y:y + 14, x:x + 14] = 210 if ((x // 14 + y // 14) % 2 == 0) else 172
    bg0 = Image.fromarray(chk, "RGB")
    for i, p in enumerate(imgs):
        c, r = i % COLS, i // COLS
        x = GAP + c * (TW + GAP)
        y = GAP + r * (TH + LBL + GAP)
        im = Image.open(p).convert("RGBA")
        al = np.array(im.split()[3])
        mode = "RGBA" if al.min() < 250 else "RGB "
        im.thumbnail((TW, TH), Image.LANCZOS)
        tile = bg0.copy()
        tile.paste(im, ((TW - im.width) // 2, (TH - im.height) // 2), im)
        sheet.paste(tile, (x, y))
        d.rectangle([x, y, x + TW - 1, y + TH - 1], outline=(90, 90, 90))
        d.rectangle([x, y + TH, x + TW, y + TH + LBL], fill=(30, 30, 30))
        d.text((x + 4, y + TH + 4), f"{p.name}  {mode}  {im.width}x{im.height}",
               fill=(255, 255, 255), font=f)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"contacto: {out}  {len(imgs)} imagens")


def main():
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / "chars" / "folhas" / "_semanticos-novo"
    if not dest.is_absolute():
        dest = (BASE / dest).resolve()
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    dest.mkdir(parents=True, exist_ok=True)
    cmd = ["node", str(DOWN), PROJ, str(dest), "--n", str(n), "--cdp", CDP, "--hires"]
    r = subprocess.run(cmd, cwd=str(DOWN.parent), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    print((r.stdout or "")[-2500:])
    print((r.stderr or "")[-600:])
    imgs = sorted(dest.glob("*.webp"))
    rgba = 0
    for p in imgs:
        al = np.array(Image.open(p).convert("RGBA"))[:, :, 3]
        if al.min() < 250 and float((al < 128).mean()) > 0.05:
            rgba += 1
    print(f"{len(imgs)} imagens, {rgba} com alpha real")
    contact(dest, BASE / "card" / "analise-_novo.png")


if __name__ == "__main__":
    main()
