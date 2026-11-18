#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rig SEM recorte: cada frame começa com a imagem APROVADA INTACTA.

Corrige o defeito do utilizador: fundo a atravessar a cara/barriga por recorte
excessivo. Aqui NÃO se recortam peças com máscaras — o frame é a happy.png original
e as regiões são deslocadas com `paste` (que preserva o alpha exacto). Onde uma
região se move, o sitio original é preenchido pela própria imagem (sem buraco),
porque o movimento é pequeno e a imagem é contínua.

Regiões com micro-movimento (deslocamento 1-3 px):
  olhos, sobrancelhas, orelhas, bochechas, bandana/colar, rabo, boca, patas.
Movimentos de gesto (locomoção) são feitos no Remotion por transform, não aqui.
"""
import argparse, math
from pathlib import Path
import numpy as np
from PIL import Image

BASE = Path(r'D:\CRAFT\work\frida-luna')
OUT = BASE/'_rig_sem_recorte'
CARD = BASE/'card'
CAIXA = {'frida':(173,231),'luna':(167,265)}
N = 8
MOV = ('escuta','fala','sorrir','olhar','comer','surpreso','salto')

# (nome, caixa x0,y0,x1,y1, amplitude px, eixo, fase)
def regioes(quem):
    if quem=='luna': return [
        ('olho_esq',(52,40,78,70),2,'x',0),('olho_dir',(90,40,116,70),2,'x',0.3),
        ('sobr_esq',(52,25,78,40),2,'x',0.5),('sobr_dir',(90,25,116,40),2,'x',2.3),
        ('bochecha_esq',(56,80,82,104),1,'y',1.1),('bochecha_dir',(88,80,114,104),1,'y',3),
        ('bandana',(39,105,127,166),2,'x',-0.7),('orelha_esq',(0,16,56,110),3,'y',0),
        ('orelha_dir',(111,16,167,110),3,'y',0.4),('cauda',(4,188,46,228),4,'x',0.8),
    ]
    return [
        ('olho_esq',(39,37,71,70),2,'x',0),('olho_dir',(103,37,135,70),2,'x',0.3),
        ('sobr_esq',(39,24,71,38),2,'x',0.5),('sobr_dir',(103,24,135,38),2,'x',2.3),
        ('bochecha_esq',(12,53,40,71),1,'y',1.1),('bochecha_dir',(134,53,162,71),1,'y',3),
        ('colar',(20,96,153,130),2,'x',-0.7),('orelha_esq',(6,2,68,52),3,'y',0),
        ('orelha_dir',(106,2,168,52),3,'y',0.4),
    ]


def gerar(quem, mov):
    W,H = CAIXA[quem]
    src = Image.open(BASE/'chars'/'poses-v3'/quem/'happy.png').convert('RGBA')
    regs = regioes(quem)
    dest = OUT/f'{quem}-{mov}'
    if dest.exists():
        import shutil; shutil.rmtree(dest)
    dest.mkdir(parents=True)
    for i in range(N):
        frame = src.copy()                      # imagem INTACTA, alpha original
        fase = (i/N)*math.tau
        for nome,(x0,y0,x1,y1),amp,eixo,off in regs:
            f = fase + off
            dx = round(amp*math.sin(f)) if eixo=='x' else 0
            dy = round(amp*math.sin(f)) if eixo=='y' else 0
            if dx==0 and dy==0: continue
            regiao = src.crop((x0,y0,x1,y1))
            # cola a região deslocada SÓ onde era opaca (mantém alpha original)
            frame.paste(regiao,(x0+dx,y0+dy),regiao)
        frame.save(dest/f'f{i:02d}.png')
    return dest


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('quem',nargs='?'); ap.add_argument('mov',nargs='?')
    ap.add_argument('--todos',action='store_true'); a=ap.parse_args()
    pares=[(q,m) for q in CAIXA for m in MOV] if a.todos else [(a.quem,a.mov)]
    for q,m in pares:
        d=gerar(q,m); print(f'{q}/{m}: {len(list(d.glob("*.png")))} frames -> {d}')

if __name__=='__main__': main()
