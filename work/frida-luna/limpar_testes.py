#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Apaga SÓ lixo de teste/renderização. Nunca toca no banco, poses, scripts ou relatórios."""
import shutil
from pathlib import Path

BASE = Path(r'D:\CRAFT\work\frida-luna')

# pastas 100% temporárias (frames intermediários de render, caches)
PASTAS = [
    '_clipes_tmp', '_clipes_novo_tmp', 'rig_frames', '_marcha_luna_tmp',
    '_reconstruir', '_av',
]
# pastas de teste de ciclos (o conteúdo que presta já está no banco movimentos/)
PASTAS_TESTE = ['_rig_test', '_rig_gesto']

removido = 0
for nome in PASTAS + PASTAS_TESTE:
    p = BASE / nome
    if p.exists():
        n = sum(1 for _ in p.rglob('*') if _.is_file())
        sz = sum(f.stat().st_size for f in p.rglob('*') if f.is_file())
        shutil.rmtree(p)
        removido += sz
        print(f'  apagado {nome}/ ({n} ficheiros, {sz/1048576:.1f} MB)')

# PNGs de teste em card/ — apagar TODOS excepto os que ainda servem de evidência
MANTER = {
    '_prova-final3-mosaico.png',       # evidência que o utilizador está a analisar
    '_prova-final2-mosaico.png',
    '_prova-final-mosaico.png',
    '_passo-rig-luna.png', '_passo-rig-frida.png',
    '_novo-luna-marcha.png', '_novo-luna-salto.png',
    '_novo-frida-marcha.png', '_novo-frida-salto.png',
    '_acenar-luna.png', '_acenar-frida.png',
    '_catalogo-25.png', '_catalogo-movimentos.png',
    '_queixa-luna-pe-zoom.png', '_queixa-frida-tchau-zoom.png', '_queixa-salto-zoom.png',
    '_teste-sem-oval-luna.png', '_teste-sem-oval-frida.png',
    '_luna-pes-ampliado.png',
    '_rig-test-luna.png', '_rig-test-frida.png',
}
card = BASE / 'card'
apagados = 0
for f in card.glob('*.png'):
    if f.name not in MANTER:
        sz = f.stat().st_size
        f.unlink()
        removido += sz
        apagados += 1
print(f'  apagados {apagados} PNGs de teste em card/')

# vídeos de prova antigos (manter só o final3, que o utilizador está a ver)
for nome in ('_prova-final.mp4', '_prova-final2.mp4', '_prova-seg.mp4'):
    p = BASE / 'remotion' / nome
    if p.exists():
        removido += p.stat().st_size
        p.unlink()
        print(f'  apagado remotion/{nome}')

# clipes antigos (versão reprovada). Manter clipes-novo (os bons).
p = BASE / 'card' / 'clipes'
if p.exists():
    sz = sum(f.stat().st_size for f in p.rglob('*') if f.is_file())
    shutil.rmtree(p); removido += sz
    print(f'  apagado card/clipes/ (versao reprovada, {sz/1048576:.1f} MB)')

print(f'\nTotal libertado: {removido/1048576:.1f} MB')
