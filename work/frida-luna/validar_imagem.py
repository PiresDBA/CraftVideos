#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VALIDADOR ESPECIALISTA — vale para TODA imagem que entra no banco.

Cinco portas, sempre nesta ordem, para cada pasta de frames candidata:

  (a) fundo RGBA transparente de verdade
      - borda da imagem com alpha==0 em >= 85% dos pixéis (calibrado nos 5 ciclos
        aprovados: 0,887-0,906), >4% transparente;
      - sem papel creme/branco opaco a tocar a borda;
      - sem linha de chão (componente muito achatado no último décimo).
  (b) caixa fixa EXACTA: 173x231 (Frida) / 167x265 (Luna) em todos os frames.
  (c) SEM sombra oval: nenhum componente achatado (larg/alt > 2.2) no terço
      inferior, com area < 30% da figura principal.
  (d) exactamente UMA figura por frame. O espaçamento >= 1/4 da largura é
      verificado na FOLHA ORIGINAL por validar_espacamento(), antes do corte.
  (e) continuidade <= 0,45 do frame 00 contra a pose aprovada
      (chars/poses-v3/<quem>/happy.png).

Saida (stdout): JSON com veredito ACEITE/REJEITADA, portas, motivos e scores.
Uso: py validar_imagem.py <pasta-frames> <frida|luna> [--nome NOME] [--json]
Exit code 0 = ACEITE, 1 = REJEITADA.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

BASE = Path(r"D:\CRAFT\work\frida-luna")
sys.path.insert(0, str(BASE))

CAIXA = {"frida": (173, 231), "luna": (167, 265)}


def _borda(mask):
    return np.concatenate([mask[:2].ravel(), mask[-2:].ravel(),
                           mask[:, :2].ravel(), mask[:, -2:].ravel()])


def _porta_fundo(a):
    """a: array RGBA de um frame. Devolve (ok, detalhe)."""
    al = a[:, :, 3]
    borda = _borda(al)
    frac_borda_transp = float((borda == 0).mean())
    frac_transp = float((al == 0).mean())
    # papel: pixéis opacos a tocar a borda — se a borda toda e opaca, ha papel.
    # limiar 0,85: os ciclos aprovados do projecto medem 0,887-0,906 (anti-aliasing).
    papel = frac_borda_transp < 0.85
    # linha de chão: componente MUITO achatada (larg/alt > 4) no ultimo decimo,
    # desligada da figura. Uma linha de cobertura alta pode ser o corpo da salsicha —
    # por isso usamos componentes, nao contagem de pixéis por linha.
    mask = al > 200
    comps, _, _ = _componentes(mask)
    areas = [c[1] for c in comps]
    maior = max(areas, default=1)
    H = a.shape[0]
    chao = 0
    for _, area, sl in comps:
        if sl is None:
            continue
        larg = sl[1].stop - sl[1].start
        alt = sl[0].stop - sl[0].start
        if sl[0].start > H * 0.90 and larg / max(1, alt) > 4 and area < maior * 0.25:
            chao += 1
    ok = bool(frac_borda_transp >= 0.85 and frac_transp > 0.04 and not papel and chao == 0)
    detalhe = {"frac_borda_alpha0": round(frac_borda_transp, 3),
               "frac_alpha0": round(frac_transp, 3),
               "papel_na_borda": bool(papel), "linhas_chao": chao,
               "alpha_min": int(al.min()), "alpha_max": int(al.max())}
    return ok, detalhe


def _porta_caixa(a, quem):
    W, H = CAIXA[quem]
    ok = (a.shape[1] == W and a.shape[0] == H)
    return ok, {"largura": a.shape[1], "altura": a.shape[0], "exigido": [W, H]}


def _componentes(mask):
    rot, n = ndimage.label(mask)
    if n == 0:
        return [], rot, n
    areas = ndimage.sum(mask, rot, index=range(1, n + 1))
    caixas = ndimage.find_objects(rot)
    return [(i + 1, float(areas[i]), caixas[i]) for i in range(n)], rot, n


def _porta_sombra(a):
    """Oval achatado no terço inferior, menor que a figura: e sombra desenhada."""
    al = a[:, :, 3] > 128
    comps, _, _ = _componentes(al)
    if not comps:
        return False, {"aviso": "sem pixéis opacos"}
    areas = [c[1] for c in comps]
    maior = max(areas)
    H = a.shape[0]
    sombras = []
    for _, area, sl in comps:
        if sl is None:
            continue
        alt = sl[0].stop - sl[0].start
        larg = sl[1].stop - sl[1].start
        no_fundo = sl[0].start > H * 0.66
        # área mínima 40 px: resíduos de 4-6 px do anti-aliasing da oval removida
        # são ruído invisível, não uma sombra desenhada (uma oval real = 1500+ px).
        oval = (larg / max(1, alt)) > 2.2 and area < maior * 0.30 and area >= 40
        if no_fundo and oval:
            sombras.append({"larg": larg, "alt": alt, "area": round(area)})
    return (len(sombras) == 0), {"sombra_oval": sombras}


def _porta_uma(a):
    """Exactamente UMA figura por frame.

    A margem de 1/4 da largura e requisito da FOLHA ORIGINAL (espaco entre figuras
    vizinhas), verificada por validar_espacamento() antes do corte. Depois de
    fixar_proporcoes.py a figura e recortada ao bbox e redimensionada para preencher
    a caixa fixa — nao ha margem lateral por construcao.
    """
    al = a[:, :, 3] > 128
    comps, _, _ = _componentes(al)
    maior_area = max((x[1] for x in comps), default=1)
    principais = [c for c in comps if c[1] >= 0.12 * maior_area]
    if len(principais) != 1:
        return False, {"figuras": len(principais),
                       "areas": [round(c[1]) for c in principais]}
    sl = principais[0][2]
    larg = sl[1].stop - sl[1].start
    return True, {"figuras": 1, "largura_figura_frac": round(larg / a.shape[1], 3)}


def validar(pasta, quem=None, nome=""):
    """Valida uma pasta (ou um unico f00.png).

    `quem` e opcional: se omitido, e inferido do caminho
    (.../movimentos/<frida|luna>/<ciclo>/f00.png). Isto permite ao
    verificar_contrato.py chamar validar(caminho_do_ficheiro) com um so argumento.
    """
    pasta = Path(pasta)
    if quem is None:
        partes = [p.lower() for p in pasta.parts]
        quem = next((p for p in reversed(partes) if p in CAIXA), None)
        if quem is None:
            return {"veredito": "REJEITADA", "ok": False,
                    "motivos": ["personagem nao inferida do caminho"],
                    "portas": {}, "scores": {"frames": 0}}
    if pasta.is_file():
        fs = [pasta]
    else:
        fs = sorted(pasta.glob("f*.png"))
        if not fs:
            fs = sorted(pasta.glob("*.png"))
    if not fs:
        return {"veredito": "REJEITADA", "ok": False, "motivos": ["sem frames PNG"],
                "portas": {}, "scores": {"frames": 0}}

    motivos = []
    detalhes = {}
    portas_ok = {k: True for k in ("fundo", "caixa", "sombra", "uma_figura", "postura", "continuidade")}
    frames = [np.array(Image.open(f).convert("RGBA")) for f in fs]
    W, H = CAIXA[quem]

    # (d2) POSTURA BÍPEDE — porta nova (18/11/2026).
    # Uma personagem em pé tem massa no terço superior (cabeça); uma de quatro
    # patas tem pouca. Calibrada RELATIVAMENTE à referência aprovada (robusta a
    # diferenças de desenho: Frida 0,296, Luna 0,388). Limiar = ref*0,88.
    # Esta porta faltou e deixou passar folhas de quatro patas esticadas na caixa.
    def _frac_sup(img):
        opaco = img[:, :, 3] > 60
        ter = max(1, opaco.shape[0] // 3)
        return float(opaco[:ter].sum()) / max(1, int(opaco.sum()))
    frac_med = float(np.mean([_frac_sup(a) for a in frames]))
    ref_img = np.array(Image.open(BASE / "chars" / "poses-v3" / quem / "happy.png")
                       .convert("RGBA"))
    ref_sup = _frac_sup(ref_img)
    limiar = ref_sup * 0.88
    if frac_med < limiar:
        portas_ok["postura"] = False
        motivos.append(f"postura nao bípede: frac_sup={frac_med:.3f} < {limiar:.3f} "
                       f"(ref {ref_sup:.3f}; desenho de quatro patas/deitado)")
    detalhes["postura"] = round(frac_med, 3)
    detalhes["postura_limiar"] = round(limiar, 3)

    for k in ("fundo", "caixa", "sombra", "uma_figura"):
        falhas = []
        for f, a in zip(fs, frames):
            if k == "fundo":
                ok, det = _porta_fundo(a)
            elif k == "caixa":
                ok, det = _porta_caixa(a, quem)
            elif k == "sombra":
                ok, det = _porta_sombra(a)
            else:
                ok, det = _porta_uma(a)
            if not ok:
                falhas.append({"frame": f.name, **det})
        detalhes[k] = falhas[:8]
        if falhas:
            portas_ok[k] = False
            rotulo = {"fundo": "fundo nao transparente / papel / linha de chao",
                      "caixa": f"caixa errada (exigido {W}x{H})",
                      "sombra": "sombra oval desenhada",
                      "uma_figura": "mais de uma figura ou sem margem 1/4"}[k]
            motivos.append(f"{rotulo}: {len(falhas)}/{len(fs)} frames")

    # (e) continuidade do frame 00
    cont = 99.0
    try:
        from calibrar_continuidade import assinatura, distancia
        # Referência canónica = happy.png SEM oval (oval_total.py). Tudo alinhado.
        ref = BASE / "chars" / "poses-v3" / quem / "happy.png"
        cont = float(distancia(assinatura(fs[0]), assinatura(ref)))
    except Exception as e:
        motivos.append(f"continuidade: nao foi possivel medir ({e})")
    if cont > 0.45:
        portas_ok["continuidade"] = False
        motivos.append(f"continuidade {cont:.2f} > 0,45 — nao e a pose aprovada")
    detalhes["continuidade"] = round(cont, 3)

    return {"veredito": "ACEITE" if not motivos else "REJEITADA",
            "ok": not motivos,
            "nome": nome or str(pasta), "quem": quem,
            "frames": len(fs), "portas": portas_ok,
            "motivos": motivos, "detalhes": detalhes,
            "scores": {"continuidade": round(cont, 3),
                       "frames": len(fs)}}


def validar_espacamento(imagem, limiar=26):
    """Requisito (d) na FOLHA ORIGINAL: gap >= 1/4 da largura entre figuras.

    Chamado por processar_download.py ANTES do corte. Usa o alpha real quando
    existe; caso contrario mede a "cor quente" (R-B) por coluna — as personagens
    sao quentes (castanho/creme) e os fundos do Flow (branco, creme, xadrez cinza)
    sao neutros. A projecção horizontal produz uma regiao por figura mesmo em
    fundos que confundem o corte por ligacao a borda.
    """
    import numpy as np
    from PIL import Image
    import scipy.ndimage as ndi
    a = np.array(Image.open(imagem).convert("RGBA"))
    al = a[:, :, 3]
    if al.min() < 250 and float((al < 128).mean()) > 0.05:
        proj = (al > 128).sum(axis=0).astype(float)
    else:
        rgb = a[:, :, :3].astype(np.int16)
        calor = np.clip(rgb[:, :, 0] - rgb[:, :, 2] - 14, 0, None)
        proj = calor.sum(axis=0).astype(float)
    mx = float(proj.max()) if proj.size else 0.0
    if mx <= 0:
        return {"ok": False, "figuras": 0, "largura_mediana": 0,
                "menor_gap": 0, "exigido": 0, "gaps": []}
    on = ndi.binary_closing(proj > mx * 0.12, np.ones(5))
    regs = []
    ini = None
    for i, v in enumerate(on):
        if v and ini is None:
            ini = i
        if not v and ini is not None:
            regs.append((ini, i))
            ini = None
    if ini is not None:
        regs.append((ini, len(on)))
    regs = [r for r in regs if r[1] - r[0] > 25]
    larguras = [r[1] - r[0] for r in regs]
    med = float(np.median(larguras)) if larguras else 0
    gaps = [b[0] - x[1] for x, b in zip(regs, regs[1:])]
    pior = min(gaps) if gaps else 0
    ok = bool(len(regs) >= 4 and pior >= med * 0.25)
    return {"ok": ok, "figuras": len(regs), "largura_mediana": round(med, 1),
            "menor_gap": pior, "exigido": round(med * 0.25, 1),
            "gaps": gaps[:12]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pasta")
    ap.add_argument("quem", nargs="?", choices=("frida", "luna"), default=None)
    ap.add_argument("--nome", default="")
    ap.add_argument("--json", action="store_true", help="imprime só o JSON")
    a = ap.parse_args()
    r = validar(a.pasta, a.quem, a.nome)
    if not a.json:
        print(f"[{r['veredito']}] {r['nome']} ({r['quem']}) — {r['frames']} frames")
        for k, v in r["portas"].items():
            print(f"  {'OK ' if v else 'FECH'} {k}")
        for m in r["motivos"]:
            print(f"    - {m}")
        print(f"  continuidade: {r['scores']['continuidade']:.2f}")
    print(json.dumps(r, indent=1, ensure_ascii=False))
    return 0 if r["veredito"] == "ACEITE" else 1


if __name__ == "__main__":
    raise SystemExit(main())
