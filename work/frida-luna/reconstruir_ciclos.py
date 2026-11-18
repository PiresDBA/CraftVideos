"""Reconstrói os ciclos activos a partir das imagens originais, com segurança.

Motivo: o filtro de sombra por faixa (remover_sombra.py) apagava pixeis do contorno
na zona dos pés, deixando buracos transparentes. Aqui usamos apenas o corte por
COMPONENTE (que descarta a oval sombra sem tocar na personagem), caixa fixa e, se
necessário, transferência de cor para bater com a referência aprovada.

Uso: py reconstruir_ciclos.py
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")
MAPA = BASE / "chars" / "folhas" / "_mapa-novos.json"
ALVO = {"frida": (231, 0.75), "luna": (265, 0.63)}


def corr(args):
    r = subprocess.run(args, cwd=str(BASE), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.stdout + r.stderr


def caixa(im):
    a = np.array(im.convert("RGBA"))
    m = a[:, :, 3] > 60
    ys, xs = np.nonzero(m)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else None


def caixa_fixa(pasta, quem):
    H, asp = ALVO[quem]
    W = round(H * asp)
    for f in sorted(pasta.glob("*.png")):
        im = Image.open(f).convert("RGBA")
        bb = caixa(im)
        if bb is None:
            continue
        fig = im.crop(bb).resize((W, H), Image.LANCZOS)
        c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        c.paste(fig, (0, 0), fig)
        c.save(f)


def continuidade(pasta, quem):
    try:
        from calibrar_continuidade import assinatura, distancia
        ref = BASE / "chars" / "poses-v3" / quem / "happy.png"
        return float(distancia(assinatura(pasta / "f00.png"), assinatura(ref)))
    except Exception:
        return 99.0


def main():
    mapa = json.loads(MAPA.read_text(encoding="utf-8"))
    for nome, cfg in mapa.items():
        quem = nome.split("-")[0]
        mov = cfg["tipo"]
        origem = Path(cfg["ficheiro"])
        if not origem.exists():
            print(f"FALTA {origem}")
            continue
        tmp = BASE / "_reconstruir" / nome
        if tmp.exists():
            shutil.rmtree(tmp)
        print(f"\n=== {nome} <- {origem.name} ===")
        print(corr([sys.executable, str(BASE / "cortar_mascara.py"), str(origem),
                    str(tmp)]).strip().splitlines()[-1])
        caixa_fixa(tmp, quem)
        d = continuidade(tmp, quem)
        if d > 0.45:
            print(f"  cor distante ({d:.2f}) — transferindo da referência")
            corr([sys.executable, str(BASE / "transferir_cor.py"), str(tmp),
                  str(BASE / "chars" / "poses-v3" / quem / "happy.png")])
            d = continuidade(tmp, quem)
        print(f"  continuidade {d:.2f}")
        for destino in (BASE / "movimentos" / quem / mov, BASE / "_novos" / nome):
            if destino.exists():
                shutil.rmtree(destino)
            destino.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(tmp, destino)
    print("\nreconstrução concluída")


if __name__ == "__main__":
    main()
