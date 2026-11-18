"""Recebe uma tira de marcha nova, valida e so anima se as duas pernas andarem.

Substitui o passo manual "cortar, olhar, registar, renderizar". A validacao e medida:
por quadro, mede o centro da perna clara (frente) e da escura (tras) relativo ao corpo.
Uma tira so e aceite se, em algum momento, a ordem das pernas TROCAR — ou seja, se a perna
escura chegar a estar mais a frente que a clara. Sem essa troca a animacao e coxa
(uma perna salta, a outra fica atras) e nao vale a pena renderizar.

Uso:
  py animar_tira.py <imagem-da-tira> <nome-do-movimento> [--fps 10] [--altura 700]
                    [--segundos 4] [--x0 -60] [--bg caminho.png] [--so-validar]
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")
sys.path.insert(0, str(BASE))
from analisar_pernas import serie  # noqa: E402


def cortar(tira: Path, destino: Path, area_min=2500):
    if destino.exists():
        shutil.rmtree(destino)
    r = subprocess.run([sys.executable, str(BASE / "cortar_mascara.py"), str(tira),
                        str(destino), "--area-min", str(area_min)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return sorted(destino.glob("*.png")), (r.stdout + r.stderr)


def validar(pasta: Path):
    s = serie(pasta)
    if len(s) < 6:
        return None, "menos de 6 figuras com pernas identificaveis"
    h = s[0][3]
    cl = np.array([r[1] for r in s])
    es = np.array([r[2] for r in s])
    troca = int(np.sum(es > cl))          # quadros em que a perna escura esta a frente
    amp_c = float(cl.max() - cl.min())
    amp_e = float(es.max() - es.min())
    info = {
        "n": len(s), "h": h, "troca": troca,
        "amp_clara": round(amp_c, 1), "amp_escura": round(amp_e, 1),
        "clara": [round(float(v), 1) for v in cl],
        "escura": [round(float(v), 1) for v in es],
    }
    # criterio: as pernas tem de trocar de lado em pelo menos 2 quadros,
    # e ambas tem de se mexer pelo menos 6% da altura
    if troca < 2:
        return info, "coxo: a perna de tras nunca passa a frente"
    if min(amp_c, amp_e) < 0.06 * h:
        return info, "amplitude insuficiente: uma das pernas quase nao se move"
    return info, None


def main():
    tira = Path(sys.argv[1])
    nome = sys.argv[2]
    fps = sys.argv[sys.argv.index("--fps") + 1] if "--fps" in sys.argv else "10"
    altura = sys.argv[sys.argv.index("--altura") + 1] if "--altura" in sys.argv else "700"
    segundos = sys.argv[sys.argv.index("--segundos") + 1] if "--segundos" in sys.argv else "4"
    x0 = sys.argv[sys.argv.index("--x0") + 1] if "--x0" in sys.argv else "-60"
    bg = sys.argv[sys.argv.index("--bg") + 1] if "--bg" in sys.argv else None
    so_validar = "--so-validar" in sys.argv

    pasta = BASE / "_pes" / nome
    frames, log = cortar(tira, pasta)
    print(log.strip().splitlines()[-1] if log.strip() else "")
    if len(frames) < 6:
        print(f"REJEITADA: so {len(frames)} figuras")
        return 1

    info, erro = validar(pasta)
    if info:
        print(f"perna clara : {info['clara']}")
        print(f"perna escura: {info['escura']}")
        print(f"troca de lado em {info['troca']}/{info['n']} quadros | "
              f"amplitude {info['amp_clara']} / {info['amp_escura']} px (h={info['h']})")
    if erro:
        print(f"REJEITADA: {erro}")
        return 1
    print("ACEITE: as duas pernas andam")

    destino = BASE / "_validado" / nome
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "_validacao.json").write_text(
        json.dumps({"tira": str(tira), "nome": nome, "fps": float(fps), **info},
                   indent=1, ensure_ascii=False), encoding="utf-8")
    if so_validar:
        return 0

    subprocess.run([sys.executable, str(BASE / "movimentos.py"), "registar", "frida", nome,
                    str(pasta), fps, "--fonte", f"Flow {tira.name}",
                    "--nota", "validado: as duas pernas alternam"], check=True)
    saida = BASE / "card" / f"{nome}-{segundos}s.mp4"
    cmd = [sys.executable, str(BASE / "movimentos.py"), "render", "frida", nome,
           segundos, str(saida), "--altura", altura, "--x0", x0]
    if bg:
        cmd += ["--bg", bg]
    subprocess.run(cmd, check=True)
    print(f"pronto: {saida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
