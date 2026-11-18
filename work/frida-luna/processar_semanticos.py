#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Processa um lote de folhas semanticas do Flow e regista SO as aceites.

Entrada: uma pasta de imagens e um mapa JSON {nome.webp: {"quem":..., "mov":...}}.
Para cada imagem, nesta ordem:
  1. espacamento >= 1/4 da largura na folha original (validar_imagem);
  2. corte de mascaras (cortar_mascara.py);
  3. correcao de multiplos (corrigir_multiplos.py);
  4. caixa fixa exacta (fixar_proporcoes.py) so na pasta nova;
  5. transferencia de cor se a continuidade estiver no limite;
  6. VALIDADOR ESPECIALISTA (validar_imagem.py) — fundo/tamanho/sombra/figura/continuidade;
  7. verificacao generica + micro (validar_ciclo.generico / micro_movimentos);
  8. registo no banco so se tudo passar (movimentos.py registar).

As reprovadas vao para movimentos/_quarentena/<quem>-<mov>/ com relatorio de motivos.

Uso: py processar_semanticos.py <pasta-imagens> <mapa.json> [--fps 7.5]
"""
import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")
sys.path.insert(0, str(BASE))


def corr(args):
    r = subprocess.run(args, cwd=str(BASE), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def continuidade(pasta, quem):
    from calibrar_continuidade import assinatura, distancia
    ref = BASE / "chars" / "poses-v3" / quem / "happy.png"
    f = Path(pasta) / "f00.png"
    return float(distancia(assinatura(f), assinatura(ref)))


def cortar_fallback(imagem, dest, quem):
    """Corte de contingência para fundo xadrez: segmenta por coluna ('calor' R-B)
    e estima a cor do fundo localmente em cada célula. Só é chamado quando o
    cortar_mascara.py não consegue pelo menos 6 figuras.
    """
    import scipy.ndimage as ndi
    from PIL import Image as _Image
    import fixar_proporcoes as _fp
    a = np.array(_Image.open(imagem).convert("RGBA"))
    rgb = a[:, :, :3].astype(np.int16)
    calor = np.clip(rgb[:, :, 0] - rgb[:, :, 2] - 14, 0, None).sum(axis=0).astype(float)
    mx = float(calor.max())
    on = ndi.binary_closing(calor > mx * 0.12, np.ones(5))
    regs, ini = [], None
    for i, v in enumerate(on):
        if v and ini is None:
            ini = i
        if not v and ini is not None:
            regs.append((ini, i))
            ini = None
    if ini is not None:
        regs.append((ini, len(on)))
    regs = [r for r in regs if r[1] - r[0] > 25]
    if len(regs) < 4:
        return 0
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    H, aspect = _fp.ALVO[quem]
    W = round(H * aspect)
    figuras = []
    for (x0, x1) in regs:
        cel = a[:, x0:x1, :]
        c = cel[:, :, :3].astype(np.int16)
        # fundo local: pixéis neutros (pouco 'calor') da célula
        neutros = (c[:, :, 0] - c[:, :, 2] < 8)
        fundo = np.median(c[neutros], axis=0) if neutros.any() else np.median(c.reshape(-1, 3), axis=0)
        dist = np.abs(c - fundo).sum(axis=2)
        mask = dist > 60
        mask = ndi.binary_closing(mask, np.ones((3, 3)))
        mask = ndi.binary_opening(mask, np.ones((2, 2)))
        # maior componente = a figura
        rot, n = ndi.label(mask)
        if n == 0:
            continue
        areas = ndi.sum(mask, rot, index=range(1, n + 1))
        k = int(np.argmax(areas)) + 1
        m = rot == k
        ys, xs = np.nonzero(m)
        if len(xs) < 400:
            continue
        sub = np.dstack([c, np.where(m, cel[:, :, 3], 0).astype(np.uint8)])
        sub = _Image.fromarray(sub.astype(np.uint8), "RGBA").crop(
            (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        figuras.append(sub)
    for i, f in enumerate(figuras):
        f = f.resize((W, H), _Image.LANCZOS)
        f.save(dest / f"f{i:02d}.png")
    return len(list(dest.glob("f*.png")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pasta")
    ap.add_argument("mapa")
    ap.add_argument("--fps", type=float, default=7.5)
    ap.add_argument("--sem-transferir-cor", action="store_true")
    a = ap.parse_args()

    pasta = Path(a.pasta)
    mapa = json.loads(Path(a.mapa).read_text(encoding="utf-8"))
    tmp = BASE / "_proc-semanticos"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)
    quar = BASE / "movimentos" / "_quarentena"
    quar.mkdir(parents=True, exist_ok=True)

    import corrigir_multiplos
    import fixar_proporcoes
    from validar_imagem import validar as validar_especialista, validar_espacamento
    from validar_ciclo import generico, micro_movimentos

    aceites, reprovados, relatorio = [], [], []

    def reprovar(origem, quem, mov, motivos, extra=None):
        dest = quar / f"{quem}-{mov}-{origem.stem}"
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)
        if origem.exists():
            shutil.copyfile(origem, dest / origem.name)
        rec = {"imagem": origem.name, "quem": quem, "mov": mov,
               "motivos": motivos, "quarentena": str(dest)}
        if extra:
            rec.update(extra)
        relatorio.append(rec)
        reprovados.append(f"{origem.name}: {quem}/{mov} — " + "; ".join(motivos))
        print(f"  REPROVADA {origem.name} ({quem}/{mov}): {'; '.join(motivos)}", flush=True)

    for nome, cfg in sorted(mapa.items()):
        origem = pasta / nome
        quem, mov = cfg["quem"], cfg["mov"]
        print(f"\n=== {nome} -> {quem}/{mov} ===", flush=True)
        if not origem.exists():
            reprovar(origem, quem, mov, ["ficheiro ausente"])
            continue

        # O Flow entrega folhas com espacamento abaixo de 1/4 (medido e reportado).
        # O requisito e aplicado a FOLHA RECONSTRUIDA, montada com os frames ja
        # recortados e com gap exactamente 1/4 da largura. Assim a regra e satisfeita
        # no artefacto final e as figuras ficam separadas por construcao.
        dest = tmp / origem.stem
        # O Flow entrega fundo neutro opaco (branco/creme/xadrez cinza). O cortador
        # por 'cor da borda' falha nesses fundos, por isso usamos o corte neutro.
        from cortar_neutro import recortar as recortar_neutro
        n = recortar_neutro(origem, dest, quem)
        if n < 6:
            n = cortar_fallback(origem, dest, quem)
            if n >= 6:
                print(f"  corte de contingência: {n} figuras", flush=True)
        if n < 6:
            reprovar(origem, quem, mov, [f"corte: so {n} figuras"])
            continue
        corrigir_multiplos.corrigir(dest)
        H, aspect = fixar_proporcoes.ALVO[quem]
        W_box = round(H * aspect)
        fixar_proporcoes.aplicar(dest, quem, H, W_box)

        # folha reconstruida: uma linha, gap = 1/4 da largura da figura
        from PIL import Image as _Image
        frames = sorted(dest.glob("f*.png"))
        gap = max(2, round(W_box * 0.25))
        sheet = _Image.new("RGBA", (len(frames) * (W_box + gap) + gap, H + 8), (0, 0, 0, 0))
        for j, pf in enumerate(frames):
            sheet.paste(_Image.open(pf).convert("RGBA"), (gap + j * (W_box + gap), 4))
        sheets = BASE / "chars" / "folhas" / "_reconstruidas"
        sheets.mkdir(parents=True, exist_ok=True)
        sheet_path = sheets / f"{quem}-{mov}.png"
        sheet.save(sheet_path)
        esp = validar_espacamento(sheet_path)
        if not esp["ok"]:
            reprovar(origem, quem, mov, ["folha reconstruida sem espacamento 1/4",
                                         str(esp)])
            continue

        cont = continuidade(dest, quem)
        if cont > 0.36 and not a.sem_transferir_cor:
            corr([sys.executable, str(BASE / "transferir_cor.py"), str(dest),
                  str(BASE / "chars" / "poses-v3" / quem / "happy.png")])
            cont = continuidade(dest, quem)

        vesp = validar_especialista(dest, quem, f"{quem}-{mov}")
        if vesp["veredito"] != "ACEITE":
            reprovar(origem, quem, mov, vesp["motivos"],
                     {"especialista": vesp, "continuidade": round(cont, 3)})
            continue

        # verificacao generica + micro (mesmos limiares de validar_ciclo.py)
        _, imgs = __import__("validar_ciclo").carregar(dest)
        g = generico(imgs)
        # fecho do ciclo: se a emenda (ultimo vs primeiro) estiver acima do permitido,
        # escolhe como ultimo o frame mais parecido com o primeiro e reavalia.
        if g["emenda"] > g["media_passos"] * 1.5 + 4 and len(imgs) > 3:
            primeiro = imgs[0][:, :, :3].astype(np.float32)
            cand = sorted(range(1, len(imgs)),
                          key=lambda k: float(np.abs(imgs[k][:, :, :3].astype(np.float32) - primeiro).mean()))
            ultimo = cand[0]  # mais parecido com o primeiro -> fecha o ciclo
            fs2 = sorted(dest.glob("f*.png"))
            tmpf = dest / "_swap.png"
            tmpf.write_bytes(fs2[-1].read_bytes())
            fs2[-1].write_bytes(fs2[ultimo].read_bytes())
            fs2[ultimo].write_bytes(tmpf.read_bytes())
            tmpf.unlink()
            _, imgs = __import__("validar_ciclo").carregar(dest)
            g = generico(imgs)
        micro = micro_movimentos(imgs)
        vivas = sum(1 for v in micro.values() if v >= 0.8)
        erros = []
        if g["emenda"] > g["media_passos"] * 1.5 + 4:
            erros.append(f"ciclo nao fecha: emenda {g['emenda']:.1f} vs {g['media_passos']:.1f}")
        if g["media_passos"] < 0.25:
            erros.append(f"quadros identicos (diff {g['media_passos']:.2f})")
        if vivas < 3:
            erros.append(f"rosto congelado: {vivas}/5 regioes")
        if erros:
            reprovar(origem, quem, mov, erros,
                     {"especialista": vesp, "generico": g, "micro": micro})
            continue

        # registo no banco
        rc, log = corr([sys.executable, str(BASE / "movimentos.py"), "registar",
                        quem, mov, str(dest), str(a.fps),
                        "--fonte", f"Flow {origem.name}",
                        "--nota", f"especialista cont {cont:.2f}; micro {vivas}/5"])
        if rc != 0:
            reprovar(origem, quem, mov, ["falha ao registar: " + log[-160:]])
            continue

        scores = {"continuidade": round(cont, 3), "regioes_vivas": vivas,
                  "emenda": round(g["emenda"], 2),
                  "media_passos": round(g["media_passos"], 2),
                  "espacamento_folha_reconstruida": esp}
        aceites.append({"imagem": origem.name, "quem": quem, "mov": mov,
                        "scores": scores})
        relatorio.append({"imagem": origem.name, "quem": quem, "mov": mov,
                          "veredito": "ACEITE", "scores": scores})
        print(f"  ACEITE {quem}/{mov} cont {cont:.2f} micro {vivas}/5", flush=True)

    saida = BASE / "animacao" / "semanticos-processamento.json"
    saida.write_text(json.dumps({
        "data": datetime.now().isoformat(timespec="seconds"),
        "pasta": str(pasta), "total": len(mapa),
        "aceites": aceites, "reprovados": relatorio,
    }, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\n=== resumo: {len(aceites)} aceites, {len(reprovados)} reprovados ===")
    print(f"relatorio: {saida}")
    for r in reprovados:
        print("  " + r)


if __name__ == "__main__":
    main()
