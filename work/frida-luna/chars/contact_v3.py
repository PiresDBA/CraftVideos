"""Contact sheet das poses v3 (8 por personagem) + mapa emocao -> sprite."""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DEST = Path(r"D:\CRAFT\work\frida-luna\chars\poses-v3")
ORDEM = ["happy", "sad", "angry", "excited", "scared", "surprised", "loved", "silly"]

# as 20 emoções do beat sheet -> as 8 poses que existem (mapeamento honesto)
MAPA = {
    "happy": "happy", "proud": "happy", "calm": "happy", "excited": "excited",
    "silly": "silly", "mischievous": "silly", "loved": "loved", "lovestruck": "loved",
    "sad": "sad", "sick": "sad", "bored": "sad", "tired": "sad",
    "angry": "angry", "grumpy": "angry", "jealous": "angry",
    "scared": "scared", "worried": "scared", "shy": "scared",
    "surprised": "surprised", "confused": "surprised",
}

cell_w, cell_h, top, pad = 210, 300, 26, 8
W = len(ORDEM) * (cell_w + pad) + pad
H = 2 * (cell_h + top + pad) + pad
sheet = Image.new("RGB", (W, H), (244, 231, 208))
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 15)

for row, who in enumerate(("frida", "luna")):
    for col, name in enumerate(ORDEM):
        p = DEST / who / f"{name}.png"
        x = pad + col * (cell_w + pad)
        y = pad + row * (cell_h + top + pad)
        if p.exists():
            im = Image.open(p).convert("RGBA")
            im.thumbnail((cell_w, cell_h))
            sheet.paste(im, (x + (cell_w - im.width) // 2, y + top), im)
        d.text((x + 4, y + 4), f"{who} · {name}", fill=(36, 22, 16), font=font)

out = DEST / "_contact.png"
sheet.save(out)
(DEST / "_mapa-emocoes.json").write_text(json.dumps(MAPA, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"contact {out} ({out.stat().st_size/1024:.0f} KB) | mapa com {len(MAPA)} emoções")
