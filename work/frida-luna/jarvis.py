#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Jarvis — orchestrador do projecto Frida & Luna.

A inteligência está nos scripts, não no operador. À pergunta "o que queres fazer hoje?"
basta um comando (ou escrever o número no menu). Todos os passos usam as ferramentas já
existentes: gerar_ciclos, flow_fetch, flow_dl_all, cortar_mascara, validar_ciclo,
movimentos, gerar_timeline, Remotion e comparar.

Uso:
  py jarvis.py                          # modo interactivo
  py jarvis.py status
  py jarvis.py ciclo luna escuta
  py jarvis.py novos
  py jarvis.py episodio
  py jarvis.py comparar
  py jarvis.py tudo                     # ciclos em falta -> episódio -> comparação
"""
import json
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")
CDP = "http://127.0.0.1:18800"
PROJETO = "https://flow.google.com/u/0/project/62cb2bc8-7c82-4351-850d-d8453429108e"
DOWNLOADER = Path(r"C:\Users\Pires\StickFilms\.tools\flow_dl_all.mjs")
REF = {"frida": BASE / "chars" / "frida-v2-ok-flat.png",
       "luna": BASE / "chars" / "luna-v2-ok-flat.png"}
PASSADA_ZERO = {"escuta", "fala", "sentar", "olhar", "piscar"}


def rodar(cmd, cwd=BASE, mostrar=True):
    r = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if mostrar:
        for linha in (r.stdout or "").splitlines():
            if linha.strip():
                print("   " + linha)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def sec(texto="", n=62):
    print("\n" + ("=" * n) if not texto else "\n" + texto + "\n" + "-" * len(texto))


# ---------------------------------------------------------------------- estado

def estado():
    sec("ESTADO DO PROJECTO")
    man = json.loads((BASE / "movimentos" / "manifest.json").read_text(encoding="utf-8"))
    for quem, movs in man["personagens"].items():
        print(f"  {quem:7}: {len(movs)} ciclos -> " + ", ".join(sorted(movs)))
    fal = BASE / "animacao" / "faltam.json"
    if fal.exists():
        d = json.loads(fal.read_text(encoding="utf-8"))
        print("\n  em falta (prioridade):")
        for quem, movs in d.items():
            print(f"    {quem}: " + ", ".join(f"{m} ({len(ids)} beats)" for m, ids in movs.items()))
    tl = BASE / "remotion" / "timeline.json"
    if tl.exists():
        t = json.loads(tl.read_text(encoding="utf-8"))
        print(f"\n  timeline: {len(t['scenes'])} cenas, "
              f"{sum(len(s['beats']) for s in t['scenes'])} beats, "
              f"{t['durationInFrames']} frames")
    cards = sorted((BASE / "card").glob("*.mp4"), key=lambda p: p.stat().st_mtime)[-3:]
    print("\n  últimos renders: " + (", ".join(p.name for p in cards) or "nenhum"))


# ---------------------------------------------------------------------- prompts

def prompts():
    """Lê os blocos de prompt e devolve (nome -> {quem, tipo, prompt})."""
    out = {}
    f = BASE / "chars" / "PROMPTS-MOVIMENTOS.md"
    if f.exists():
        texto = f.read_text(encoding="utf-8")
        micro_f = BASE / "chars" / "PROMPTS-MICRO-MOVIMENTOS.md"
        micro = ""
        if micro_f.exists():
            m = re.search(r"```\s*\n(.*?)\n```", micro_f.read_text(encoding="utf-8"), re.S)
            micro = m.group(1).strip() if m else ""
        for gota in re.split(r"(?m)^##\s+", texto)[1:]:
            m = re.match(r"\d+\.\s+(\w+)\s*[—-]\s+([\wãõáéíóúêâ]+)", gota.splitlines()[0])
            b = re.search(r"```\s*\n(.*?)\n```", gota, re.S)
            if not m or not b:
                continue
            quem, mov = m.group(1).lower(), m.group(2).lower()
            p = b.group(1).strip()
            if micro and "MICRO-MOVEMENTS" not in p:
                p += "\n\n" + micro
            out[f"{quem}-{mov}"] = {"quem": quem, "tipo": mov, "prompt": p}
    f2 = BASE / "chars" / "PROMPTS-PISCAR.md"
    if f2.exists():
        m = re.search(r"```\s*\n(.*?)\n```", f2.read_text(encoding="utf-8"), re.S)
        if m:
            for quem in ("frida", "luna"):
                out[f"{quem}-piscar"] = {"quem": quem, "tipo": "piscar",
                                          "prompt": m.group(1).strip()}
    return out


# ---------------------------------------------------------------------- ciclo

def submeter(nome, prompt, quem):
    cmd = [sys.executable, "-u", str(BASE / "flow_fetch_proj.py"), "--kind", "image",
           "--no-launch", "--submit-only", "--cdp-url", CDP,
           "--project-dir", str(BASE), "--out-dir", str(BASE / "chars" / "folhas"),
           "--ref-image", str(REF[quem]), "--aspect", "16:9", "--wait", "60",
           "--skip-confirm", "--name", nome, "--prompt", prompt]
    rc, log = rodar(cmd, mostrar=False)
    return "RESUMO 1/1" in log or "prompt enviado" in log


def descarregar(destino, n=4):
    destino.mkdir(parents=True, exist_ok=True)
    cmd = ["node", str(DOWNLOADER), PROJETO, str(destino), "--n", str(n), "--cdp", CDP]
    rodar(cmd, cwd=DOWNLOADER.parent, mostrar=False)
    return sorted(destino.glob("*.webp"))


def experimentar(imagem, nome, tipo, quem):
    pasta = BASE / "_auto" / nome
    rodar([sys.executable, str(BASE / "cortar_mascara.py"), str(imagem), str(pasta)],
          mostrar=False)
    rc, log = rodar([sys.executable, str(BASE / "validar_ciclo.py"), str(pasta), tipo,
                     "--nome", nome], mostrar=False)
    try:
        v = json.loads(log[log.index("{"):log.rindex("}") + 1])
    except Exception:
        return None, log[-150:]
    if v.get("veredito") != "ACEITE":
        return None, v.get("erros")
    fps = "7.5"
    cmd = [sys.executable, str(BASE / "movimentos.py"), "registar", quem, nome,
           str(pasta), fps, "--fonte", f"Flow {imagem.name}",
           "--nota", "validado automaticamente pelo jarvis"]
    rodar(cmd)
    alt = "620" if quem == "frida" else "446"
    cmd = [sys.executable, str(BASE / "movimentos.py"), "render", quem, nome, "4",
           str(BASE / "card" / f"{nome}-4s.mp4"), "--altura", alt, "--x0", "720"]
    if tipo in PASSADA_ZERO:
        cmd += ["--passada", "0"]
    rodar(cmd)
    return v, None


def ciclo(quem, mov, imagem=None):
    nome = f"{quem}-{mov}"
    sec(f"CICLO: {nome}")
    P = prompts()
    if nome not in P:
        print(f"  não há prompt para {nome}. Disponíveis: " + ", ".join(sorted(P)))
        return 1
    info = P[nome]
    if imagem:
        imagens = [Path(imagem)]
    else:
        print("  1/4 a enviar prompt ao Flow ...")
        if not submeter(nome, info["prompt"], quem):
            print("  FALHOU ao enviar. O Flow pode estar sem campo de prompt — tente de novo.")
            return 1
        print("  2/4 a descarregar imagens ...")
        imagens = descarregar(BASE / "chars" / "folhas" / "_auto" / nome)
        print(f"  {len(imagens)} imagens descarregadas")
    print("  3/4 a cortar, validar e registar ...")
    for im in imagens[:5]:
        v, erro = experimentar(im, nome, info["tipo"], quem)
        if v:
            print(f"  ACEITE: {im.name} | emenda {v['emenda']:.1f} vs "
                  f"{v['media_passos']:.1f} | regiões vivas {v.get('regioes_vivas')}")
            print(f"  4/4 cartão: card/{nome}-4s.mp4")
            return 0
        print(f"  rejeitada {im.name}: {erro}")
    print("  NENHUMA tira passou. As imagens ficam em chars/folhas/_auto/ para revisão.")
    return 1


# ---------------------------------------------------------------------- comandos

def novos():
    sec("REGISTAR TIRAS JÁ DESCARREGADAS")
    rodar([sys.executable, str(BASE / "registar_novos.py")])


def episodio():
    sec("RENDERIZAR EPISÓDIO COMPLETO")
    rodar(["node", "gerar_timeline.mjs"], cwd=BASE / "remotion")
    rc, _ = rodar(["npm", "run", "render"], cwd=BASE / "remotion")
    print(f"  render: {'OK' if rc == 0 else 'FALHOU'} -> card/parque-dos-petes.mp4")
    return rc


def comparar():
    sec("COMPARAR COM A ORIGEM")
    rodar([sys.executable, str(BASE / "comparar.py"),
           str(BASE / "card" / "parque-dos-petes.mp4")])


def tudo():
    """Percorre os ciclos em falta por ordem de beats desbloqueados."""
    sec("PIPELINE COMPLETO")
    fal = BASE / "animacao" / "faltam.json"
    if not fal.exists():
        print("  sem plano de ciclos; a correr só o episódio")
    else:
        d = json.loads(fal.read_text(encoding="utf-8"))
        fila = []
        for quem, movs in d.items():
            for mov, ids in movs.items():
                fila.append((len(ids), quem, mov))
        fila.sort(reverse=True)
        for n, quem, mov in fila:
            print(f"\n  >>> {quem}/{mov} desbloqueia {n} beats")
            ciclo(quem, mov)
    episodio()
    comparar()


MENU = [
    ("1", "ver estado do projecto", estado),
    ("2", "criar/regenerar um ciclo (pergunta nome)", None),
    ("3", "registar tiras já descarregadas", novos),
    ("4", "renderizar episódio completo", episodio),
    ("5", "comparar com o vídeo de origem", comparar),
    ("6", "PIPELINE COMPLETO (tudo)", tudo),
    ("0", "sair", None),
]


def interactivo():
    print("=" * 62)
    print("  JARVIS — O Parque dos Petes")
    print("=" * 62)
    while True:
        estado_curto()
        print()
        for k, desc, _ in MENU:
            print(f"  [{k}] {desc}")
        op = input("\n  O que queres fazer hoje? ").strip()
        if op == "0":
            print("  Até já.")
            return
        if op == "2":
            quem = input("  Personagem (frida/luna)? ").strip().lower()
            mov = input("  Movimento (escuta, fala, marcha, piscar...)? ").strip().lower()
            if quem in REF:
                ciclo(quem, mov)
            else:
                print("  personagem desconhecida")
            continue
        item = next((x for x in MENU if x[0] == op), None)
        if item and item[2]:
            item[2]()
        else:
            print("  opção não reconhecida")


def estado_curto():
    man = json.loads((BASE / "movimentos" / "manifest.json").read_text(encoding="utf-8"))
    total = sum(len(v) for v in man["personagens"].values())
    print(f"  Banco: {total} ciclos | Frida: {len(man['personagens'].get('frida', {}))} "
          f"| Luna: {len(man['personagens'].get('luna', {}))}")


def main():
    if len(sys.argv) < 2:
        interactivo()
        return
    cmd = sys.argv[1].lower()
    if cmd == "status":
        estado()
    elif cmd == "ciclo" and len(sys.argv) >= 4:
        ciclo(sys.argv[2].lower(), sys.argv[3].lower(),
              sys.argv[4] if len(sys.argv) > 4 else None)
    elif cmd == "novos":
        novos()
    elif cmd == "episodio":
        episodio()
    elif cmd == "comparar":
        comparar()
    elif cmd == "tudo":
        tudo()
    elif cmd in ("ajuda", "help", "-h"):
        print(__doc__)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
