"""Transforma tiras novas em movimentos validados no banco e actualiza o episódio.

Entrada: chars/folhas/_mapa-novos.json
{
  "luna-escuta": {"ficheiro": "_novos/flow-0.webp", "tipo": "escuta", "fps": 7.5},
  "frida-fala":  {"ficheiro": "_novos/flow-1.webp", "tipo": "fala", "fps": 7.5}
}

Para cada entrada:
1. corta com cortar_mascara.py (fundo por ligação à borda);
2. valida com validar_ciclo.py (o tipo decide o critério);
3. se aprovado: regista em movimentos/ e renderiza um cartão de 4 s;
4. no fim: corre remotion/gerar_timeline.mjs para o episódio usar os ciclos novos.

Uso: py registar_novos.py [--sem-timeline]
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")
MAPA = BASE / "chars" / "folhas" / "_mapa-novos.json"


def corr(args, oq=""):
    r = subprocess.run(args, cwd=str(BASE), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if oq:
        print(oq)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sem-timeline", action="store_true")
    a = ap.parse_args()

    if not MAPA.exists():
        raise SystemExit(f"falta {MAPA}")
    mapa = json.loads(MAPA.read_text(encoding="utf-8"))

    aprovados, rejeitados = [], []
    for nome, cfg in mapa.items():
        quem = nome.split("-")[0]
        tipo = cfg.get("tipo", "escuta")
        fps = cfg.get("fps", 7.5)
        origem = BASE / "chars" / "folhas" / cfg["ficheiro"]
        if not origem.exists():
            origem = BASE / "chars" / "folhas" / "_novos" / cfg["ficheiro"]
        print(f"\n=== {nome} ({quem}/{tipo}) <- {origem.name} ===", flush=True)
        if not origem.exists():
            print("  FALTA o ficheiro")
            rejeitados.append((nome, "ficheiro ausente"))
            continue

        pasta = BASE / "_novos" / nome
        rc, log = corr([sys.executable, str(BASE / "cortar_mascara.py"), str(origem), str(pasta)])
        ultima = [l for l in log.splitlines() if "frames ->" in l]
        print("  " + (ultima[-1] if ultima else log.strip().splitlines()[-1]), flush=True)

        # PORTA DO ESPECIALISTA — fundo RGBA, caixa exacta, sem sombra, uma figura,
        # continuidade. Nenhuma imagem entra no banco sem passar aqui.
        import corrigir_multiplos
        import fixar_proporcoes
        from validar_imagem import validar as validar_especialista
        corrigir_multiplos.corrigir(pasta)
        H, aspect = fixar_proporcoes.ALVO[quem]
        fixar_proporcoes.aplicar(pasta, quem, H, round(H * aspect))
        vesp = validar_especialista(pasta, quem, nome)
        print(f"  especialista: {vesp['veredito']} "
              f"(continuidade {vesp['scores']['continuidade']:.2f})", flush=True)
        if vesp["veredito"] != "ACEITE":
            print(f"  REJEITADA pelo especialista: {vesp['motivos']}")
            rejeitados.append((nome, "especialista: " + "; ".join(vesp["motivos"][:2])))
            continue

        rc, log = corr([sys.executable, str(BASE / "validar_ciclo.py"), str(pasta),
                        tipo, "--nome", nome])
        try:
            validacao = json.loads(log[log.index("{"):log.rindex("}") + 1])
        except Exception:
            validacao = {"veredito": "REJEITADA", "erros": [log[-200:]]}

        if validacao.get("veredito") != "ACEITE":
            print(f"  REJEITADA: {validacao.get('erros')}")
            rejeitados.append((nome, validacao.get("erros")))
            continue

        print(f"  ACEITE: emenda {validacao.get('emenda'):.1f} vs "
              f"{validacao.get('media_passos'):.1f}", flush=True)

        mov = nome[len(quem) + 1:] if nome.startswith(quem + "-") else nome
        corr([sys.executable, str(BASE / "movimentos.py"), "registar", quem, mov,
              str(pasta), str(fps), "--fonte", f"Flow {origem.name}",
              "--nota", "validado por validar_ciclo.py"])
        passada = "0" if tipo in ("escuta", "fala", "sentar", "olhar") else None
        cmd = [sys.executable, str(BASE / "movimentos.py"), "render", quem, nome, "4",
               str(BASE / "card" / f"{nome}-4s.mp4"), "--altura",
               "620" if quem == "frida" else "446", "--x0", "720"]
        if passada:
            cmd += ["--passada", passada]
        corr(cmd)
        aprovados.append(nome)

    print("\n=== resumo ===")
    print("aprovados:", ", ".join(aprovados) or "nenhum")
    for n, e in rejeitados:
        print(f"rejeitado {n}: {e}")

    if not a.sem_timeline and aprovados:
        print("\nA actualizar o timeline do episódio...")
        r = subprocess.run(["node", "gerar_timeline.mjs"],
                           cwd=str(BASE / "remotion"), capture_output=True,
                           text=True, encoding="utf-8", errors="replace")
        print("\n".join(r.stdout.splitlines()[-8:]))


if __name__ == "__main__":
    main()
