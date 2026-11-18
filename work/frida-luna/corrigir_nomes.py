"""Corrige nomes de ciclos registados com prefixo da personagem.

luna/luna-escuta -> luna/escuta (o timeline procura o nome curto).
"""
import json
import shutil
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")
man = json.loads((BASE / "movimentos" / "manifest.json").read_text(encoding="utf-8"))
for quem in ("luna", "frida"):
    movs = man["personagens"].get(quem, {})
    for velho in list(movs):
        if velho.startswith(quem + "-"):
            novo = velho[len(quem) + 1:]
            print(quem, velho, "->", novo)
            movs[novo] = movs.pop(velho)
            orig = BASE / "movimentos" / quem / velho
            dest = BASE / "movimentos" / quem / novo
            if orig.exists() and not dest.exists():
                shutil.move(str(orig), str(dest))
                movs[novo]["pasta"] = str(dest)
                movs[novo]["ficheiros"] = [f for f in movs[novo]["ficheiros"]]
(BASE / "movimentos" / "manifest.json").write_text(
    json.dumps(man, indent=1, ensure_ascii=False), encoding="utf-8")
print("manifest corrigido")
