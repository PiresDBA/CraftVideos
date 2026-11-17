"""Monta a grelha de expressoes de um personagem a partir das poses individuais.

- valida cada pose (tamanho + desvio-padrao: deteta imagens em branco)
- regenera por FLUX (gen_nvidia.py) as que faltam ou sairam vazias
- compoe uma grelha 4x5 com etiqueta em cada celula
Uso:  py montar_grelha.py frida|luna
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CHARS = Path(r"D:\CRAFT\work\frida-luna\chars")
GEN = Path(r"D:\CRAFT\work\frida-luna\gen_nvidia.py")

EXPR = [
    ("happy", "happy smiling, tongue slightly out"),
    ("sad", "sad with a big tear on the cheek"),
    ("angry", "angry frowning with crossed arms"),
    ("excited", "very excited, jumping with arms up"),
    ("scared", "scared, trembling with wide eyes"),
    ("tired", "tired, half-closed eyes and a big yawn"),
    ("confused", "confused, scratching the head with a question look"),
    ("proud", "proud, chest out with a confident smirk"),
    ("surprised", "totally surprised, paws on cheeks"),
    ("shy", "shy, blushing and looking away"),
    ("silly", "silly, tongue hanging out and eyes crossed"),
    ("sick", "sick, greenish face and dizzy spiral eyes"),
    ("worried", "worried, eyebrows up and small sweat drop"),
    ("mischievous", "mischievous grin, plotting with paws together"),
    ("loved", "in love, heart-shaped eyes and floating hearts"),
    ("bored", "bored, lying flat with half-closed eyes"),
    ("grumpy", "grumpy, arms crossed and frowning"),
    ("jealous", "jealous, side-eye with pursed mouth"),
    ("calm", "calm and relaxed, gentle smile"),
    ("lovestruck", "lovestruck, hugging itself with big hearts"),
]

STYLE = {
    "frida": ("an English bulldog character with cream and fawn coat, white chest and muzzle, "
              "white blaze on the forehead, small floppy ears, rosy blush cheeks, "
              "wearing a chunky white pearl necklace, standing upright on two legs with two short arms"),
    "luna": ("a dachshund character with chestnut brown coat and darker rust markings, very long body, "
             "long floppy ears, tiny tail, wearing a purple bandana at the neck, "
             "standing upright on two legs with two short arms and two short legs"),
}
PREFIX = ("Single cartoon character, full body, centered, plain flat cream background, no text, no letters, "
          "thick dark-brown ink outlines, warm flat colors with light cel shading, childlike 2D cartoon style. ")


def is_blank(p: Path) -> bool:
    if not p.exists() or p.stat().st_size < 12_000:
        return True
    try:
        im = Image.open(p).convert("L")
        lo, hi = im.getextrema()
        return (hi - lo) < 25
    except Exception:
        return True


def main():
    who = (sys.argv[1] if len(sys.argv) > 1 else "frida").lower()
    raw = CHARS / "_raw" / who
    raw.mkdir(parents=True, exist_ok=True)

    fixed = []
    for name, desc in EXPR:
        out = raw / f"{name}.png"
        if not is_blank(out):
            continue
        prompt = PREFIX + STYLE[who] + ", expression: " + desc + "."
        r = subprocess.run([sys.executable, str(GEN), str(out), prompt, "--w", "832", "--h", "1024"],
                           capture_output=True, text=True)
        ok = out.exists() and not is_blank(out)
        fixed.append((name, ok, (r.stdout or r.stderr).strip().splitlines()[-1:]))
        print(f"{'OK ' if ok else 'FAIL'} {name}")

    cell = 420
    pad, top = 12, 34
    cols, rows = 4, 5
    W = cols * cell + pad * (cols + 1)
    H = rows * (cell + top) + pad * (rows + 1)
    sheet = Image.new("RGB", (W, H), (244, 233, 216))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 26)
    except Exception:
        font = ImageFont.load_default()

    for i, (name, _) in enumerate(EXPR):
        cx, cy = i % cols, i // cols
        x = pad + cx * (cell + pad)
        y = pad + cy * (cell + top + pad)
        src = raw / f"{name}.png"
        if src.exists():
            im = Image.open(src).convert("RGB")
            im.thumbnail((cell, cell))
            sheet.paste(im, (x + (cell - im.width) // 2, y + top + (cell - im.height) // 2))
        d.text((x + 6, y + 4), name, fill=(43, 33, 24), font=font)

    out = CHARS / f"{who}-expressoes.png"
    sheet.save(out)
    print(f"grelha {who}: {out} ({out.stat().st_size/1024:.0f} KB, {len(EXPR)} celulas, {len(fixed)} regeneradas)")


if __name__ == "__main__":
    main()
