"""Rig de perfil com fase travada: pernas e bracos em oposicao.

Porque existe: os frames do StickFilms nao formam um ciclo (membros fora de sincronia).
Aqui o movimento e gerado, nao copiado: cada membro roda em torno da sua articulacao com a
fase certa - perna esquerda avanca quando o braco direito recua.

Vista de perfil recortada da folha aprovada (2a vista), duplicada em membro da frente e de
tras (o de tras mais escuro, como na animacao 2D classica).

Uso:  py rig_walk.py <frida|luna> <segundos> <saida.mp4>
"""
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance

BASE = Path(r"D:\CRAFT\work\frida-luna")
BG = BASE / "bg" / "flow" / "portao.png"
FF = Path(r"C:\Users\Pires\AppData\Local\hermes\tools\ffmpeg-9.0.1-win32-x64\bin\ffmpeg.exe")
W, H, FPS = 1920, 1080, 30
GROUND = 980

# caixa da vista de perfil (2a figura) na folha aprovada 1344x768
PERFIL = (470, 90, 800, 730)


def carregar(who):
    p = BASE / "chars" / f"{who}-v2-ok-flat.png"
    im = Image.open(p).convert("RGBA")
    fig = im.crop(PERFIL)
    bbox = fig.getbbox()
    return fig.crop(bbox) if bbox else fig


def partes(fig):
    """Divide o perfil em cabeca, tronco, braco e perna (proporcoes da folha)."""
    h = fig.height
    cortes = {
        "cabeca": (0, int(h * 0.36)),
        "tronco": (int(h * 0.34), int(h * 0.72)),
        "pernas": (int(h * 0.70), h),
        "bracos": (int(h * 0.42), int(h * 0.72)),
    }
    out = {}
    for nome, (y0, y1) in cortes.items():
        out[nome] = fig.crop((0, y0, fig.width, y1))
    return out


def rot(img, ang, pivot):
    """Roda mantendo o ponto de articulacao no lugar (expand + recentra)."""
    big = img.rotate(ang, resample=Image.BICUBIC, expand=True, center=pivot)
    dx = (big.width - img.width) / 2
    dy = (big.height - img.height) / 2
    return big, (-dx, -dy)


def main():
    who = sys.argv[1]
    dur = float(sys.argv[2])
    out = Path(sys.argv[3])

    fig = carregar(who)
    p = partes(fig)
    altura_alvo = 700 if who == "frida" else 504
    k = altura_alvo / fig.height

    cabeca = p["cabeca"].resize((round(p["cabeca"].width * k), round(p["cabeca"].height * k)), Image.LANCZOS)
    tronco = p["tronco"].resize((round(p["tronco"].width * k), round(p["tronco"].height * k)), Image.LANCZOS)
    perna = p["pernas"].resize((round(p["pernas"].width * k), round(p["pernas"].height * k)), Image.LANCZOS)
    braco = p["bracos"].resize((round(p["bracos"].width * k), round(p["bracos"].height * k)), Image.LANCZOS)

    perna_tras = ImageEnhance.Brightness(perna).enhance(0.82)
    braco_tras = ImageEnhance.Brightness(braco).enhance(0.82)
    tronco_tras = ImageEnhance.Brightness(tronco).enhance(0.9)

    bg = Image.open(BG).convert("RGB").resize((W, H), Image.LANCZOS)
    tmp = BASE / "rig_frames"
    tmp.mkdir(exist_ok=True)
    for f in tmp.glob("*.png"):
        f.unlink()

    ciclo = 0.9                        # segundos por passo completo
    passo_px = 90                      # avanco por ciclo
    amp_perna, amp_braco = 16, 10      # graus

    n = int(dur * FPS)
    for i in range(n):
        t = i / FPS
        fase = (t / ciclo) % 1.0
        s = math.sin(fase * math.tau)
        bob = abs(math.cos(fase * math.tau)) * 8

        frame = bg.copy()

        # --- perna de tras (fase oposta) ---
        pr, (ox, oy) = rot(perna_tras, -amp_perna * s, (perna.width / 2, 0))
        # --- perna da frente ---
        pf, (ox2, oy2) = rot(perna, amp_perna * s, (perna.width / 2, 0))

        cx = int(300 + passo_px * (t / dur) * 4)
        base_y = GROUND - bob

        # sombra
        d = ImageDraw.Draw(frame, "RGBA")
        d.ellipse([cx - 120, GROUND - 14, cx + 120, GROUND + 16], fill=(40, 26, 16, 70))

        # ordem: perna tras, braco tras, tronco tras, tronco, bracos, pernas frente, cabeca
        y_perna = base_y - perna.height
        frame.paste(pr, (int(cx - perna.width / 2 + ox), int(y_perna + oy)), pr)

        y_braco = base_y - perna.height - braco.height + int(perna.height * 0.18)
        br, (bx, by) = rot(braco_tras, amp_braco * s, (braco.width / 2, 0))
        frame.paste(br, (int(cx - braco.width / 2 + bx + 8), int(y_braco + by)), br)

        y_tronco = base_y - perna.height - tronco.height + int(perna.height * 0.12) + int(bob * 0.2)
        frame.paste(tronco, (int(cx - tronco.width / 2), int(y_tronco)), tronco)

        bf, (bx2, by2) = rot(braco, -amp_braco * s, (braco.width / 2, 0))
        frame.paste(bf, (int(cx - braco.width / 2 + bx2 - 6), int(y_braco + by2 - 6)), bf)

        pf2, (ox3, oy3) = rot(perna, -amp_perna * s, (perna.width / 2, 0))
        frame.paste(pf2, (int(cx - perna.width / 2 + ox3 + 10), int(y_perna + oy3)), pf2)

        y_cab = y_tronco - cabeca.height + int(cabeca.height * 0.16)
        frame.paste(cabeca, (int(cx - cabeca.width / 2 + 4), int(y_cab + math.sin(fase * math.tau) * 3)), cabeca)

        frame.save(tmp / f"f_{i:04d}.png")

    audio = BASE / "card" / "trecho4.wav"
    subprocess.run([str(FF), "-y", "-v", "error", "-ss", "28.5", "-t", str(dur),
                    "-i", str(BASE / "audio" / "voz.wav"), "-ac", "1", "-ar", "44100", str(audio)], check=True)
    subprocess.run([str(FF), "-y", "-v", "error", "-framerate", str(FPS), "-i", str(tmp / "f_%04d.png"),
                    "-i", str(audio), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
                    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(out)], check=True)
    print(f"{out} ({out.stat().st_size/1024/1024:.1f} MB)")


if __name__ == "__main__":
    main()
