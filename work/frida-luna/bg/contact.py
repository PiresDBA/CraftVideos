"""Contact sheet dos 11 fundos, com etiqueta de cena, para aprovacao visual."""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BG = Path(r"D:\CRAFT\work\frida-luna\bg")
man = json.loads((BG / "manifest.json").read_text(encoding="utf-8"))
items = man if isinstance(man, list) else man.get("fundos") or man.get("scenes") or []

cells = []
for it in items:
    name = it.get("scene") or it.get("cena") or it.get("name")
    f = it.get("file") or it.get("ficheiro") or it.get("path")
    p = Path(f) if f and Path(f).is_absolute() else BG / str(f)
    if p.exists():
        cells.append((str(name), p))

if not cells:  # fallback: todas as imagens da pasta
    cells = [(p.stem, p) for p in sorted(BG.glob("*.png")) if not p.name.startswith("_")]

cols, cw, ch, top, pad = 3, 448, 256, 30, 14
rows = (len(cells) + cols - 1) // cols
W = cols * cw + pad * (cols + 1)
H = rows * (ch + top) + pad * (rows + 1)
sheet = Image.new("RGB", (W, H), (244, 231, 208))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 20)
except Exception:
    font = ImageFont.load_default()

for i, (name, p) in enumerate(cells):
    cx, cy = i % cols, i // cols
    x = pad + cx * (cw + pad)
    y = pad + cy * (ch + top + pad)
    im = Image.open(p).convert("RGB")
    im.thumbnail((cw, ch))
    sheet.paste(im, (x + (cw - im.width) // 2, y + top))
    d.text((x + 4, y + 4), name, fill=(36, 22, 16), font=font)

out = BG / "_contact.png"
sheet.save(out)
print(f"{len(cells)} fundos -> {out} ({out.stat().st_size/1024:.0f} KB)")
