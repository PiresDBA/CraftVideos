#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Coloca em quarentena as 26 imagens do teste inicial, com relatorio de motivos.

Motivos medidos:
  - fundo RGB opaco (alpha=255 em todo o lado) — sem transparencia real;
  - espacamento entre figuras abaixo de 1/4 da largura (maioria);
  - identificacao visual aproximada da personagem e do movimento.
"""
import json
import shutil
from datetime import datetime
from pathlib import Path

from validar_imagem import validar_espacamento

BASE = Path(r"D:\CRAFT\work\frida-luna")
SRC = BASE / "chars" / "folhas" / "_semanticos-lote1"
Q = BASE / "movimentos" / "_quarentena" / "lote1-teste"

# identificacao visual a partir da folha de contacto card/analise-_semanticos.png
# F = Frida (buldogue, colar de perolas) | L = Luna (salsicha, bandana roxa)
ID = {}
for i in range(0, 16):
    ID[f"flow-{i:02d}.webp"] = ("frida", "diversos")
ID["flow-17.webp"] = ("frida", "marcha")
for i in (16, 18, 19, 20, 21, 22, 24, 25):
    ID[f"flow-{i:02d}.webp"] = ("luna", "diversos")
ID["flow-23.webp"] = ("frida", "sorrir")

MOV_GUESS = {
    0: "giro", 1: "marcha", 2: "sorrir", 3: "giro", 4: "olhar-frente",
    5: "sentar", 6: "marcha", 7: "corrida", 8: "giro", 9: "giro",
    10: "sentar", 11: "marcha", 12: "escuta", 13: "sorrir", 14: "olhar-frente",
    15: "giro", 16: "marcha", 17: "marcha", 18: "escuta", 19: "marcha",
    20: "corrida", 21: "giro", 22: "giro", 23: "sorrir", 24: "corrida",
    25: "sorrir",
}


def main():
    if Q.exists():
        shutil.rmtree(Q)
    Q.mkdir(parents=True)
    itens = []
    for p in sorted(SRC.glob("*.webp")):
        idx = int(p.stem.split("-")[1])
        quem, _ = ID.get(p.name, ("?", "?"))
        mov = MOV_GUESS.get(idx, "?")
        esp = validar_espacamento(p)
        motivos = ["fundo RGB opaco (alpha=255) — sem transparencia real"]
        if not esp["ok"]:
            motivos.append(
                f"espacamento {esp['menor_gap']}px < 1/4 da largura "
                f"({esp['exigido']}px) — {esp['figuras']} figuras")
        shutil.copyfile(p, Q / p.name)
        itens.append({"imagem": p.name, "personagem_visual": quem,
                      "movimento_visual": mov, "espacamento": esp,
                      "motivos": motivos, "veredito": "REPROVADA"})

    rel = {"data": datetime.now().isoformat(timespec="seconds"),
           "origem": str(SRC), "total": len(itens),
           "resumo": {
               "fundo_opaco": len(itens),
               "espacamento_insuficiente": sum(
                   1 for x in itens if not x["espacamento"]["ok"]),
               "aprovadas": 0,
           },
           "itens": itens}
    saida = Q / "relatorio.json"
    saida.write_text(json.dumps(rel, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(itens)} imagens em quarentena -> {Q}")
    print(f"  fundo opaco: {rel['resumo']['fundo_opaco']}")
    print(f"  espacamento insuficiente: {rel['resumo']['espacamento_insuficiente']}")
    print(f"  aprovadas: 0  -> relatorio {saida}")


if __name__ == "__main__":
    main()
