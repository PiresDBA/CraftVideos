#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AUDITORIA FINAL — verifica objectivamente os 7 problemas.

Só imprime "100% OK" quando TODAS as verificações passam. Não confia em
relatórios escritos pelos agentes: re-mede directamente o banco, os sprites,
o contrato, o timeline e a aprovação.

Uso: py auditoria_final.py
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"D:\CRAFT")
BASE = ROOT / "work" / "frida-luna"
sys.path.insert(0, str(BASE))
ALVO = {"frida": (173, 231), "luna": (167, 265)}
TIPOS = {
    "frida": ["comer", "olhar-frente", "marcha", "salto", "corrida", "giro", "sorrir", "surpreso"],
    "luna": ["comer", "marcha", "salto", "corrida", "giro", "sorrir", "surpreso"],
}
RESULTADOS = []


def check(nome, cond, detalhe=""):
    RESULTADOS.append((nome, bool(cond), detalhe))
    print(f"  [{'OK  ' if cond else 'FALHA'}] {nome}" + (f" — {detalhe}" if detalhe else ""))
    return bool(cond)


def nome_tem(nomes, movimento):
    return any(movimento == n or movimento in n for n in nomes)


def sprites(cfg):
    p = Path(cfg["pasta"])
    return sorted(p.glob("f*.png")) or sorted(p.glob("*.png"))


def medir_sprite(path):
    a = np.array(Image.open(path).convert("RGBA"))
    alpha = a[:, :, 3]
    h, w = alpha.shape
    opaco = alpha > 60
    # NOTA: apos fixar_proporcoes.py a figura e recortada e esticada para preencher
    # a caixa, por isso TOCA nas bordas — exigir "0 opacos na borda" e' falso positivo.
    # Fundo transparente real verifica-se pelos CANTOS + fraccao transparente.
    cantos = [alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]]
    cantos_ok = all(int(c) < 40 for c in cantos)
    frac_transp = float((alpha < 40).mean())
    fugas = 0 if (cantos_ok and frac_transp > 0.15) else int(opaco.sum())
    # buraco: pixel totalmente transparente rodeado de opacos (vizinhança 8)
    m = alpha == 0
    buracos = 0
    ys, xs = np.nonzero(m)
    for y, x in zip(ys, xs):
        if y == 0 or y == h - 1 or x == 0 or x == w - 1:
            continue
        if opaco[y - 1:y + 2, x - 1:x + 2].sum() >= 7:
            buracos += 1
    return fugas, cantos_ok, buracos, (w, h)


def main():
    print("=" * 66)
    print("  AUDITORIA FINAL — 7 problemas")
    print("=" * 66)

    # ---- problema 2: gatilho honesto -------------------------------------
    r = subprocess.run([sys.executable, str(BASE / "verificar_contrato.py")],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    gate_ok = r.returncode == 0 and "TODAS AS PORTAS ABERTAS" in r.stdout
    check("P2 gatilho honesto (todas as portas abertas)", gate_ok,
          f"exit={r.returncode}")
    if not gate_ok:
        print("\n".join(l for l in r.stdout.splitlines() if "[FECH]" in l))

    # ---- problema 3: aprovação não auto-criada ---------------------------
    tmpl = BASE / "animacao" / "APROVACAO-TEMPLATE.json"
    aprov = BASE / "animacao" / "aprovacao.json"
    check("P3 modelo de aprovação existe", tmpl.exists())
    check("P3 aprovação NÃO auto-criada pelo jarvis", not aprov.exists(),
          "utilizador deve escrever explicitamente")

    # ---- problemas 1, 4, 5: banco completo --------------------------------
    man = json.loads((BASE / "movimentos" / "manifest.json").read_text(encoding="utf-8"))
    banco = man["personagens"]
    for quem, tipos in TIPOS.items():
        nomes = list(banco.get(quem, {}).keys())
        falta = [t for t in tipos if not nome_tem(nomes, t)]
        check(f"P1 banco {quem} (15 tipos)", not falta,
              f"{len(nomes)} ciclos" + (f"; FALTAM {falta}" if falta else ""))

    # ---- problema 7: lip-sync documentado --------------------------------
    contrato = (ROOT / "CONTRATO-ANIMACAO.md").read_text(encoding="utf-8")
    check("P7 limitação lip-sync documentada",
          "lip-sync" in contrato.lower() and "RMS" in contrato)

    # ---- problemas 5, 6: integridade dos sprites -------------------------
    try:
        from calibrar_continuidade import assinatura, distancia
    except Exception as e:
        assinatura = distancia = None
        check("import calibrar_continuidade", False, str(e)[:60])

    total_fugas = total_buracos = 0
    piores = []
    for quem, movs in banco.items():
        ref_path = BASE / "chars" / "poses-v3" / quem / "happy.png"
        ref = assinatura(ref_path) if assinatura else None
        for nome, cfg in movs.items():
            fs = sprites(cfg)
            if not fs:
                check(f"sprites {quem}/{nome}", False, "sem ficheiros")
                continue
            fugas, cantos_ok, buracos, tam = medir_sprite(fs[0])
            total_fugas += fugas
            total_buracos += buracos
            check(f"fundo/caixa {quem}/{nome}",
                  tam == ALVO[quem] and cantos_ok and fugas == 0,
                  f"{tam} == {ALVO[quem]}, fugas={fugas}")
            if buracos:
                piores.append((quem, nome, buracos))
            if ref:
                d = distancia(assinatura(fs[0]), ref)
                check(f"continuidade {quem}/{nome}", d <= 0.45, f"{d:.2f} <= 0,45")
    check("P6 sem buracos no contorno", total_buracos == 0,
          f"{total_buracos} pixéis" + (f" {piores[:4]}" if piores else ""))

    # ---- relatórios dos agentes ------------------------------------------
    for rel in ("RELATORIO-BANCO.md", "RELATORIO-AUDITORIA-VISUAL.md"):
        check(f"relatório {rel}", (BASE / rel).exists())

    # ---- timeline --------------------------------------------------------
    tl = BASE / "remotion" / "timeline.json"
    t = json.loads(tl.read_text(encoding="utf-8"))
    soma = sum(s["durationInFrames"] for s in t["scenes"])
    hs = {b["frida"]["h"] for s in t["scenes"] for b in s["beats"]}
    hl = {b["luna"]["h"] for s in t["scenes"] for b in s["beats"]}
    check("timeline 5882 frames", soma == 5882, str(soma))
    check("alturas fixas F520 L450", hs == {520} and hl == {450}, f"F{hs} L{hl}")

    # ---- veredito --------------------------------------------------------
    falhas = [n for n, ok, _ in RESULTADOS if not ok]
    print("-" * 66)
    if falhas:
        print(f"  NÃO ESTÁ 100% — {len(falhas)} verificação(ões) falharam:")
        for f in falhas:
            print(f"    - {f}")
        return 1
    print("  100% OK — os 7 problemas estão resolvidos e medidos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
