#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mede se a Frida se move de verdade entre quadros consecutivos do mesmo beat."""
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image
BASE = Path(r'D:\CRAFT\work\frida-luna')
FF = r'C:\Users\Pires\AppData\Local\hermes\tools\ffmpeg-9.0.1-win32-x64\bin\ffmpeg.exe'
V = BASE/'remotion'/'_prova-limpa.mp4'
# regiao da Frida no quadro 960x540
FR = (640, 240, 930, 540)

def frame(t):
    o = BASE/'card'/f'_est-{t:.2f}.png'
    subprocess.run([FF,'-y','-v','error','-i',str(V),'-ss',f'{t:.2f}','-frames:v','1',str(o)],check=True)
    return np.array(Image.open(o).convert('RGB')).astype(int)

x0,y0,x1,y1 = FR
prev=None
for t in (1.0,1.2,1.4,1.6,5.8,6.0,6.2,6.4):
    a=frame(t)[y0:y1,x0:x1]
    if prev is not None:
        d=np.abs(a-prev)
        print(f't={t:.1f}s  Frida: {100*(d>12).mean():5.2f}% pixeis mudaram')
    prev=a
    (BASE/'card'/f'_est-{t:.2f}.png').unlink(missing_ok=True)
