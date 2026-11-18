"""Identifica automaticamente que movimento há em cada folha de um lote.

Para cada imagem descarregada e cada movimento esperado da personagem:
1. corta;
2. exige continuidade <= 0,45 (é a personagem aprovada);
3. valida o tipo de movimento (marcha troca pernas, escuta não anda, etc.);
4. pontua: 1 se passou + bónus por regiões micro vivas e por fecho do ciclo.

Depois faz um emparelhamento greedy (cada folha só a um movimento) e escreve
chars/folhas/_mapa-novos.json para o registar_novos.py usar.

Uso: py identificar_lote.py frida | luna
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")


def corr(args):
    r = subprocess.run(args, cwd=str(BASE), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def continuidade(pasta, quem):
    try:
        from calibrar_continuidade import assinatura, distancia
        ref = BASE / "chars" / "poses-v3" / quem / "happy.png"
        f = Path(pasta) / "f00.png"
        if not f.exists():
            return 99.0
        return distancia(assinatura(f), assinatura(ref))
    except Exception:
        return 99.0


def main():
    quem = sys.argv[1].lower()
    pasta_lote = BASE / "chars" / "folhas" / f"_lote-{quem}"
    imagens = sorted(pasta_lote.glob("*.webp"))
    if not imagens:
        raise SystemExit(f"sem imagens em {pasta_lote}")

    fal = BASE / "animacao" / "faltam.json"
    d = json.loads(fal.read_text(encoding="utf-8"))
    movs = list(d.get(quem, {}).keys())
    if not movs:
        raise SystemExit("sem movimentos em falta")

    candidatos = []
    tmp = BASE / "_identificar" / quem
    for im in imagens:
        for mov in movs:
            dest = tmp / (im.stem + "-" + mov)
            corr([sys.executable, str(BASE / "cortar_mascara.py"), str(im), str(dest)])
            cont = continuidade(dest, quem)
            if cont > 0.45:
                continue
            rc, log = corr([sys.executable, str(BASE / "validar_ciclo.py"), str(dest),
                            mov, "--quem", quem, "--nome", f"{quem}-{mov}"])
            try:
                v = json.loads(log[log.index("{"):log.rindex("}") + 1])
            except Exception:
                continue
            if v.get("veredito") != "ACEITE":
                continue
            pontos = 1.0 + 0.1 * v.get("regioes_vivas", 0)
            if v.get("emenda", 99) <= v.get("media_passos", 0):
                pontos += 0.3
            candidatos.append({"imagem": im, "mov": mov, "cont": cont,
                               "pontos": round(pontos, 2), "pasta": dest,
                               "validacao": v})
        print(f"  {im.name}: {len([c for c in candidatos if c['imagem'] == im])} opcoes",
              flush=True)

    candidatos.sort(key=lambda c: c["pontos"], reverse=True)
    usados_im, usados_mov, escolhidos = set(), set(), []
    for c in candidatos:
        if c["imagem"] in usados_im or c["mov"] in usados_mov:
            continue
        usados_im.add(c["imagem"])
        usados_mov.add(c["mov"])
        escolhidos.append(c)

    mapa = {}
    for c in escolhidos:
        nome = f"{quem}-{c['mov']}"
        pasta_final = BASE / "_novos" / nome
        if pasta_final.exists():
            shutil.rmtree(pasta_final)
        shutil.copytree(c["pasta"], pasta_final)
        mapa[nome] = {"ficheiro": c["imagem"].name,
                      "pasta_lote": f"_lote-{quem}",
                      "tipo": c["mov"], "fps": 7.5,
                      "continuidade": c["cont"], "pontos": c["pontos"]}
        print(f"  ESCOLHIDO {nome} <- {c['imagem'].name} "
              f"(cont {c['cont']:.2f}, pontos {c['pontos']})")

    # junta ao mapa existente
    destino = BASE / "chars" / "folhas" / "_mapa-novos.json"
    atual = json.loads(destino.read_text(encoding="utf-8")) if destino.exists() else {}
    for nome, cfg in mapa.items():
        cfg["ficheiro"] = f"_lote-{quem}/" + cfg["ficheiro"]
    atual.update(mapa)
    destino.write_text(json.dumps(atual, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\n{len(escolhidos)} movimentos mapeados em {destino}")
    faltam = [m for m in movs if m not in usados_mov]
    print("sem folha aceite:", ", ".join(faltam) or "nenhum")


if __name__ == "__main__":
    main()
