"""Contact sheet generico de uma pasta de imagens (ordem fixa de cenas quando existe)."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ORDEM = ["hook", "abertura", "portao", "montanha", "roda", "carrossel",
         "bolinhas", "tunel", "espelhos", "moral", "final"]


def main():
    d = Path(sys.argv[1])
    files = {p.stem: p for p in d.glob("*.png") if not p.name.startswith("_")}
    items = [(k, files[k]) for k in ORDEM if k in files]
    items += [(k, v) for k, v in sorted(files.items()) if k not in ORDEM]

    cols, cw, ch, top, pad = 3, 448, 262, 28, 14
    rows = (len(items) + cols - 1) // cols
    W = cols * cw + pad * (cols + 1)
    H = rows * (ch + top) + pad * (rows + 1)
    sheet = Image.new("RGB", (W, H), (244, 231, 208))
    dr = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 20)

    for i, (name, p) in enumerate(items):
        x = pad + (i % cols) * (cw + pad)
        y = pad + (i // cols) * (ch + top + pad)
        im = Image.open(p).convert("RGB")
        im.thumbnail((cw, ch))
        sheet.paste(im, (x + (cw - im.width) // 2, y + top + (ch - im.height) // 2))
        dr.text((x + 4, y + 4), name, fill=(36, 22, 16), font=font)

    out = d / "_contact.png"
    sheet.save(out)
    print(f"{len(items)} imagens -> {out} ({out.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
