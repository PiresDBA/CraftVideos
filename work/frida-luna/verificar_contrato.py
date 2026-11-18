#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GATILHO DO CONTRATO — verifica as regras antes de qualquer trabalho criativo.

Imprime um blister com o estado de cada porta e Termina com exit 1 se alguma estiver
fechada. É o "Hulk" do projecto: ler o contrato + correr isto é obrigatório antes de gerar,
animar ou renderizar. Chamado também por jarvis.py episodio.

Uso: py work\frida-luna\verificar_contrato.py
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(r"D:\CRAFT")
BASE = ROOT / "work" / "frida-luna"


def ok(cond, msg, detalhe=""):
    print(f"  [{'OK  ' if cond else 'FECH'}] {msg}" + (f" — {detalhe}" if detalhe else ""))
    return bool(cond)


def main():
    contrato = ROOT / "CONTRATO-ANIMACAO.md"
    print("=" * 62)
    print("  GATILHO DO CONTRATO — leitura obrigatória")
    print("=" * 62)
    if not contrato.exists():
        print("  CONTRATO AUSENTE — parar.")
        return 1
    h = hashlib.md5(contrato.read_bytes()).hexdigest()[:10]
    print(f"  contrato lido: CONTRATO-ANIMACAO.md ({h})")
    falhas = 0

    # referências canónicas
    refs = [BASE / "chars" / "poses-v3" / q / "happy.png" for q in ("frida", "luna")]
    falhas += not all(ok(p.exists(), f"referência {p.parent.name}", str(p)) for p in refs)

    # plano e semântica
    plano = BASE / "animacao" / "plano-por-beat.json"
    sem = BASE / "animacao" / "movimentos-por-fala.json"
    falhas += not ok(plano.exists() and sem.exists(), "plano e semântica da narração")

    # banco
    man = json.loads((BASE / "movimentos" / "manifest.json").read_text(encoding="utf-8"))
    total = sum(len(v) for v in man["personagens"].values())
    falhas += not ok(total > 0, "banco de movimentos", f"{total} ciclos")
    for quem, movs in man["personagens"].items():
        for nome in movs:
            if nome.startswith(quem + "-"):
                falhas += not ok(False, "nome de ciclo com prefixo", f"{quem}/{nome}")

    # continuidade dos ciclos do banco
    try:
        import sys
        sys.path.insert(0, str(BASE))
        from calibrar_continuidade import assinatura, distancia
        for quem, movs in man["personagens"].items():
            ref = assinatura(BASE / "chars" / "poses-v3" / quem / "happy.png")
            for nome, cfg in movs.items():
                f = Path(cfg["pasta"]) / "f00.png"
                if not f.exists():
                    falhas += not ok(False, "ficheiro do ciclo ausente", f"{quem}/{nome}")
                    continue
                d = distancia(assinatura(f), ref)
                falhas += not ok(d <= 0.45, f"continuidade {quem}/{nome}", f"{d:.2f} <= 0,45")
    except Exception as e:
        falhas += not ok(False, "medição de continuidade", str(e)[:80])

    # caixa fixa
    alvo = {"frida": (173, 231), "luna": (167, 265)}
    from PIL import Image
    for quem, movs in man["personagens"].items():
        for nome, cfg in movs.items():
            f = Path(cfg["pasta"]) / "f00.png"
            if f.exists():
                tam = Image.open(f).size
                falhas += not ok(tam == alvo[quem], f"caixa fixa {quem}/{nome}",
                                 f"{tam} == {alvo[quem]}")

    # timeline
    tl = BASE / "remotion" / "timeline.json"
    if tl.exists():
        t = json.loads(tl.read_text(encoding="utf-8"))
        soma = sum(s["durationInFrames"] for s in t["scenes"])
        falhas += not ok(soma == 5882, "timeline 5882 frames", str(soma))
        hs = {b["frida"]["h"] for s in t["scenes"] for b in s["beats"]}
        hl = {b["luna"]["h"] for s in t["scenes"] for b in s["beats"]}
        falhas += not ok(hs == {520} and hl == {450}, "alturas fixas", f"F{hs} L{hl}")

    print("-" * 62)
    if falhas:
        print(f"  {falhas} PORTA(S) FECHADA(S) — não avançar.")
    else:
        print("  TODAS AS PORTAS ABERTAS — pode avançar.")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
