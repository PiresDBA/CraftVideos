"""Coloca em quarentena todos os ciclos que quebram a continuidade das personagens.

Fonte canónica = as 8 expressões aprovadas em chars/poses-v3/<quem>/*.png.
Qualquer ciclo gerado no Flow desenha uma personagem diferente, por isso nao pode entrar
no episodio. Os ficheiros NAO sao apagados: vao para movimentos/_quarentena/ com um
relatorio, para podermos comparar e reutilizar se um dia forem redesenhandos.

Uso: py quarentena_ciclos.py
"""
import json
import shutil
from datetime import datetime
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")
MAN = BASE / "movimentos" / "manifest.json"
QUAR = BASE / "movimentos" / "_quarentena"


def main():
    man = json.loads(MAN.read_text(encoding="utf-8"))
    audit = json.loads((BASE / "animacao" / "auditoria-continuidade.json").read_text(encoding="utf-8"))
    motivos = {r["nome"]: r for r in audit}
    QUAR.mkdir(parents=True, exist_ok=True)
    movidos = []
    for quem in ("frida", "luna"):
        movs = man["personagens"].get(quem, {})
        for nome in list(movs):
            chave = f"{quem}/{nome}"
            info = motivos.get(chave, {})
            # so sobrevivem ciclos expressamente aprovados depois da auditoria
            if movs[nome].get("continuidade_aprovada"):
                continue
            origem = BASE / "movimentos" / quem / nome
            destino = QUAR / quem / nome
            if origem.exists():
                destino.parent.mkdir(parents=True, exist_ok=True)
                if destino.exists():
                    shutil.rmtree(destino)
                shutil.move(str(origem), str(destino))
            movidos.append({"ciclo": chave, "motivo": "desenho diferente do aprovado",
                            "score": info.get("score"), "para": str(destino)})
            del movs[nome]
    MAN.write_text(json.dumps(man, indent=1, ensure_ascii=False), encoding="utf-8")
    rel = {"data": datetime.now().isoformat(timespec="seconds"),
           "fonte_canonica": "chars/poses-v3/{frida,luna}/*.png",
           "movidos": movidos}
    (QUAR / "relatorio.json").write_text(json.dumps(rel, indent=1, ensure_ascii=False),
                                         encoding="utf-8")
    print(f"{len(movidos)} ciclos em quarentena")
    for m in movidos:
        print("  " + m["ciclo"] + " (score " + str(m["score"]) + ")")
    print("relatorio:", QUAR / "relatorio.json")


if __name__ == "__main__":
    main()
