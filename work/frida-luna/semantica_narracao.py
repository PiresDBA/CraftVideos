"""Lê a narração beat a beat e decide o movimento que faz sentido para cada fala.

Esta é a camada que faltava: ligar TEXTO -> ACÇÃO -> MOVIMENTO -> CENA.
Regras em português, auditáveis e editáveis. Não usa IA em runtime.

Escreve animacao/movimentos-por-fala.json com, para cada beat:
  texto, falante, acao detectada, emoção, movimento nomeado, descrição do gesto,
  e se o movimento existe no banco.

Uso: py semantica_narracao.py
"""
import json
import re
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")

# (movimento, padrões no texto, descrição do gesto para o prompt do Flow)
REGRAS = [
    ("acenar", r"bem-vind|oi[,!.]|ol[áa]|tchau|acen|sauda|apresent",
     "levanta uma pata e acena para a câmara, com um sorriso"),
    ("sorrir", r"sorr|feliz|alegre|content|riso|gargalh",
     "sorriso amplo, olhos a brilhar, bochechas a subir"),
    ("olhar-frente", r"olha|olhar|repara|observa|vê |vira.?se|para a frente",
     "vira a cabeça para a frente e olha com curiosidade"),
    ("surpreso", r"uau|nossa|surpres|impression|caramba|meu deus|ay|wow",
     "sobrancelhas sobem, olhos abrem, corpo recua um pouco"),
    ("marcha", r"anda|caminha|vamos|vem|chega|entra|segue|passei|a caminho",
     "caminha para a frente com passos alternados"),
    ("corrida", r"corre|dispara|depressa|rápido|veloz",
     "corre com pernas alternadas e braços em oposição"),
    ("salto", r"salta|pula|pulo|pulih|saltit|pulinh",
     "salta com as duas patas juntas, aterragem suave"),
    ("giro", r"gira|rodopia|volta|rodeia",
     "roda sobre si própria um quarto de volta e volta ao início"),
    ("sentar", r"senta|sentad|deita|deit|dorme|sono",
     "senta-se devagar e depois levanta-se, ciclo fechado"),
    ("abracar", r"abra[çs]|abraco|vem c[áa]|juntos|amigos|abraços",
     "abre os braços e inclina-se para a outra personagem"),
    ("comer", r"\bcome|morde|lambe|biscoit|comida|mastiga|babando",
     "inclina o focinho e dá pequenos movimentos de mastigar"),
    ("espantar-medo", r"medo|assust|susto|trem|esconde|foge",
     "recua, orelhas baixas, olhos arregalados"),
    ("falar", r"disse|fala|pergunta|responde|conta|explica|pergunto|lati|latido|latejou|latindo",
     "boca abre e fecha em sílabas curtas, sobrancelhas acompanham"),
]
EMOCOES = [
    ("excited", r"feliz|alegre|animad|viva|legal|incr[ií]vel"),
    ("surprised", r"uau|nossa|surpres|impression"),
    ("loved", r"amor|querid|fofo|carinh|amig"),
    ("scared", r"medo|assust|susto"),
    ("sad", r"trist|pena|adeus|fim"),
]


def detectar(texto):
    t = (texto or "").lower()
    for mov, padrao, gesto in REGRAS:
        if re.search(padrao, t):
            emo = "happy"
            for e, p in EMOCOES:
                if re.search(p, t):
                    emo = e
                    break
            return mov, emo, gesto
    return "escuta", "happy", "respiração leve, olhar atento, piscar ocasional"


def main():
    beats = json.load(open(BASE / "beats.json", encoding="utf-8"))["beats"]
    man = json.load(open(BASE / "movimentos" / "manifest.json", encoding="utf-8"))
    banco = {q: set(m) for q, m in man["personagens"].items()}

    plano, faltam = [], {}
    for b in beats:
        falante = b.get("speaker", "narrador")
        mov, emo, gesto = detectar(b.get("text", ""))
        # a personagem que FALA usa o gesto; a outra reage com olhar/escuta
        linha = {"i": b["i"], "scene": b["scene"], "t0": b["t0"], "t1": b["t1"],
                 "texto": b.get("text", ""), "falante": falante,
                 "acao": mov, "emocao": emo, "gesto": gesto}
        for quem in ("frida", "luna"):
            if falante == "narrador":
                # A narração é em 3a pessoa: a acção pertence às duas personagens.
                meu = "escuta" if mov == "falar" else mov
            else:
                meu = mov if falante == quem else (
                    "olhar-frente" if mov == "acenar" else "escuta")
            existe = any(n.startswith(meu) for n in banco.get(quem, set()))
            linha[quem] = meu
            if not existe:
                faltam.setdefault(quem, {}).setdefault(meu, []).append(b["i"])
        plano.append(linha)

    dest = BASE / "animacao" / "movimentos-por-fala.json"
    dest.write_text(json.dumps(plano, indent=1, ensure_ascii=False), encoding="utf-8")
    (BASE / "animacao" / "movimentos-semanticos-faltam.json").write_text(
        json.dumps(faltam, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"{'i':>2} {'acao':13} {'emo':10} {'frida':13} {'luna':13} texto")
    for p in plano:
        print(f"{p['i']:2d} {p['acao']:13} {p['emocao']:10} {p['frida']:13} "
              f"{p['luna']:13} {p['texto'][:58]}")
    print("\nMOVIMENTOS SEMÂNTICOS QUE FALTAM:")
    for quem, movs in faltam.items():
        for mov, ids in movs.items():
            print(f"  {quem:6} {mov:16} beats {ids}")


if __name__ == "__main__":
    main()
