#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Conta pixéis transparentes DENTRO da silhueta (buracos/reccorte excessivo)."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

BASE = Path(r'D:\CRAFT\work\frida-luna')
man = json.loads((BASE/'movimentos'/'manifest.json').read_text(encoding='utf-8'))

def buracos(path):
    a = np.array(Image.open(path).convert('RGBA'))
    al = a[:,:,3]
    opaco = al > 60
    # maior componente = a personagem
    lab, n = ndimage.label(opaco, np.ones((3,3)))
    if n == 0: return 0,0
    areas = ndimage.sum(opaco, lab, range(1,n+1))
    maior = 1 + int(np.argmax(areas))
    silhueta = ndimage.binary_fill_holes(lab == maior)
    # pixéis transparentes dentro da silhueta preenchida
    within = silhueta & ~opaco
    return int(within.sum()), int(opaco.sum())

print('ciclo            buracos/total  %    veredito')
piores=[]
for quem, movs in man['personagens'].items():
    for nome, cfg in sorted(movs.items()):
        f = Path(cfg['pasta'])/'f00.png'
        if not f.exists(): continue
        b, tot = buracos(f)
        pct = 100*b/max(1,tot)
        v = 'MAU' if pct > 3 else ('aviso' if pct>1 else 'ok')
        print(f'{quem}/{nome:<14} {b:5d}/{tot:6d}  {pct:5.2f}%  {v}')
        if v!='ok': piores.append((pct,quem,nome,b))
print('\nPIORES:')
for pct,q,n,b in sorted(piores,reverse=True)[:12]:
    print(f'  {q}/{n}: {pct:.1f}% ({b} px)')
