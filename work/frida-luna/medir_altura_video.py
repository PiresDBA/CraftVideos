"""Mede a altura visível de cada personagem em frames do vídeo renderizado.

Usa as posições conhecidas do timeline (Frida x=1400, Luna x=500 em 1920) e conta
pixeis de contorno escuro dentro de cada região. Detecta se a escala muda entre beats.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

FF = Path(r"C:\Users\Pires\AppData\Local\hermes\tools\ffmpeg-9.0.1-win32-x64\bin\ffmpeg.exe")
video = Path(sys.argv[1])
pasta = Path(r"D:\CRAFT\work\frida-luna\card\_medir-altura")
pasta.mkdir(exist_ok=True)
for f in pasta.glob("m_*.png"):
    f.unlink()
for t in (0.5, 3, 6, 10, 14, 19):
    subprocess.run([str(FF), "-y", "-v", "error", "-ss", str(t), "-i", str(video),
                    "-frames:v", "1", str(pasta / f"m_{str(t).replace('.', '_')}.png")],
                   check=False, capture_output=True)

# regiões a 960x540 (o sample é scale=0.5)
regioes = {"frida": (590, 840, 80, 530), "luna": (150, 360, 80, 530)}
print(f"{'tempo':8} {'Frida alt':>10} {'Luna alt':>9} {'razao':>7}")
for p in sorted(pasta.glob("m_*.png")):
    a = np.asarray(Image.open(p).convert("RGB"), dtype=np.int16)
    vals = {}
    for nome, (x0, x1, y0, y1) in regioes.items():
        reg = a[y0:y1, x0:x1]
        # contorno escuro: todos os canais baixos
        escuro = (reg.max(axis=2) < 110)
        ys, xs = np.nonzero(escuro)
        vals[nome] = (ys.max() - ys.min() + 1) if len(ys) else 0
    r = vals["frida"] / vals["luna"] if vals["luna"] else 0
    print(f"{p.stem[2:]:8} {vals['frida']:10} {vals['luna']:9} {r:7.2f}")
