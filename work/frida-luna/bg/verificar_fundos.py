#!/usr/bin/env python
# -*- coding: utf-8 -*-
r"""
===============================================================================
 verificar_fundos.py  -  portao de QA do Especialista-ComfyUI
===============================================================================

 MANUAL
 ------
 Confere o que o gerar_fundos.py prometeu: 11 ficheiros, 1344x768, PNG valido,
 manifest coerente (cena, prompt, seed, ficheiro, tamanho) e nenhum 0 byte.
 Nao gera nada, nao chama ComfyUI. Corre em 1 segundo.

 USO
 ---
   py verificar_fundos.py
   py verificar_fundos.py --pasta D:\CRAFT\work\frida-luna\bg

 SAIDA: tabela no stdout; codigo 0 se tudo bater, 1 se faltar alguma coisa.
===============================================================================
"""

import argparse
import json
import os
import struct
import sys

ESPERADAS = [
    "hook", "abertura", "portao", "montanha", "roda", "carrossel",
    "bolinhas", "tunel", "espelhos", "moral", "final",
]
LARGURA, ALTURA = 1344, 768
MINIMO_BYTES = 40 * 1024      # um fundo a serio nunca tem menos que isto


def ler_png(caminho):
    with open(caminho, "rb") as ficheiro:
        cabecalho = ficheiro.read(24)
    if len(cabecalho) < 24 or cabecalho[:8] != b"\x89PNG\r\n\x1a\n":
        return None, None
    return struct.unpack(">II", cabecalho[16:24])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pasta", default=os.path.dirname(os.path.abspath(__file__)))
    argumentos = parser.parse_args()
    pasta = argumentos.pasta

    with open(os.path.join(pasta, "manifest.json"), encoding="utf-8") as ficheiro:
        manifest = json.load(ficheiro)

    problemas = []
    tamanhos = []
    vistos = set()

    print("%-30s %-10s %-10s %9s  %-8s %s"
          % ("ficheiro", "cena", "px", "KB", "seed", "metodo"))
    print("-" * 86)
    for registo in manifest.get("fundos", []):
        cena = registo["scene"]
        vistos.add(cena)
        caminho = os.path.join(pasta, registo["ficheiro"])
        if not os.path.exists(caminho):
            problemas.append("%s: ficheiro ausente (%s)" % (cena, registo["ficheiro"]))
            continue
        bytes_reais = os.path.getsize(caminho)
        largura, altura = ler_png(caminho)
        tamanhos.append(bytes_reais / 1024.0)
        print("%-30s %-10s %-10s %9.1f  %-8s %s"
              % (registo["ficheiro"], cena, "%sx%s" % (largura, altura),
                 bytes_reais / 1024.0, registo["seed"], registo.get("metodo", "?")))
        if (largura, altura) != (LARGURA, ALTURA):
            problemas.append("%s: dimensoes %sx%s, esperado %dx%d"
                             % (cena, largura, altura, LARGURA, ALTURA))
        if bytes_reais < MINIMO_BYTES:
            problemas.append("%s: %d bytes (< %d), PNG suspeito"
                             % (cena, bytes_reais, MINIMO_BYTES))
        if bytes_reais != registo.get("bytes"):
            problemas.append("%s: bytes no manifest (%s) != bytes no disco (%d)"
                             % (cena, registo.get("bytes"), bytes_reais))
        if not registo.get("prompt"):
            problemas.append("%s: manifest sem prompt" % cena)

    for cena in ESPERADAS:
        if cena not in vistos:
            problemas.append("cena em falta no manifest: %s" % cena)

    print("-" * 86)
    if tamanhos:
        print("fundos: %d | media %.1f KB | min %.1f | max %.1f"
              % (len(tamanhos), sum(tamanhos) / len(tamanhos),
                 min(tamanhos), max(tamanhos)))
    print("falhas registadas na geracao: %d" % len(manifest.get("falhas") or []))

    if problemas:
        print("\nPROBLEMAS (%d):" % len(problemas))
        for problema in problemas:
            print(" - %s" % problema)
        return 1
    print("\nok: 11 fundos, %dx%d, manifest coerente" % (LARGURA, ALTURA))
    return 0


if __name__ == "__main__":
    sys.exit(main())
