#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Remove a oval de TODOS os ciclos e cria referências canónicas sem oval.
Tudo fica alinhado: banco e referência sem oval.
"""
import json
import shutil
from pathlib import Path
from PIL import Image
from remover_oval_v2 import remover

BASE = Path(r'D:\CRAFT\work\frida-luna')

# 1) referências canónicas sem oval
for quem in ('frida', 'luna'):
    src = BASE/'chars'/'poses-v3'/quem/'happy.png'
    out = BASE/'chars'/'poses-v3'/quem/'happy.png'          # substitui a canónica
    backup = BASE/'chars'/'poses-v3'/quem/'happy_original_com_oval.png'
    if not backup.exists():
        shutil.copyfile(src, backup)
    im = Image.open(backup).convert('RGBA')
    limpo, _ = remover(im)
    limpo.save(out)
    print(f'{quem}: happy.png sem oval (original em backup)')

# 2) todos os quadros do banco
mp = BASE/'movimentos'/'manifest.json'
man = json.loads(mp.read_text(encoding='utf-8'))
n = 0
for quem, movs in man['personagens'].items():
    for nome, cfg in movs.items():
        for f in sorted((Path(cfg['pasta'])).glob('f*.png')):
            im = Image.open(f).convert('RGBA')
            limpo, _ = remover(im)
            limpo.save(f)
            n += 1
print(f'{n} quadros do banco sem oval')
