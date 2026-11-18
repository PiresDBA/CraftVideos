"""Testa várias tiras baixadas contra um tipo de ciclo, sem registar nada.

Uso: py testar_novos.py flow-00:escuta flow-04:escuta frida-fala:flow-02:fala
"""
import json
import subprocess
import sys
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")


def testar(ficheiro, tipo):
    nome = Path(ficheiro).stem + "-" + tipo
    origem = BASE / "chars" / "folhas" / "_novos" / ficheiro
    destino = BASE / "_testar" / nome
    cr = subprocess.run([sys.executable, str(BASE / "cortar_mascara.py"), str(origem), str(destino)],
                        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if not (destino / "f00.png").exists():
        return {"veredito": "ERRO", "erros": [f"CORTE {origem}: " + (cr.stdout + cr.stderr)[-200:]]}
    r = subprocess.run([sys.executable, str(BASE / "validar_ciclo.py"), str(destino), tipo,
                        "--nome", nome], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    try:
        return json.loads(r.stdout[r.stdout.index("{"):r.stdout.rindex("}") + 1])
    except Exception:
        return {"veredito": "ERRO", "erros": [r.stdout[-100:] + r.stderr[-100:]]}


def main():
    for arg in sys.argv[1:]:
        ficheiro, tipo = arg.split(":")
        if not Path(ficheiro).suffix:
            ficheiro += ".webp"
        v = testar(ficheiro, tipo)
        extra = ""
        if v.get("veredito") == "ACEITE":
            extra = (f" emenda={v['emenda']:.1f}/{v['media_passos']:.1f} "
                     f"micro={v.get('regioes_vivas')} centro={v['deriva_centro']:.1f}")
        print(f"{ficheiro:12} {tipo:10} {v['veredito']:9}{extra} "
              f"{str(v.get('erros',''))[:110]}")


if __name__ == "__main__":
    main()
