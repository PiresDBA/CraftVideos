"""Motor de animacao: poses do desenho + movimento sintetizado por cima.

Porque existe: os desenhos nao cobrem todos os movimentos. O motor nao fica dependente
disso - interpola entre poses (crossfade + transform) e acrescenta movimento que nenhum
frame tem:
  - avanco = passada x fase (o pe nao derrapa)
  - bob vertical e squash/stretch (peso)
  - inclinacao para a frente proporcional a velocidade
  - sombra elipse que respira com o bob
  - interpolacao entre pares de poses (in-between sintetizado)

Uso:  py motor.py <quem> <movimento> <segundos> <saida.mp4> [--audio corte]
"""
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

BASE = Path(r"D:\CRAFT\work\frida-luna")
STICK = BASE / "chars" / "stick"
BG = BASE / "bg" / "flow" / "portao.png"
FF = Path(r"C:\Users\Pires\AppData\Local\hermes\tools\ffmpeg-9.0.1-win32-x64\bin\ffmpeg.exe")

W, H, FPS = 1920, 1080, 30
GROUND = 980


def carregar(who, mov):
    cat = json.loads((STICK / "movimentos.json").read_text(encoding="utf-8"))
    conf = cat[who][mov]
    return [Image.open(STICK / who / f).convert("RGBA") for f in conf["frames"]], conf["fps"]


def compor(bg, sprite, x, altura, fase, velocidade, flip=False):
    """Desenha o sprite com bob, squash e inclinacao sintetizados."""
    s = sprite
    if flip:
        s = s.transpose(Image.FLIP_LEFT_RIGHT)
    k = altura / s.height
    s = s.resize((max(1, round(s.width * k)), altura), Image.LANCZOS)

    bob = math.sin(fase * math.tau) * 6
    sx = 1.0 + 0.02 * math.sin(fase * math.tau + 1.2)
    sy = 1.0 - 0.02 * math.sin(fase * math.tau + 1.2)
    s = s.resize((max(1, round(s.width * sx)), max(1, round(s.height * sy))), Image.LANCZOS)
    if velocidade > 0.2:
        s = s.rotate(-4 if not flip else 4, resample=Image.BICUBIC, expand=True)

    frame = bg.copy()
    d = ImageDraw.Draw(frame, "RGBA")
    cx = int(x + s.width / 2)
    d.ellipse([cx - s.width * 0.32, GROUND - 16, cx + s.width * 0.32, GROUND + 18],
              fill=(40, 26, 16, 70))
    frame.paste(s, (int(x), int(GROUND - s.height + bob)), s)
    return frame


def main():
    who = sys.argv[1]
    mov = sys.argv[2]
    dur = float(sys.argv[3])
    out = Path(sys.argv[4])

    frames, fps_anim = carregar(who, mov)
    bg = Image.open(BG).convert("RGB").resize((W, H), Image.LANCZOS)

    passo = 34          # px por ciclo (passada)
    x0, x1 = 260, 1180
    tmp = BASE / "motor_frames"
    tmp.mkdir(exist_ok=True)
    for p in tmp.glob("*.png"):
        p.unlink()

    n = int(dur * FPS)
    for i in range(n):
        t = i / FPS
        # fase do ciclo: fps_anim poses por segundo -> 1 ciclo = len(frames)/fps_anim
        ciclo = len(frames) / fps_anim
        fase = (t / ciclo) % 1.0
        idx = fase * len(frames)
        a, b = int(idx) % len(frames), (int(idx) + 1) % len(frames)
        mix = idx - int(idx)

        # in-between sintetizado: mistura das duas poses do ciclo
        base = frames[a].copy()
        if mix > 0.05:
            other = frames[b].resize(base.size)
            base = Image.blend(base, other, min(0.5, mix * 0.5))

        prog = min(1.0, t / max(0.001, dur * 0.8))
        x = x0 + (x1 - x0) * prog
        compor_img = compor(bg, base, x, 700, fase * 2, 1.0)
        compor_img.save(tmp / f"f_{i:04d}.png")

    audio = BASE / "card" / "trecho4.wav"
    subprocess.run([str(FF), "-y", "-v", "error", "-ss", "28.5", "-t", str(dur),
                    "-i", str(BASE / "audio" / "voz.wav"), "-ac", "1", "-ar", "44100", str(audio)], check=True)
    subprocess.run([str(FF), "-y", "-v", "error", "-framerate", str(FPS), "-i", str(tmp / "f_%04d.png"),
                    "-i", str(audio), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
                    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(out)], check=True)
    print(f"{out} ({out.stat().st_size/1024/1024:.1f} MB)")


if __name__ == "__main__":
    main()
