"""Traduz os 44 beats em movimentos concretos por personagem e mede o que falta no banco.

Regra: o movimento sai do que a cena mostra, nao da fala.
- se a personagem FALA nesse beat -> fala
- se ESCUTA -> escuta (parado, respiracao curta)
- se a accao do beat manda andar/correr/saltar/... -> esse movimento manda

Escreve `animacao/plano-por-beat.json` e imprime:
- a tabela beat -> (frida, luna)
- o conjunto de movimentos necessarios
- o que ja existe no banco e o que falta gerar

Uso: py plano_animacao.py
"""
import json
import re
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")

# accao -> movimento. A ordem importa: o primeiro padrao que casa manda.
REGRAS = [
    ("corrida", r"corre|corrida|dispara|desata a correr"),
    ("salto", r"salta|pula|pulo|saltit|salto"),
    ("giro", r"gira|rodopia|roda em volta|dar uma volta"),
    ("sentar", r"senta|sentad"),
    ("deitar", r"deita|dorme|sono"),
    ("comemorar", r"comemora|festeja|viva|celebra|palmas|trofeu"),
    ("susto", r"assusta|susto|medo|arregala|sobresalto"),
    ("rir", r"\bri\b|rir|gargalh|acha graca"),
    ("abanar", r"abana|rabo|rabinho"),
    ("abracar", r"abraça|abraça|abraco"),
    ("olhar", r"olha|repara|observa|espia"),
    ("marcha", r"anda|caminha|pass(ei|a|eia)|vai em direccao|aproxima|entra|segue"),
]


def movimento_da_accao(accao: str, fala: bool):
    a = (accao or "").lower()
    for nome, pat in REGRAS:
        if re.search(pat, a):
            return nome
    return "fala" if fala else "escuta"


def main():
    beats = json.load(open(BASE / "beats.json", encoding="utf-8"))["beats"]
    man = json.load(open(BASE / "movimentos" / "manifest.json", encoding="utf-8"))
    banco = {quem: set(movs) for quem, movs in man["personagens"].items()}

    # o banco tem variantes da mesma coisa (marcha-8f, marcha-12f, marcha-flow10...)
    sinonimos = {"marcha": "marcha", "corrida": "corrida", "fala": "fala", "escuta": "escuta",
                 "salto": "salto", "giro": "giro", "sentar": "sentar", "deitar": "deitar",
                 "comemorar": "comemorar", "susto": "susto", "rir": "rir", "abanar": "abanar",
                 "abracar": "abracar", "olhar": "olhar"}

    def existe(quem, mov):
        return any(n.startswith(mov) for n in banco.get(quem, set()))

    plano, faltam = [], {}
    for b in beats:
        falantes = {b.get("speaker")}
        fala_f = "frida" in falantes
        fala_l = "luna" in falantes
        mf = movimento_da_accao(b.get("action", ""), fala_f)
        ml = movimento_da_accao(b.get("action", ""), fala_l)
        # a accao do beat e uma so; se for marcha, quem fala nao marcha ao mesmo tempo
        if mf == "marcha" and fala_f:
            mf = "fala"
        if ml == "marcha" and fala_l:
            ml = "fala"
        plano.append({
            "i": b["i"], "scene": b["scene"], "t0": b["t0"], "t1": b["t1"], "dur": b["dur"],
            "speaker": b.get("speaker"), "frida": mf, "luna": ml,
            "expr_frida": b.get("frida"), "expr_luna": b.get("luna"),
            "action": b.get("action", ""), "bg": b.get("bg", ""), "cam": b.get("cam", ""),
        })
        for quem, mov in (("frida", mf), ("luna", ml)):
            if not existe(quem, mov):
                faltam.setdefault(quem, {}).setdefault(mov, []).append(b["i"])

    destino = BASE / "animacao"
    destino.mkdir(exist_ok=True)
    (destino / "plano-por-beat.json").write_text(
        json.dumps(plano, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"{'i':>2} {'cena':10} {'dur':>5} {'frida':10} {'luna':10}")
    for p in plano:
        print(f"{p['i']:2d} {p['scene']:10} {p['dur']:5.1f} {p['frida']:10} {p['luna']:10}")

    print("\nexistem no banco:")
    for quem, movs in sorted(banco.items()):
        print(f"  {quem}: {', '.join(sorted(movs))}")

    print("\nFALTA GERAR:")
    if not faltam:
        print("  nada")
    for quem, movs in faltam.items():
        print(f"  {quem}:")
        for mov, ids in movs.items():
            print(f"    {mov:12} beats {ids}")
    (destino / "faltam.json").write_text(
        json.dumps(faltam, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
