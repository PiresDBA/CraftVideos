"""Valida um ciclo recortado ANTES de entrar no banco.

Usa os critérios medidos de chars/PROMPTS-MOVIMENTOS.md:
- genérico: nº de frames, altura estável, centro estável, cor estável, ciclo fecha;
- marcha/corrida: as duas pernas têm de trocar de lado (não pode ser coxo);
- escuta: pés praticamente idênticos e cabeça com pouco deslocamento (não pode parecer marcha);
- fala: boca fechada no primeiro e último quadros (para fechar o ciclo).

Uso: py validar_ciclo.py <pasta-frames> <tipo> [--nome nome]
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")
sys.path.insert(0, str(BASE))


def carregar(pasta):
    fs = sorted(Path(pasta).glob("*.png"))
    return fs, [np.array(Image.open(f).convert("RGBA"), dtype=np.float32) for f in fs]


def generico(imgs):
    h = [a.shape[0] for a in imgs]
    centros, cores = [], []
    for a in imgs:
        masc = a[:, :, 3] > 128
        ys, xs = np.nonzero(masc)
        centros.append(float(xs.mean()) if len(xs) else 0.0)
        op = a[masc, :3]
        cores.append(op.mean(axis=0) if len(op) else np.zeros(3))
    cinza = [np.array(Image.fromarray(a.astype(np.uint8)).convert("L"), dtype=np.float32)
             for a in imgs]
    ds = [float(np.abs(cinza[i] - cinza[(i + 1) % len(cinza)]).mean())
          for i in range(len(cinza))]
    return {
        "frames": len(imgs),
        "variacao_altura": max(h) - min(h),
        "deriva_centro": float(max(centros) - min(centros)),
        "deriva_cor": float(max(np.linalg.norm(np.array(cores) - cores[0], axis=1))),
        "emenda": ds[-1],
        "media_passos": float(np.mean(ds[:-1])),
    }


def micro_movimentos(imgs):
    """Mede se há vida no rosto/apêndices, não só respiração/piscar.

    Regiões relativas (fraction da largura/altura). Para cada uma, mede a maior diferença
    média de cor entre quadros consecutivos, contando só pixeis opacos nos dois.
    """
    regioes = {
        "sobrancelha": (0.28, 0.16, 0.72, 0.32),
        "bochecha/orelha": (0.08, 0.20, 0.42, 0.45),
        "focinho": (0.45, 0.22, 0.88, 0.45),
        "coleira/bandana": (0.22, 0.46, 0.80, 0.62),
        "rabinho": (0.02, 0.55, 0.28, 0.88),
    }
    h, w = imgs[0].shape[:2]
    resultado = {}
    for nome, (x0, y0, x1, y1) in regioes.items():
        xa, xb = int(w * x0), int(w * x1)
        ya, yb = int(h * y0), int(h * y1)
        maior = 0.0
        for a, b in zip(imgs, imgs[1:] + imgs[:1]):
            aa, bb = a[ya:yb, xa:xb], b[ya:yb, xa:xb]
            m = (aa[:, :, 3] > 128) & (bb[:, :, 3] > 128)
            if m.sum() < 50:
                continue
            d = float(np.abs(aa[:, :, :3][m] - bb[:, :, :3][m]).mean())
            maior = max(maior, d)
        resultado[nome] = round(maior, 2)
    return resultado


def principais(pasta, tipo):
    erros = []
    if tipo in ("marcha", "corrida"):
        try:
            from analisar_pernas import serie
            s = serie(Path(pasta))
            cl = [r[1] for r in s]
            es = [r[2] for r in s]
            trocas = sum(1 for c, e in zip(cl, es) if e > c)
            if trocas < 2:
                erros.append(f"coxo: as pernas so trocam em {trocas}/{len(s)} quadros")
        except Exception as e:
            erros.append(f"nao foi possivel medir as pernas: {e}")
    if tipo == "escuta":
        # pes: mascaras iguais nos extremos; cabeca: centro do topo com pouco movimento
        imgs = carregar(pasta)[1]
        if len(imgs) >= 2:
            def pe(a):
                return a[int(a.shape[0] * 0.86):, :, 3] > 128
            dif = float(np.mean(np.abs(pe(imgs[0]).astype(float) - pe(imgs[-1]).astype(float))))
            if dif > 0.08:
                erros.append(f"os pes mudam {dif * 100:.1f}% entre o primeiro e ultimo quadro")
            tops = []
            for a in imgs:
                al = a[:int(a.shape[0] * 0.35), :, 3] > 128
                ys, xs = np.nonzero(al)
                tops.append(float(xs.mean()) if len(xs) else 0.0)
            if max(tops) - min(tops) > 6:
                erros.append(f"a cabeca desloca {max(tops)-min(tops):.1f} px (limite 6)")
    if tipo == "fala":
        # boca fechada no primeiro e ultimo quadros: comparar regiao inferior da cabeca
        # com a media dos quadros do meio (a boca mais aberta deve estar no meio)
        imgs = carregar(pasta)[1]
        if len(imgs) >= 4:
            h, w = imgs[0].shape[:2]
            regioes = []
            for a in imgs:
                al = a[int(h * 0.14):int(h * 0.34), int(w * 0.42):int(w * 0.85), 3] > 128
                regioes.append(float(al.mean()))
            if abs(regioes[0] - regioes[-1]) > 0.06:
                erros.append("a boca nao fecha igual no inicio e no fim do ciclo")
    return erros


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pasta")
    ap.add_argument("tipo", choices=["marcha", "corrida", "escuta", "fala", "giro",
                                     "sentar", "olhar", "abracar"])
    ap.add_argument("--nome", default="")
    a = ap.parse_args()

    fs, imgs = carregar(a.pasta)
    if len(imgs) < 6:
        print(f"REJEITADA: so {len(imgs)} quadros (minimo 6)")
        return 1
    g = generico(imgs)
    erros = []
    if g["variacao_altura"] > 6:
        erros.append(f"altura varia {g['variacao_altura']} px (limite 6)")
    if g["deriva_centro"] > 10:
        erros.append(f"corpo deriva {g['deriva_centro']:.1f} px (limite 10)")
    if g["deriva_cor"] > 14:
        erros.append(f"cor deriva {g['deriva_cor']:.1f} (limite 14)")
    if g["emenda"] > g["media_passos"] * 1.5 + 4:
        erros.append(f"ciclo nao fecha: emenda {g['emenda']:.1f} vs media {g['media_passos']:.1f}")
    erros += principais(a.pasta, a.tipo)

    micro = micro_movimentos(imgs)
    regioes_vivas = sum(1 for v in micro.values() if v >= 0.8)
    if regioes_vivas < 2:
        erros.append(f"rosto congelado: so {regioes_vivas}/5 regioes micro-moveem {micro}")
    if g["media_passos"] < 0.25:
        erros.append(f"quadros identicos: diferenca media {g['media_passos']:.2f}")

    print(json.dumps({"nome": a.nome or a.pasta, "tipo": a.tipo, **g,
                      "micro": micro, "regioes_vivas": regioes_vivas,
                      "erros": erros, "veredito": "ACEITE" if not erros else "REJEITADA"},
                     indent=1, ensure_ascii=False))
    return 1 if erros else 0


if __name__ == "__main__":
    raise SystemExit(main())
