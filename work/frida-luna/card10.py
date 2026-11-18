"""Cartao de 10 s: cena 'portao', Frida a 100% e Luna a 50%.

Porque PIL e nao Remotion (ainda): este cartao serve para aprovar composicao, escala e
ritmo em ~1 minuto. O episodio completo (5 882 frames) vai para Remotion, que ja tem
`useCurrentFrame`/`interpolate` montados no composer.

Regras aplicadas (PERSONAGENS.md):
- Frida 1,00 / Luna 0,50 na altura; pes na mesma linha de chao.
- poses do beat sheet mapeadas para as 8 aprovadas (_mapa-emocoes.json).
"""
import json
import math
import subprocess
from pathlib import Path

from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")
OUT = BASE / "card"
FRAMES = OUT / "frames"
FRAMES.mkdir(parents=True, exist_ok=True)

W, H, FPS = 1920, 1080, 30
SEG_START, SEG_END = 28.5, 42.8   # cena 'portao' no beats.json
DUR = 10.0
GROUND_Y = 980
FRIDA_H = 720
LUNA_H = 360

BG = BASE / "bg" / "flow" / "portao.png"
POSES = BASE / "chars" / "poses-v3"

# momento -> (pose frida, pose luna, salto?, deslocamento x da frida)
BEATS = [
    (0.0, "happy", "happy", 0, -60),
    (2.6, "surprised", "surprised", 0, -40),
    (4.6, "excited", "excited", 34, 20),
    (7.0, "loved", "loved", 0, 60),
]


def bg_1080() -> Image.Image:
    im = Image.open(BG).convert("RGB")
    scale = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    x = (im.width - W) // 2
    y = (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def sprite(who: str, pose: str, height: int) -> Image.Image:
    p = POSES / who / f"{pose}.png"
    im = Image.open(p).convert("RGBA")
    s = height / im.height
    return im.resize((max(1, round(im.width * s)), height), Image.LANCZOS)


def beat_at(t: float):
    cur = BEATS[0]
    for b in BEATS:
        if t >= b[0]:
            cur = b
    return cur


def main():
    bg = bg_1080()
    for i in range(int(DUR * FPS)):
        t = i / FPS
        start, pf, pl, jump, dx = beat_at(t)
        # transicao suave nos 0,25 s seguintes a cada mudanca de pose
        nt = t - start
        bob = math.sin(t * 2.6) * 5

        frame = bg.copy()
        luna = sprite("luna", pl, LUNA_H)
        frida = sprite("frida", pf, FRIDA_H)

        ly = GROUND_Y - luna.height + bob * 0.6
        lx = int(W * 0.66)
        frame.paste(luna, (lx, int(ly)), luna)

        fy = GROUND_Y - frida.height - (jump * math.sin(min(1.0, nt / 0.45) * math.pi) if nt < 0.9 else 0) + bob
        fx = int(W * 0.30) + dx
        frame.paste(frida, (fx, int(fy)), frida)

        # sombra de contacto
        frame.save(FRAMES / f"f_{i:04d}.png")

    ff = Path(r"C:\Users\Pires\AppData\Local\hermes\tools\ffmpeg-9.0.1-win32-x64\bin\ffmpeg.exe")
    audio = OUT / "trecho.wav"
    subprocess.run([str(ff), "-y", "-v", "error", "-ss", str(SEG_START), "-t", str(DUR),
                    "-i", str(BASE / "audio" / "voz.wav"), "-ac", "1", "-ar", "44100", str(audio)], check=True)

    mp4 = OUT / "cartao-10s.mp4"
    subprocess.run([str(ff), "-y", "-v", "error", "-framerate", str(FPS), "-i", str(FRAMES / "f_%04d.png"),
                    "-i", str(audio), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
                    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(mp4)], check=True)
    print(f"{mp4} ({mp4.stat().st_size/1024/1024:.1f} MB)")


if __name__ == "__main__":
    main()
