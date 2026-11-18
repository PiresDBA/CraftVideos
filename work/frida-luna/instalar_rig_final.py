#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Instala os 10 ciclos rig_novo (gesto visivel, olhos limpos)."""
import json, shutil
from pathlib import Path
BASE = Path(r'D:\CRAFT\work\frida-luna')
mp = BASE/'movimentos'/'manifest.json'
man = json.loads(mp.read_text(encoding='utf-8'))
inst=[]
for d in sorted((BASE/'_rig_novo').glob('*-*')):
    quem,mov = d.name.split('-',1)
    dest = BASE/'movimentos'/quem/mov
    if dest.exists(): shutil.rmtree(dest)
    shutil.copytree(d,dest)
    man['personagens'][quem][mov] = {
        'pasta':str(dest),'fonte':'rig_novo (olhos limpos, gesto visivel)',
        'fps':7.5,'frames':len(list(dest.glob('f*.png')))}
    inst.append(f'{quem}/{mov}')
mp.write_text(json.dumps(man,indent=1,ensure_ascii=False),encoding='utf-8')
print('instalados: '+', '.join(inst))
