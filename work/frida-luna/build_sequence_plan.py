"""
Construtor do plano de <Sequence> para "O Parque dos Pets" (Frida & Luna).

Uso:
    py build_sequence_plan.py            # escreve sequence-plan.json
    py build_sequence_plan.py --check    # só valida a soma, não escreve

Regra dura: `from` e `durationInFrames` NUNCA são escritos à mão. Tudo é
derivado de beats.json:

    frame(t)  = round(t * 30)
    from(k)   = frame(t0 da primeira frase da cena k)
    dur(k)    = from(k+1) - from(k)          (última cena: TOTAL - from)
    from(1)   = 0                            (o pré-roll 0-3,86 s pertence ao hook)

Assim os 11 blocos são contíguos e a soma fecha exactamente em 5 882 frames,
sem sobreposição de <Sequence>. As transições são efeitos *dentro* da duração
de cada sequência (5 frames no fim da anterior + 5 no início da seguinte),
por isso não roubam frames nem desalinham o áudio.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).parent
BEATS = RAIZ / "beats.json"
PLANO = RAIZ / "sequence-plan.json"

FPS = 30
# round(196.069297 * 30) = 5882.08 -> 5882
TOTAL_FRAMES_ESPERADO = 5882

# Ordem canónica das camadas. Nunca é violada: fundo -> parallax ->
# personagens -> tipografia -> grão/vinheta. Ver STYLE-BIBLE.md §5.
CAMADAS_POR_CENA = {
    "hook": [
        "fundo-papel-creme",
        "parallax-montanha-russa-de-osso",
        "parallax-roda-gigante-de-petiscos",
        "particulas-de-papel",
        "personagem-frida",
        "personagem-luna",
        "tipografia-de-cartao",
        "grao-e-vinheta",
    ],
    "abertura": [
        "ceu-claro-e-nuvens",
        "parallax-entrada-do-parque",
        "parallax-arvores-de-meio-termo",
        "chao-e-relva",
        "personagem-frida",
        "personagem-luna",
        "tipografia-e-legenda",
        "grao-e-vinheta",
    ],
    "portao": [
        "ceu-de-manha",
        "parallax-arvores-de-meio-termo",
        "portao-de-madeira",
        "letreiro-parque-dos-petes",
        "chao-e-caminho-de-terra",
        "personagem-frida",
        "personagem-luna",
        "brilhos-de-sonho",
        "tipografia-e-legenda",
        "grao-e-vinheta",
    ],
    "montanha": [
        "ceu-e-nuvens",
        "parallax-montanha-russa-de-biscoitos",
        "parallax-carrinho-de-osso",
        "linhas-de-velocidade",
        "chao-e-relva",
        "personagem-frida",
        "personagem-luna",
        "tipografia-e-legenda",
        "grao-e-vinheta",
    ],
    "roda": [
        "ceu-de-tarde",
        "parallax-roda-gigante-de-tigelas",
        "chao-e-relva",
        "personagem-frida",
        "personagem-luna",
        "tipografia-e-legenda",
        "grao-e-vinheta",
    ],
    "carrossel": [
        "ceu-de-tarde-quente",
        "parallax-carrossel-de-pelucias",
        "luzes-do-carrossel",
        "chao-e-relva",
        "personagem-frida",
        "personagem-luna",
        "tipografia-e-legenda",
        "grao-e-vinheta",
    ],
    "bolinhas": [
        "fundo-piscina-de-bolinhas",
        "parallax-bolinhas-de-tenis",
        "personagem-frida",
        "personagem-luna",
        "bolinhas-em-voo",
        "tipografia-e-legenda",
        "grao-e-vinheta",
    ],
    "tunel": [
        "fundo-tunel-de-grama",
        "parallax-arcos-de-grama",
        "luzinhas-do-tunel",
        "personagem-frida",
        "personagem-luna",
        "tipografia-e-legenda",
        "grao-e-vinheta",
    ],
    "espelhos": [
        "fundo-casa-dos-espelhos",
        "parallax-espelhos-deformantes",
        "reflexo-deformado-da-frida",
        "personagem-frida",
        "personagem-luna",
        "tipografia-e-legenda",
        "grao-e-vinheta",
    ],
    "moral": [
        "ceu-de-por-do-sol",
        "silhuetas-do-parque",
        "chao-e-relva",
        "personagem-frida",
        "personagem-luna",
        "coracoes-a-subir",
        "tipografia-e-legenda",
        "grao-e-vinheta",
    ],
    "final": [
        "fundo-papel-creme",
        "coracoes-a-subir",
        "personagem-frida",
        "personagem-luna",
        "botoes-like-e-inscrever",
        "tipografia-de-cartao",
        "grao-e-vinheta",
    ],
}

# Tipo de entrada de cada cena. As durações vivem no efeito, não na timeline.
TRANSICAO_ENTRADA = {
    "hook": "abertura-desde-papel",
    "abertura": "ponte-de-papel",
    "portao": "arrasto-lateral",
    "montanha": "arrasto-lateral",
    "roda": "ponte-de-papel",
    "carrossel": "arrasto-lateral",
    "bolinhas": "corte-seco",
    "tunel": "arrasto-lateral",
    "espelhos": "ponte-de-papel",
    "moral": "escurecer-para-creme",
    "final": "ponte-de-papel",
}

# Temperatura de luz por cena: multiplicação sobre o FUNDO, nunca sobre as
# personagens. Mantém a paleta de 6 cores e distingue 11 cenas por valor,
# não por matiz (ver STYLE-BIBLE.md §2.3).
TEMPERATURA = {
    "hook": {"cor": "#FFF1DC", "opacidade": 0.08, "nota": "manha de papel"},
    "abertura": {"cor": "#FFF6E6", "opacidade": 0.06, "nota": "manha clara"},
    "portao": {"cor": "#FCEFD8", "opacidade": 0.08, "nota": "manha tardia"},
    "montanha": {"cor": "#FFF3DE", "opacidade": 0.04, "nota": "meio-dia alto"},
    "roda": {"cor": "#FFE3B8", "opacidade": 0.12, "nota": "tarde dourada"},
    "carrossel": {"cor": "#FFCF9E", "opacidade": 0.16, "nota": "fim de tarde quente"},
    "bolinhas": {"cor": "#FFF0C8", "opacidade": 0.08, "nota": "amarelo reflectido"},
    "tunel": {"cor": "#D9C79E", "opacidade": 0.18, "nota": "sombra de relva"},
    "espelhos": {"cor": "#C9BBA6", "opacidade": 0.22, "nota": "interior neutro"},
    "moral": {"cor": "#FFB877", "opacidade": 0.26, "nota": "por-do-sol"},
    "final": {"cor": "#F7DCC0", "opacidade": 0.14, "nota": "cartao final ambar"},
}


def carregar_beats() -> dict:
    """Lê beats.json e devolve o documento completo."""
    with BEATS.open(encoding="utf-8") as ficheiro:
        return json.load(ficheiro)


def frame_de(segundos: float) -> int:
    """Converte segundos em número de frame a 30 fps."""
    return round(segundos * FPS)


def agrupar_cenas(beats: list[dict]) -> list[dict]:
    """Agrupa as frases por cena, preservando a ordem de aparição no vídeo."""
    ordem: list[str] = []
    grupos: dict[str, list[dict]] = {}
    for beat in beats:
        nome = beat["scene"]
        if nome not in grupos:
            grupos[nome] = []
            ordem.append(nome)
        grupos[nome].append(beat)
    return [{"scene": nome, "beats": grupos[nome]} for nome in ordem]


def construir_plano(documento: dict) -> list[dict]:
    """Gera a lista de sequências com from/durationInFrames derivados."""
    total = frame_de(documento["duration"])
    cenas = agrupar_cenas(documento["beats"])

    inicios = [frame_de(cena["beats"][0]["t0"]) for cena in cenas]
    inicios[0] = 0  # o pré-roll (0 -> 3,86 s) pertence ao hook

    plano = []
    for indice, cena in enumerate(cenas):
        nome = cena["scene"]
        inicio = inicios[indice]
        fim = inicios[indice + 1] if indice + 1 < len(inicios) else total
        plano.append(
            {
                "scene": nome,
                "from": inicio,
                "durationInFrames": fim - inicio,
                "layers": CAMADAS_POR_CENA[nome],
                "transition_in": TRANSICAO_ENTRADA[nome],
                # --- campos de apoio (não alteram a timeline) ---
                "index": indice + 1,
                "beats": [beat["i"] for beat in cena["beats"]],
                "seconds": round((fim - inicio) / FPS, 3),
                "bg": cena["beats"][0]["bg"],
                "camera": cena["beats"][0]["cam"],
                "temperatura": TEMPERATURA[nome],
            }
        )
    return plano


def validar(plano: list[dict], total: int) -> list[str]:
    """Confere contiguidade, soma e a ordem canónica das camadas."""
    erros = []
    soma = sum(item["durationInFrames"] for item in plano)
    if soma != total:
        erros.append(f"soma {soma} != total {total}")
    if len(plano) != 11:
        erros.append(f"{len(plano)} cenas, esperadas 11")

    esperado = 0
    for item in plano:
        if item["from"] != esperado:
            erros.append(f"{item['scene']}: from {item['from']} != {esperado}")
        esperado += item["durationInFrames"]

    # fundo -> parallax -> personagens -> tipografia -> grao
    marcas = {"personagem": 2, "tipografia": 3, "grao": 4}
    for item in plano:
        anterior = -1
        for camada in item["layers"]:
            for chave, ordem in marcas.items():
                if camada.startswith(chave):
                    if ordem < anterior:
                        erros.append(f"{item['scene']}: camada fora de ordem: {camada}")
                    anterior = ordem
        ultima = item["layers"][-1]
        if ultima != "grao-e-vinheta":
            erros.append(f"{item['scene']}: última camada é {ultima}")
    return erros


def main() -> int:
    documento = carregar_beats()
    total = frame_de(documento["duration"])
    plano = construir_plano(documento)
    erros = validar(plano, total)

    if erros:
        for erro in erros:
            print("FALHA:", erro)
        return 1

    if "--check" in sys.argv:
        print(f"ok: {len(plano)} cenas, {total} frames")
        return 0

    with PLANO.open("w", encoding="utf-8") as ficheiro:
        json.dump(plano, ficheiro, ensure_ascii=False, indent=2)
        ficheiro.write("\n")

    print(f"escrito {PLANO.name}: {len(plano)} cenas, soma {total} frames")
    for item in plano:
        print(
            f"  {item['index']:2d} {item['scene']:<10} "
            f"from {item['from']:>5} dur {item['durationInFrames']:>5} "
            f"({item['seconds']:>6.2f}s) {item['transition_in']}"
        )
    if total != TOTAL_FRAMES_ESPERADO:
        print(f"AVISO: total {total} != {TOTAL_FRAMES_ESPERADO}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
