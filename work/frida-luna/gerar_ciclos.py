"""Submete ao Flow os ciclos em falta e descarrega as imagens pelo caminho que funciona.

Lê os blocos de chars/PROMPTS-MOVIMENTOS.md (escritos pelo especialista de prompts) e,
para cada um, chama flow_fetch_proj.py com --submit-only. O download e feito no fim por
flow_dl_all.mjs, porque o download interno do flow_fetch falha sempre neste projecto.

Uso:
  py gerar_ciclos.py                 # todos, por prioridade
  py gerar_ciclos.py --apenas 2      # so os 2 primeiros
  py gerar_ciclos.py --de 3 --ate 5  # intervalo
  py gerar_ciclos.py --sem-download
"""
import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")
PROMPTS = BASE / "chars" / "PROMPTS-MOVIMENTOS.md"
FETCH = BASE / "flow_fetch_proj.py"
DOWNLOADER = Path(r"C:\Users\Pires\StickFilms\.tools\flow_dl_all.mjs")
PROJECT_URL = "https://flow.google.com/u/0/project/62cb2bc8-7c82-4351-850d-d8453429108e"
CDP = "http://127.0.0.1:18800"
# Uma pose aprovada por personagem. A folha de 3 vistas confundia o Flow e gerava
# personagens diferentes — foi a causa raiz da quebra de continuidade.
REF = {
    "frida": BASE / "chars" / "poses-v3" / "frida" / "happy.png",
    "luna": BASE / "chars" / "poses-v3" / "luna" / "happy.png",
}


def bloco_micro():
    """O bloco de micro-movimentos obrigatórios, extraído do ficheiro de regras."""
    f = BASE / "chars" / "PROMPTS-MICRO-MOVIMENTOS.md"
    if not f.exists():
        return ""
    m = re.search(r"```\s*\n(.*?)\n```", f.read_text(encoding="utf-8"), re.S)
    return m.group(1).strip() if m else ""


def blocos():
    texto = PROMPTS.read_text(encoding="utf-8")
    micro = bloco_micro()
    gotas = re.split(r"(?m)^##\s+", texto)[1:]
    out = []
    for gota in gotas:
        cab = gota.splitlines()[0]
        m = re.match(r"(\d+)\.\s+(\w+)\s*[—-]\s+([\wãõáéíóúêâ]+)", cab)
        if not m:
            continue
        numero = int(m.group(1))
        quem = m.group(2).lower()
        mov = m.group(3).lower()
        prompt = re.search(r"```\s*\n(.*?)\n```", gota, re.S)
        if not prompt:
            continue
        p = prompt.group(1).strip()
        if micro and "MICRO-MOVEMENTS" not in p:
            p = p + "\n\n" + micro
        out.append({
            "n": numero, "quem": quem, "mov": mov,
            "nome": f"{quem}-{mov}",
            "prompt": p,
        })
    return out


def submeter(b):
    cmd = [sys.executable, "-u", str(FETCH), "--kind", "image", "--no-launch",
           "--submit-only", "--cdp-url", CDP, "--project-dir", str(BASE),
           "--out-dir", str(BASE / "chars" / "folhas"),
           "--ref-image", str(REF[b["quem"]]), "--aspect", "16:9",
           "--wait", "60", "--skip-confirm", "--name", b["nome"],
           "--prompt", b["prompt"]]
    r = subprocess.run(cmd, cwd=str(BASE.parent.parent), capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    linhas = (r.stdout + r.stderr).splitlines()
    util = [l for l in linhas if "prompt enviado" in l or "RESUMO" in l or
            "falhou:" in l or "ERRO" in l or "nao conectou" in l.lower()]
    return r.returncode == 0, " | ".join(util[-4:]) or (linhas[-1] if linhas else "")


def descarregar():
    destino = BASE / "chars" / "folhas" / "_novos"
    destino.mkdir(parents=True, exist_ok=True)
    cmd = ["node", str(DOWNLOADER), PROJECT_URL, str(destino),
           "--n", "40", "--cdp", CDP]
    r = subprocess.run(cmd, cwd=str(DOWNLOADER.parent), capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    n = len(list(destino.glob("*.webp")))
    print(f"download: {n} imagens em {destino}")
    print("\n".join(r.stdout.splitlines()[-3:]))
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apenas", type=int, default=0)
    ap.add_argument("--de", type=int, default=0)
    ap.add_argument("--ate", type=int, default=0)
    ap.add_argument("--sem-download", action="store_true")
    a = ap.parse_args()

    items = blocos()
    print(f"{len(items)} blocos de prompt encontrados")
    if a.apenas:
        items = items[:a.apenas]
    if a.de:
        items = [b for b in items if b["n"] >= a.de]
    if a.ate:
        items = [b for b in items if b["n"] <= a.ate]

    resultados = []
    for b in items:
        print(f"\n[{b['n']:2d}/13] {b['nome']} ...", flush=True)
        ok, msg = submeter(b)
        resultados.append((b["nome"], ok, msg))
        print(("  OK  " if ok else "  FALHOU ") + msg[:200], flush=True)
        time.sleep(8)

    print("\n=== resumo ===")
    for nome, ok, msg in resultados:
        print(f"  {'OK  ' if ok else 'FALHA'} {nome:24} {msg[:80]}")
    if not a.sem_download:
        descarregar()


if __name__ == "__main__":
    main()
