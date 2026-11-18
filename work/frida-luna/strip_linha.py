"""Tira de avaliacao de uma linha da folha fatiada (rXX do 04-*_actions)."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

F = Path(r"D:\CRAFT\work\frida-luna\chars\folhas\fatiado")
sheet_name, row = sys.argv[1], int(sys.argv[2])
d = F / sheet_name
files = sorted(d.glob(f"r{row:02d}c*.png"))
if not files:
    raise SystemExit("sem ficheiros")

cw, ch = 240, 300
W = len(files) * (cw + 8) + 8
H = ch + 34
sheet = Image.new("RGB", (W, H), (244, 231, 208))
dr = ImageDraw.Draw(sheet)
font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 15)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGBA")
    im.thumbnail((cw, ch - 8))
    x = 8 + i * (cw + 8)
    sheet.paste(im, (x + (cw - im.width) // 2, 28 + (ch - im.height)), im)
    dr.text((x, 6), f"c{i+1}", fill=(36, 22, 16), font=font)

out = F / f"_linha-{sheet_name}-r{row:02d}.png"
sheet.save(out)
print(out)
