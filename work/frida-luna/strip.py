"""Tira de avaliacao: mostra os frames de um ciclo lado a lado, com a base alinhada."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

STICK = Path(r"D:\CRAFT\work\frida-luna\chars\stick")
cat = json.loads((STICK / "movimentos.json").read_text(encoding="utf-8"))
who, mov = sys.argv[1], sys.argv[2]
frames = cat[who][mov]["frames"]

cw, ch, pad, top = 260, 320, 8, 26
W = len(frames) * (cw + pad) + pad
H = ch + top + pad * 2
sheet = Image.new("RGB", (W, H), (244, 231, 208))
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 16)

for i, f in enumerate(frames):
    im = Image.open(STICK / who / f).convert("RGBA")
    im.thumbnail((cw, ch - 10))
    x = pad + i * (cw + pad)
    # alinha pela base (pés no mesmo chão) para ver se o ciclo "salta"
    y = top + (ch - im.height)
    sheet.paste(im, (x + (cw - im.width) // 2, y), im)
    d.text((x, 4), f"{i+1}: {f.split('_')[-1].replace('.png','')}", fill=(36, 22, 16), font=font)
    d.line([(x, top + ch), (x + cw, top + ch)], fill=(200, 120, 90), width=1)

out = STICK / f"_strip-{who}-{mov}.png"
sheet.save(out)
print(out)
