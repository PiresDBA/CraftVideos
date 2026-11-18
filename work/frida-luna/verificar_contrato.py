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


def _resultado_validador(valor):
    """Interpreta o retorno do validador especialista como aprovado/reprovado."""
    if isinstance(valor, dict):
        for chave in ("ok", "valido", "aprovado", "pass"):
            if chave in valor:
                return bool(valor[chave])
        return False
    if isinstance(valor, (tuple, list)):
        return bool(valor[0]) if valor else False
    return bool(valor)


def _corresponde_movimento(nome, chave, quem):
    """Nome exacto ou prefixo, com ou sem o prefixo da personagem na chave do banco."""
    if chave.startswith(quem + "-"):
        chave = chave[len(quem) + 1:]
    return chave == nome or chave.startswith(nome) or nome.startswith(chave)


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

    # cobertura semântica: todo movimento nomeado de cada beat existe no banco
    if sem.exists():
        beats = json.loads(sem.read_text(encoding="utf-8"))
        usados = {}  # (quem, movimento) -> [ids dos beats]
        for b in beats:
            for quem in ("frida", "luna"):
                nome = b.get(quem)
                if nome:
                    usados.setdefault((quem, nome), []).append(b.get("i"))
        faltam_mov = []
        for (quem, nome), ids in sorted(usados.items()):
            chaves = man["personagens"].get(quem, {})
            presente = any(_corresponde_movimento(nome, chave, quem) for chave in chaves)
            if not presente:
                faltam_mov.append((quem, nome))
                print(f"  [FECH] movimento em falta: {quem}/{nome} — beats {ids}")
        falhas += not ok(not faltam_mov, "cobertura semântica dos movimentos",
                         f"{len(faltam_mov)} em falta")

    # validador especialista (tamanho + fundo + continuidade) aplicado a todos os ciclos aceites
    val = BASE / "validar_imagem.py"
    if not val.exists():
        falhas += not ok(False, "validador especialista", "ausente — validar_imagem.py")
    else:
        try:
            import importlib.util
            import subprocess
            import sys as _sys
            spec = importlib.util.spec_from_file_location("validar_imagem", str(val))
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            fn = next((getattr(mod, n) for n in
                       ("validar", "validar_imagem", "verificar", "validar_ciclo",
                        "check", "validate")
                       if callable(getattr(mod, n, None))), None)
            ciclos = [(q, n, c) for q, movs in man["personagens"].items()
                      for n, c in movs.items()]
            reprovados, erros = [], []
            for quem, nome, cfg in ciclos:
                f = Path(cfg["pasta"]) / "f00.png"
                alvo = str(f) if f.exists() else str(cfg["pasta"])
                resultado = None
                if fn:
                    for arg in (alvo, str(cfg["pasta"])):
                        try:
                            resultado = _resultado_validador(fn(arg))
                            break
                        except TypeError:
                            continue
                        except Exception as e:
                            erros.append(f"{quem}/{nome}: {str(e)[:60]}")
                            resultado = False
                            break
                if resultado is None:
                    try:
                        resultado = subprocess.run(
                            [_sys.executable, str(val), alvo], capture_output=True
                        ).returncode == 0
                    except Exception as e:
                        erros.append(f"{quem}/{nome}: CLI {str(e)[:60]}")
                        resultado = False
                if not resultado:
                    reprovados.append(f"{quem}/{nome}")
            for r in reprovados:
                print(f"  [FECH] validador especialista reprovou {r}")
            for e in erros:
                print(f"  [FECH] validador especialista erro: {e}")
            falhas += not ok(not reprovados and not erros, "validador especialista aplicado",
                             f"{len(ciclos)} ciclos, {len(reprovados)} reprovados")
        except Exception as e:
            falhas += not ok(False, "validador especialista", str(e)[:80])

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
