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
# UMA pose aprovada por personagem — nunca a folha de 3 vistas (confundia o Flow
# e produzia desenhos diferentes a cada geracao)
REF = {"frida": BASE / "chars" / "poses-v3" / "frida" / "happy.png",
       "luna": BASE / "chars" / "poses-v3" / "luna" / "happy.png"}
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


# ---------------------------------------------------------------------- portas

def regras():
    f = BASE / "animacao" / "regras.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def verificar_portas(verbose=True):
    """Aplica as regras obrigatórias. Devolve (ok, lista_de_falhas)."""
    R = regras()
    falhas = []
    mods = R.get("portas", {})

    for nome, cfg in mods.items():
        for arq in cfg.get("exige_arquivos", []):
            if not (BASE / arq).exists():
                falhas.append(f"{nome}: falta {arq}")
        arq = cfg.get("exige_arquivo")
        if arq and not (BASE / arq).exists():
            falhas.append(f"{nome}: falta {arq}")

    # continuidade: nenhum ciclo do banco pode ser outro desenho
    rel = BASE / "animacao" / "auditoria-continuidade.json"
    if rel.exists():
        for r in json.loads(rel.read_text(encoding="utf-8")):
            if r.get("tipo") == "ciclo-gerado" and r.get("score", 0) > 0.45:
                falhas.append(f"continuidade: {r['nome']} score {r['score']} > 0,45")

    # continuidade real: comparar cada ciclo do banco com a pose aprovada
    man = json.loads((BASE / "movimentos" / "manifest.json").read_text(encoding="utf-8"))
    for quem, movs in man["personagens"].items():
        for nome in movs:
            if nome.startswith(quem + "-"):
                falhas.append(f"banco: nome com prefixo {quem}/{nome}")

    aprov = BASE / "animacao" / "aprovacao.json"
    if aprov.exists():
        a = json.loads(aprov.read_text(encoding="utf-8"))
        if not a.get("aprovado"):
            falhas.append("aprovacao_humana: amostra ainda nao aprovada")

    if verbose:
        if falhas:
            print("  PORTAS FECHADAS:")
            for f in falhas:
                print("   - " + f)
        else:
            print("  portas: OK")
    return (not falhas), falhas


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
    ok = "RESUMO 1/1" in log or "prompt enviado" in log
    if not ok:
        print("   motivo: " + " | ".join(
            l.strip() for l in log.splitlines()
            if "ERRO" in l or "falhou:" in l or "ref-image" in l or "RESUMO" in l)[-300:])
    return ok


def descarregar(destino, n=4):
    destino.mkdir(parents=True, exist_ok=True)
    cmd = ["node", str(DOWNLOADER), PROJETO, str(destino), "--n", str(n),
           "--cdp", CDP, "--hires"]
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
    mov = nome[len(quem) + 1:] if nome.startswith(quem + "-") else nome
    cmd = [sys.executable, str(BASE / "movimentos.py"), "registar", quem, mov,
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
    ok, falhas = verificar_portas()
    if not ok:
        print("  RENDER BLOQUEADO pelas regras. Corrigir as falhas acima primeiro.")
        return 2
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


def produzir(limite=0):
    """Orquestra pela ordem obrigatória: plano -> gerar -> validar -> banco -> amostra."""
    sec("PRODUÇÃO ORDENADA (Jarvis)")
    print("  1/6 plano de beats")
    rodar([sys.executable, str(BASE / "plano_animacao.py")], mostrar=False)

    fal = BASE / "animacao" / "faltam.json"
    fila = []
    if fal.exists():
        d = json.loads(fal.read_text(encoding="utf-8"))
        for quem, movs in d.items():
            for mov, ids in movs.items():
                fila.append((len(ids), quem, mov))
        fila.sort(reverse=True)
    if limite:
        fila = fila[:limite]

    print(f"  2/6 geracao e validacao de {len(fila)} movimentos")
    for n, quem, mov in fila:
        print(f"\n  >>> {quem}/{mov} ({n} beats)")
        for tentativa in range(1, 4):
            print(f"    tentativa {tentativa}/3")
            if ciclo(quem, mov) == 0:
                break

    print("\n  3/6 auditoria de continuidade")
    rodar([sys.executable, str(BASE / "auditoria_consistencia.py")], mostrar=False)
    ok, falhas = verificar_portas(verbose=False)

    print("  4/6 timeline e amostra")
    rodar(["node", "gerar_timeline.mjs"], cwd=BASE / "remotion", mostrar=False)
    rodar(["npx", "remotion", "render", "src/index.ts", "Episodio",
           "_remotion-preview-v3.mp4", "--frames=0-599", "--scale=0.5",
           "--codec=h264", "--pixel-format=yuv420p", "--crf=22"],
          cwd=BASE / "remotion", mostrar=False)

    print("  5/6 verificação de portas")
    ok, falhas = verificar_portas()
    print("  6/6 PARADO à espera da tua aprovação da amostra.")
    print("     Para aprovar: escrever animacao/aprovacao.json com {\"aprovado\": true}")
    if falhas:
        print("     (há portas fechadas — ver acima)")
    return 0 if ok else 1


def prompt_lote(quem, movimentos):
    """Um prompt para N folhas de uma vez, com uma unica referencia anexada."""
    micro = ""
    f = BASE / "chars" / "PROMPTS-MICRO-MOVIMENTOS.md"
    if f.exists():
        m = re.search(r"```\s*\n(.*?)\n```", f.read_text(encoding="utf-8"), re.S)
        micro = m.group(1).strip() if m else ""
    nomes = "\n".join(f"- Image {i+1}: the cycle called \"{m}\"" for i, m in enumerate(movimentos))
    return (
        f"CRITICAL: EVERY IMAGE MUST HAVE A FULLY TRANSPARENT BACKGROUND (real RGBA alpha). "
        f"No cream paper, no white, no colour, no ground line, NO SHADOW or oval under the "
        f"feet, no border, no text. Any image with a background is rejected. Deliver the "
        f"alpha channel intact, do not flatten it.\n\n"
        f"Create {len(movimentos)} SEPARATE images in this single request. Each image is one "
        f"sprite sheet for the SAME approved character, drawn exactly like the attached "
        f"reference image (same face, same colours, same proportions, same outline) — never "
        f"a different character or a different style.\n\n"
        f"The images, in order:\n{nomes}\n\n"
        f"RULES FOR EVERY IMAGE (apply all of them):\n"
        f"1. ONE horizontal row of exactly 8 evenly spaced drawings of the named movement, "
        f"read left to right, same size, feet on one baseline, the 8th drawing flows back "
        f"into the 1st.\n"
        f"2. TRUE TRANSPARENT BACKGROUND (RGBA), no paper, no ground line, NO SHADOW, no oval "
        f"under the feet, no border, no text. The shadow is drawn later by the animation.\n"
        f"3. MINIMUM GAP between neighbouring drawings: at least one quarter of a figure's "
        f"width of empty transparent space. Figures must NEVER touch or overlap.\n"
        f"4. NO frame borders, no numbers, no labels.\n\n"
        f"{micro}\n\n"
        f"Keep the identity of the attached reference in every drawing of every image."
    )


def lote(quem, quantas=20):
    """Gera N folhas de uma vez para uma personagem e descarrega todas."""
    sec(f"LOTE — {quem} ({quantas} imagens)")
    fal = BASE / "animacao" / "faltam.json"
    movs = []
    if fal.exists():
        d = json.loads(fal.read_text(encoding="utf-8"))
        movs = list(d.get(quem, {}).keys())
    if not movs:
        print("  sem movimentos em falta para esta personagem")
        return 1
    prompt = prompt_lote(quem, movs[:quantas])
    print(f"  pedindo {len(movs[:quantas])} folhas: {', '.join(movs[:quantas])}")
    if not submeter(f"{quem}-lote", prompt, quem):
        print("  FALHOU ao submeter (referencia pode nao ter anexado)")
        return 1
    destino = BASE / "chars" / "folhas" / f"_lote-{quem}"
    imgs = descarregar(destino, quantas)
    print(f"  descarregadas {len(imgs)} imagens em {destino}")
    print("  proximo: identificar cada folha e correr registar_novos.py com o mapa")
    return 0


MENU = [
    ("1", "ver estado do projecto", estado),
    ("2", "criar/regenerar um ciclo (pergunta nome)", None),
    ("3", "registar tiras já descarregadas", novos),
    ("4", "renderizar episódio completo", episodio),
    ("5", "comparar com o vídeo de origem", comparar),
    ("6", "PIPELINE COMPLETO (tudo)", tudo),
    ("7", "produzir por ordem (planejar-gerar-validar-amostra)", produzir),
    ("8", "verificar regras e portas", verificar_portas),
    ("9", "gerar lote de 20 folhas (pergunta personagem)", None),
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
        if op == "9":
            quem = input("  Personagem do lote (frida/luna)? ").strip().lower()
            if quem in REF:
                lote(quem)
            else:
                print("  personagem desconhecida")
            continue
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
    elif cmd == "produzir":
        produzir(int(sys.argv[2]) if len(sys.argv) > 2 else 0)
    elif cmd == "verificar":
        verificar_portas()
    elif cmd == "lote" and len(sys.argv) >= 3:
        lote(sys.argv[2].lower(), int(sys.argv[3]) if len(sys.argv) > 3 else 20)
    elif cmd in ("ajuda", "help", "-h"):
        print(__doc__)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
