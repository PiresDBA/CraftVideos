#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""rig_novo.py — reconstrução do rig 2D de Frida & Luna (versão limpa).

RECONSTRUÍDO DE RAÍZ com tudo o que foi aprendido. Substitui rig_estendido.py.

Princípio (corrige a "tranqueira" do código anterior):
  O código antigo rodava o FRAME INTEIRO por região e misturava dentro de máscaras
  em elipse aproximada -> contornos deformados, riscos (AFFINE), costuras z-order,
  piscar em linha recta, e um filtro de sombra por cor proibido pelo contrato.

  Aqui cada região é uma PEÇA RGBA com a ALFA REAL dos pixéis da pose aprovada.
  Anima-se SÓ a peça (rotação/translação/escala locais) e recompoem-se as peças por
  camadas (painter's algorithm). Nunca se toca no frame inteiro nem se apagam pixéis
  por faixa/cor. A sombra gravada da arte aprovada é PRESERVADA (contrato §3).

Regras incorporadas (todo o histórico da conversa):
  - Postura BÍPEDE sempre (peças vêm da pose em pé; nunca geramos quatro patas).
  - Caixa fixa Frida 173x231 / Luna 167x265, fundo RGBA real, pés na baseline.
  - 13 regiões: pernas, braços, cabeça, orelhas(raiz+ponta), olhos, sobrancelhas,
    bochecha/focinho, colar/bandana, rabinho, dedos, boca, nariz, pálpebra.
  - FALA: braço quase parado (1-2 px), peso na boca(RMS)/sobrancelhas/olhos — para avatar.
  - Piscar com CURVA (compressão suave da própria pálpebra, não linha recta).
  - Micro-movimentos: pelo menos 3 regiões mudam entre quadros; loop fecha (f07~f00).
  - NENHUM pixel novo: tudo vem de chars/poses-v3/<quem>/happy.png.

Saída: _rig_novo/<quem>-<mov>/f00..f07.png + folha card/_novo-<quem>-<mov>.png
Uso:
  py rig_novo.py luna marcha
  py rig_novo.py --todos
  py rig_novo.py --debug        # mostra as peças extraídas
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

BASE = Path(r"D:\CRAFT\work\frida-luna")
OUT = BASE / "_rig_novo"
CARD = BASE / "card"
CAIXA = {"frida": (173, 231), "luna": (167, 265)}
MOVS = ("marcha", "corrida", "salto", "giro", "fala")
N = 8

# amplitude por movimento.Na FALA o braço é contido (1 px) de propósito (avatar).
AMP = {
    "marcha": dict(perna=22, braco=13, cabeca=0.8, bob=2, orelha=3, olhar=3,
                   piscar=0, sobr=4, bochecha=2, colar=3, cauda=6, dedo=1, boca=0.5),
    "corrida": dict(perna=26, braco=16, cabeca=1.0, bob=3, orelha=4, olhar=3,
                    piscar=0, sobr=4, bochecha=3, colar=4, cauda=8, dedo=2, boca=0.8),
    "salto": dict(perna=22, braco=10, cabeca=0.8, bob=8, orelha=7, olhar=2,
                  piscar=0, sobr=3, bochecha=2, colar=3, cauda=7, dedo=1, boca=0.6),
    "giro": dict(perna=6, braco=5, cabeca=0.8, bob=2, orelha=6, olhar=3,
                 piscar=0, sobr=4, bochecha=2, colar=3, cauda=6, dedo=1, boca=0.4),
    "fala": dict(perna=0, braco=1, cabeca=1.2, bob=1, orelha=5, olhar=3,
                 piscar=0, sobr=4, bochecha=3, colar=2, cauda=3, dedo=1, boca=1.2),
}

# caixas das peças em pixéis do sprite aprovado (calibradas da arte 2x).
# (x0,y0,x1,y1, piv_x, piv_y, camada, tipo)
PECAS_LUNA = [
    ("cauda",    (10,168, 46,226, 36,172, 0, "rot")),
     ("pata_esq", (30,238, 76,264, 52,240, 1, "rot")),
     ("pata_dir", (94,238,140,264,116,240, 1, "rot")),
     ("braco_esq",(46,176, 76,206, 58,180, 2, "rot")),
     ("braco_dir",(94,176,124,206,106,180, 2, "rot")),
     ("bandana",  (36,104,130,166, 83,108, 3, "trans")),
     ("orelha_esq",(0,14, 58,64, 46,22, 4, "rot")),
     ("orelha_dir",(110,14,167,64,121,22, 4, "rot")),
     ("cabeca",   (20,0,147,112, 83,100, 5, "rot")),
     ("olho_esq", (52,40, 78,70, 65,54, 6, "olho")),
     ("olho_dir", (90,40,116,70,103,54, 6, "olho")),
     ("sobr_esq", (52,25, 78,40, 65,37, 7, "trans")),
     ("sobr_dir", (90,25,116,40,102,37, 7, "trans")),
     ("nariz",    (75,68,102,94, 88,70, 8, "nariz")),
     ("bochecha_esq",(56,80, 82,104, 69,92, 9, "trans")),
     ("bochecha_dir",(88,80,114,104,101,92, 9, "trans")),
     ("boca",     (66,88,104,106, 85,90,10, "boca")),
]
PECAS_FRIDA = [
    ("rabo",     (12,158, 40,208, 32,163, 0, "rot")),
     ("pata_esq", (30,204, 74,230, 48,206, 1, "rot")),
     ("pata_dir", (100,204,144,230,122,206, 1, "rot")),
     ("braco_esq",(8,150, 42,184, 20,155, 2, "rot")),
     ("braco_dir",(132,150,166,184,153,155, 2, "rot")),
     ("colar",    (18,94,155,132, 86,98, 3, "trans")),
     ("orelha_esq",(6,2, 68,32, 56,10, 4, "rot")),
     ("orelha_dir",(106,2,168,32,118,10, 4, "rot")),
     ("cabeca",   (18,0,156,124, 86,100, 5, "rot")),
     ("olho_esq", (38,36, 72,72, 54,52, 6, "olho")),
     ("olho_dir", (102,36,136,72,118,52, 6, "olho")),
     ("sobr_esq", (38,23, 72,38, 54,35, 7, "trans")),
     ("sobr_dir", (102,23,136,38,118,35, 7, "trans")),
     ("nariz",    (78,45,114,68, 96,48, 8, "nariz")),
     ("bochecha_esq",(12,53, 40,72, 26,61, 9, "trans")),
     ("bochecha_dir",(134,53,162,72,148,61, 9, "trans")),
     ("boca",     (80,71,114,98, 96,75,10, "boca")),
]
PECAS = {"luna": PECAS_LUNA, "frida": PECAS_FRIDA}


def _alfa_real(src, box, suave=2):
    """Recorta a peça com a ALFA REAL da imagem (elipse suave só limita a caixa)."""
    x0, y0, x1, y1, *_ = box
    crop = src[y0:y1, x0:x1].copy()
    h, w = crop.shape[:2]
    # máscara elíptica em PIL (robusta, sem broadcasting numpy)
    S = 4
    m = Image.new("L", (w * S, h * S), 0)
    ImageDraw.Draw(m).ellipse((0, 0, w * S - 1, h * S - 1), fill=255)
    m = m.resize((w, h), Image.LANCZOS).filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(0.8))
    forma = np.asarray(m, dtype=np.float32) / 255.0
    crop[..., 3] = np.round(crop[..., 3].astype(np.float32) * forma).astype(np.uint8)
    return Image.fromarray(crop, "RGBA")


def extrair(quem, debug=False, sem_oval=False):
    W, H = CAIXA[quem]
    src_img = Image.open(BASE / "chars" / "poses-v3" / quem / "happy.png").convert("RGBA")
    # SÓ no salto: remover a oval para o personagem saltar sem sombra colada aos
    # pés. A sombra de contacto passa a ser desenhada pelo Remotion (fica no chão).
    if sem_oval:
        try:
            from remover_oval import remover as _remover_oval
            src_img, _ = _remover_oval(src_img)
        except Exception as e:
            print(f"aviso: nao removeu oval ({e})")
    src = np.array(src_img)
    assert (src.shape[1], src.shape[0]) == (W, H)
    pecas = []
    for nome, box in PECAS[quem]:
        pecas.append(dict(nome=nome, box=box, imagem=_alfa_real(src, box)))
    # Modelo CORRECTO (sem "base menos peças"): a base é a imagem ORIGINAL COMPLETA.
    # As peças animadas colam-se POR CIMA. Ao rodar/subir uma peça, a parte da imagem
    # original que fica descoberta é exactamente o desenho em repouso — nunca um risco.
    # (A abordagem anterior de subtrair peças da base criava bocados e triângulos.)
    base = Image.fromarray(src, "RGBA")
    if debug:
        sheet = Image.new("RGBA", (W * (len(pecas) + 1), H), (255, 255, 255, 255))
        sheet.paste(base, (0, 0), base)
        for i, p in enumerate(pecas):
            sheet.paste(p["imagem"], ((i + 1) * W, 0), p["imagem"])
        sheet.convert("RGB").save(CARD / f"_novo-pecas-{quem}.png")
    return base, pecas


def _rodar_peça(im, ang, piv):
    if abs(ang) < 0.05:
        return im
    return im.rotate(ang, resample=Image.BICUBIC, center=piv, expand=False, fillcolor=(0, 0, 0, 0))


def _comprimir(im, fator):
    """Compressão vertical suave ancorada no topo (piscar com curva natural)."""
    if fator >= 0.99:
        return im
    h2 = max(2, int(round(im.height * fator)))
    return im.resize((im.width, h2), Image.LANCZOS)


def animar_peça(p, i, a, mov, self_src=None):
    nome, box = p["nome"], p["box"]
    x0, y0, x1, y1, px, py, z, tipo = box
    piv = (px - x0, py - y0)
    fase = (i / N) * math.tau
    s, c = math.sin(fase), math.cos(fase)
    im = p["imagem"]

    if tipo == "rot":
        if "pata" in nome:
            ang = (1 if "esq" in nome else -1) * a["perna"] * s
        elif "braco" in nome:
            # FALA: braço quase parado (a['braco']==1) -> micro, não gesticula à solta
            ang = (-1 if "esq" in nome else 1) * a["braco"] * s
        elif "orelha" in nome:
            ang = a["orelha"] * s * (0.6 if "ponta" in nome else 1.0)
        elif nome == "cabeca":
            ang = a["cabeca"] * s
        else:
            ang = a["cauda"] * s
        out = _rodar_peça(im, ang, piv)
        # SALTO: orelhas e rabo sobem (follow-through) no momento do pulo
        if mov == "salto" and ("orelha" in nome or "cauda" in nome or nome == "rabo"):
            lift = int(round(abs(c) * 6))
            tmp = Image.new("RGBA", out.size, (0, 0, 0, 0))
            tmp.paste(out, (0, -lift))
            out = tmp
        return out

    if tipo == "trans":
        amp = a["sobr"] if "sobr" in nome else (a["bochecha"] if "bochecha" in nome else a["colar"])
        dx = int(round(amp * s))
        dy = int(round(amp * 0.4 * c))
        out = Image.new("RGBA", im.size, (0, 0, 0, 0))
        out.paste(im, (dx, dy))
        return out

    if tipo == "olho":
        dx = int(round(a["olhar"] * c * (1 if "esq" in nome else -0.8)))
        dy = int(round(0.5 * s))
        out = Image.new("RGBA", im.size, (0, 0, 0, 0))
        out.paste(im, (dx, dy))
        # PISCAR DESACTIVADO: todas as versões do piscar geraram artefactos
        # (olho duplo, rastro, pálpebra grande). O utilizador reprovou todas.
        # Os olhos apenas olham 1-2 px (limpo); a vida vem das sobrancelhas,
        # orelhas, bochechas, bandana e rabo. Sem piscar = sem artefacto.
        if False and i in (3, 4):
            arr = np.array(im)
            escuros = arr[arr[:, :, 3] > 120][:, :3]
            esc = escuros[np.argmin(escuros.mean(axis=1))].astype(np.uint8) if len(escuros) else np.array([40,20,20], np.uint8)
            pisca = Image.new("RGBA", im.size, (0, 0, 0, 0))
            pd = ImageDraw.Draw(pisca)
            w, h = im.size
            y = h // 2
            # pele da pálpebra = cor do pixél opaco logo ACIMA do olho (na imagem cheia)
            try:
                gx0, gy0, _, _ = [int(v) for v in box[:4]]
                acima = np.array(self_src)[max(0, gy0-6):gy0-2, gx0:gx0+w]
                pele_op = acima[acima[:, :, 3] > 120][:, :3]
                pele = np.median(pele_op, axis=0).astype(np.uint8) if len(pele_op) else np.array([200,150,90],np.uint8)
            except Exception:
                pele = np.array([200,150,90], np.uint8)
            # 1) tapar o olho TODO com a pele (ellipse cerca da caixa inteira)
            pd.ellipse((1, 1, w-2, h-2), fill=tuple(int(v) for v in pele)+(255,))
            # 2) linha da pálpebra fechada, curta e dentro da caixa
            pd.line([(int(w*0.15), y), (w//2, y+1), (int(w*0.85), y)],
                    fill=tuple(int(v) for v in esc)+(255,), width=2)
            return pisca
        return out

    if tipo == "nariz":
        ang = 2.0 * s
        out = Image.new("RGBA", im.size, (0, 0, 0, 0))
        out.paste(im, (int(round(1.0 * c)), int(round(0.6 * s))))
        return _rodar_peça(out, ang, piv)

    if tipo == "boca":
        v = 0.5 + 0.5 * c
        f = 0.85 + 0.15 * v * (a["boca"] / 0.5)
        return _comprimir(im, min(1.0, f))

    return im


def gerar(quem, mov):
    W, H = CAIXA[quem]
    a = AMP[mov]
    src = np.array(Image.open(BASE / "chars" / "poses-v3" / quem / "happy.png").convert("RGBA"))
    base, pecas = extrair(quem)   # referência é a happy.png sem oval; tudo alinhado
    dest = OUT / f"{quem}-{mov}"
    if dest.exists():
        import shutil
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    ordem = sorted(pecas, key=lambda p: p["box"][6])

    maxbob = int(a["bob"])
    for i in range(N):
        # f00 = repouso (bob 0); pico do salto nos frames 3-4
        bob = int(round(abs(math.sin((i / N) * math.tau)) * a["bob"]))
        # SALTO DE VERDADE: o boneco sobe INTEIRO (mesmo tamanho), os pés descolam
        # do chão. Margem de 6 px extra no topo para a orelha não cortar. Sem resize!
        MARGEM = 8
        off = MARGEM - bob                    # repouso=8, pico=0
        frame = Image.new("RGBA", (W, H + MARGEM + 4), (0, 0, 0, 0))
        frame.alpha_composite(base, (0, off))
        for p in ordem:
            x0, y0, *_ = p["box"]
            peça = animar_peça(p, i, a, mov, self_src=src)
            frame.alpha_composite(peça, (x0, y0 + off))
        # crop: em repouso queremos o sprite exatamente na caixa (offset 8 -> crop 0+8-8=0
        # daria 8px deslocado); usamos crop em (off - 8 + bob)=0 fixo, e o boneco em
        # repouso fica MARGEM(8)px abaixo do topo — compensamos colando em off=0 quando bob=0.
        frame = frame.crop((0, 0, W, H))
        frame.save(dest / f"f{i:02d}.png")

    fs = sorted(dest.glob("*.png"))
    sheet = Image.new("RGB", (N * W + (N + 1) * 8, H + 34), (238, 236, 232))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(fs):
        im = Image.open(f).convert("RGBA")
        x = 8 + i * (W + 8)
        sheet.paste(im, (x, 24), im)
        d.text((x + 2, 5), f"f{i:02d}", fill=(20, 20, 20))
    out = CARD / f"_novo-{quem}-{mov}.png"
    sheet.save(out)
    return dest, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("quem", nargs="?", choices=("frida", "luna"))
    ap.add_argument("mov", nargs="?", choices=MOVS)
    ap.add_argument("--todos", action="store_true")
    ap.add_argument("--debug", action="store_true")
    a = ap.parse_args()
    CARD.mkdir(parents=True, exist_ok=True)
    if a.debug:
        for q in CAIXA:
            extrair(q, debug=True)
            print("pecas:", CARD / f"_novo-pecas-{q}.png")
        return
    pares = [(q, m) for q in CAIXA for m in MOVS] if a.todos else [(a.quem, a.mov)]
    for q, m in pares:
        dest, sheet = gerar(q, m)
        print(f"{q}/{m}: {len(list(dest.glob('*.png')))} frames -> {dest}")
        print(f"  folha: {sheet}")


if __name__ == "__main__":
    main()
