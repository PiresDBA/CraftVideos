"""Banco de movimentos: registo, inventario e render de ciclos.

Porque existe: cada movimento gerado (Flow ou StickFilms) e um activo reutilizavel.
Aqui fica o indice (`manifest.json`), a proveniencia (prompt/ficheiro de origem) e o fps.
O render usa os frames como estao - sem crossfade, sem interpolacao artificial (era o que
criava os fantasmas), com ancora no centro dos pes e avanco calculado pela passada.

Uso:
  py movimentos.py listar
  py movimentos.py registar <quem> <nome> <pasta-frames> <fps> [--fonte "texto"] [--nota "texto"]
  py movimentos.py render <quem> <nome> <segundos> <saida.mp4> [--bg caminho] [--altura N]
"""
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

BASE = Path(r"D:\CRAFT\work\frida-luna")
BANK = BASE / "movimentos"
MAN = BANK / "manifest.json"
FF = Path(r"C:\Users\Pires\AppData\Local\hermes\tools\ffmpeg-9.0.1-win32-x64\bin\ffmpeg.exe")
W, H, FPS = 1920, 1080, 30
GROUND = 980


def load_man():
    if MAN.exists():
        return json.loads(MAN.read_text(encoding="utf-8"))
    return {"personagens": {}}


def save_man(m):
    BANK.mkdir(parents=True, exist_ok=True)
    MAN.write_text(json.dumps(m, indent=1, ensure_ascii=False), encoding="utf-8")


def cmd_listar():
    m = load_man()
    for who, movs in m["personagens"].items():
        print(f"\n{who}:")
        for nome, c in movs.items():
            print(f"  {nome:14} {c['frames']:3} frames @ {c['fps']} fps   {c.get('fonte','')[:60]}")


def cmd_registar(who, nome, pasta, fps, fonte="", nota=""):
    m = load_man()
    p = Path(pasta)
    frames = sorted([f.name for f in p.glob("*.png")])
    if not frames:
        raise SystemExit(f"sem PNGs em {pasta}")

    # medida da passada: abertura entre os pes no desenho (max-min da largura da base).
    # um ciclo completo = duas meias-passadas = 2 * (largura_max - largura_min)
    larguras = []
    for f in frames:
        a = Image.open(p / f).convert("RGBA")
        alpha = a.split()[3]
        profundidade = int(a.height * 0.82)
        base = alpha.crop((0, profundidade, a.width, a.height))
        bbox = base.getbbox()
        larguras.append((bbox[2] - bbox[0]) if bbox else 0)
    abertura = (max(larguras) - min(larguras)) if larguras else 0
    passada = 2 * abertura

    dest = BANK / who / nome
    dest.mkdir(parents=True, exist_ok=True)
    for f in frames:
        (dest / f).write_bytes((p / f).read_bytes())
    m["personagens"].setdefault(who, {})[nome] = {
        "frames": len(frames), "fps": float(fps), "pasta": str(dest),
        "ficheiros": frames, "fonte": fonte, "nota": nota,
        "passada_sprite": passada, "abertura_pes": abertura,
        "altura_sprite": Image.open(p / frames[0]).height,
    }
    save_man(m)
    print(f"registado {who}/{nome}: {len(frames)} frames @ {fps} fps | "
          f"abertura dos pes {abertura} px -> passada {passada} px (desenho)")



def cmd_render(who, nome, dur, out, bg_path=None, altura=700, x0=300, audio_path=None,
               passada_override=None):
    m = load_man()
    conf = m["personagens"][who][nome]
    pasta = Path(conf["pasta"])
    fr = [Image.open(pasta / f).convert("RGBA") for f in conf["ficheiros"]]
    bg = Image.open(bg_path or (BASE / "bg" / "flow" / "portao.png")).convert("RGB").resize((W, H), Image.LANCZOS)

    tmp = BASE / "_render_frames"
    tmp.mkdir(exist_ok=True)
    for f in tmp.glob("*.png"):
        f.unlink()

    dur = float(dur)
    fps_anim = conf["fps"]
    n = int(dur * FPS)

    for i in range(n):
        t = i / FPS
        # quadro do ciclo: passo inteiro (sem interpolacao -> sem fantasmas)
        qi = int(t * fps_anim) % len(fr)
        sprite = fr[qi]

        k = altura / sprite.height
        s = sprite.resize((max(1, round(sprite.width * k)), altura), Image.LANCZOS)

        # avanco preso ao passo: um ciclo = uma passada medida no proprio desenho
        # (passada_sprite vem do registo; era um 92 fixo que fazia patinar)
        ciclo = len(fr) / fps_anim
        passada = conf.get("passada_sprite", 0) * k
        if passada_override is not None:
            passada = float(passada_override)   # 0 para idle/fala (personagem parada)
        elif passada <= 0:
            passada = s.width * 0.55
        x = x0 + (t / ciclo) * passada
        # o desenho nao tem balanco vertical proprio: 2 px chegam para nao parecer "travado"
        bob = abs(math.sin((t / ciclo) * math.pi * 2)) * 2

        frame = bg.copy()
        d = ImageDraw.Draw(frame, "RGBA")
        cx = int(x + s.width / 2)
        d.ellipse([cx - s.width * 0.30, GROUND - 12, cx + s.width * 0.30, GROUND + 16], fill=(40, 26, 16, 72))
        frame.paste(s, (int(x), int(GROUND - s.height - bob)), s)
        frame.save(tmp / f"f_{i:04d}.png")

    audio = BASE / "card" / "_render.wav"
    subprocess.run([str(FF), "-y", "-v", "error", "-ss", "28.5", "-t", str(dur),
                    "-i", str(BASE / "audio" / "voz.wav"), "-ac", "1", "-ar", "44100", str(audio)], check=True)
    subprocess.run([str(FF), "-y", "-v", "error", "-framerate", str(FPS), "-i", str(tmp / "f_%04d.png"),
                    "-i", str(audio), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19",
                    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(out)], check=True)
    print(f"{out} ({Path(out).stat().st_size/1024/1024:.1f} MB)")


def main():
    cmd = sys.argv[1]
    if cmd == "listar":
        return cmd_listar()
    if cmd == "registar":
        fonte = sys.argv[sys.argv.index("--fonte") + 1] if "--fonte" in sys.argv else ""
        nota = sys.argv[sys.argv.index("--nota") + 1] if "--nota" in sys.argv else ""
        return cmd_registar(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], fonte, nota)
    if cmd == "render":
        bg = sys.argv[sys.argv.index("--bg") + 1] if "--bg" in sys.argv else None
        alt = int(sys.argv[sys.argv.index("--altura") + 1]) if "--altura" in sys.argv else 700
        x0 = int(sys.argv[sys.argv.index("--x0") + 1]) if "--x0" in sys.argv else 300
        audio = sys.argv[sys.argv.index("--audio") + 1] if "--audio" in sys.argv else None
        passada = (float(sys.argv[sys.argv.index("--passada") + 1])
                   if "--passada" in sys.argv else None)
        return cmd_render(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5],
                          bg, alt, x0, audio, passada)
    raise SystemExit(__doc__)


if __name__ == "__main__":
    main()


