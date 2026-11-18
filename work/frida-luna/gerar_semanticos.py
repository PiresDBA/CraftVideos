#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera no Google Flow os movimentos SEMÂNTICOS que faltam.

Lê animacao/movimentos-semanticos-faltam.json (o que a narração pede) e usa o
gesto descrito em animacao/movimentos-por-fala.json. Cada movimento vira um
prompt detalhado, com a referência aprovada anexada obrigatoriamente e o bloco
de micro-movimentos injectado — exactamente como manda CONTRATO-ANIMACAO.md.

Uso:
  py gerar_semanticos.py --apenas 1        # teste: primeiro movimento
  py gerar_semanticos.py                   # todos os que faltam
  py gerar_semanticos.py --sem-download    # só submeter
  py gerar_semanticos.py --so luna         # só uma personagem
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")
CDP = "http://127.0.0.1:18800"
FETCH = BASE / "flow_fetch_proj.py"
DOWNLOADER = Path(r"C:\Users\Pires\StickFilms\.tools\flow_dl_all.mjs")
PROJETO = "https://flow.google.com/u/0/project/62cb2bc8-7c82-4351-850d-d8453429108e"
REF = {
    "frida": BASE / "chars" / "poses-v3" / "frida" / "happy.png",
    "luna": BASE / "chars" / "poses-v3" / "luna" / "happy.png",
}

# Gesto em inglês, derivado das regras de semantica_narracao.py.
GESTOS = {
    "comer": "lowers its muzzle toward an imaginary bowl and makes small gentle chewing "
             "movements, mouth opening and closing softly, tongue barely showing, ears and "
             "tail following the rhythm",
    "olhar-frente": "turns its head to face the camera and looks straight forward with "
                    "curiosity, eyes bright and attentive, ears perked, a small friendly smile",
    "marcha": "walks forward with alternating steps, one front paw then the other, body "
              "bobbing gently, tail swaying in a relaxed rhythm",
    "salto": "hops with both front paws together, a small light jump and a soft landing, "
             "ears and tail bouncing, happy and playful",
    "corrida": "runs with alternating legs and opposite arm swing, body leaning slightly "
               "forward, ears flopping, energetic and joyful",
    "giro": "turns around about a quarter turn on the spot and returns to the starting "
            "position, a small playful spin with a cheerful expression",
    "sorrir": "breaks into a wide happy smile, eyes shining, cheeks lifting, ears relaxed "
              "and tail wagging, a warm friendly feeling",
    "surpreso": "eyebrows shoot up, eyes open wide, body recoils a little, ears perk up, a "
                "clear surprised expression that then relaxes",
    "escuta": "listens attentively, head slightly tilted, calm breathing, an occasional "
              "blink, alert but relaxed",
    "falar": "mouth opens and closes in short syllables, eyebrows following the rhythm, "
             "attentive and friendly",
}
EMOCOES = {
    "happy": "cheerful and warm",
    "excited": "excited and energetic",
    "surprised": "surprised, then delighted",
    "loved": "affectionate and loving",
    "scared": "timid and cautious",
    "sad": "gentle and a little sad",
}
PERSONAGEM = {
    "frida": "an English bulldog, cream coloured with brown patches and a pearl collar, "
             "draw exactly like the attached reference",
    "luna": "a little brown dachshund with a purple bandana, draw exactly like the "
            "attached reference",
}


def bloco_micro():
    f = BASE / "chars" / "PROMPTS-MICRO-MOVIMENTOS.md"
    if not f.exists():
        return ""
    m = re.search(r"```\s*\n(.*?)\n```", f.read_text(encoding="utf-8"), re.S)
    return m.group(1).strip() if m else ""


def gestos_por_nome():
    """Gesto/emoção que a semântica atribuiu a cada movimento nomeado."""
    plano = json.loads((BASE / "animacao" / "movimentos-por-fala.json").read_text(encoding="utf-8"))
    out = {}
    for b in plano:
        for quem in ("frida", "luna"):
            mov = b.get(quem)
            if mov and mov not in out:
                out[mov] = {"gesto": b.get("gesto", ""), "emocao": b.get("emocao", "happy")}
    return out


def prompt_para(quem, mov, meta):
    gesto = GESTOS.get(mov, meta.get("gesto", "a natural expressive movement"))
    emo = EMOCOES.get(meta.get("emocao", "happy"), "cheerful and warm")
    micro = bloco_micro()
    return (
        "CRITICAL: EVERY IMAGE MUST HAVE A FULLY TRANSPARENT BACKGROUND (real RGBA alpha). "
        "No cream paper, no white, no colour, no ground line, NO SHADOW or oval under the "
        "feet, no border, no text. Deliver the alpha channel intact, do not flatten it.\n\n"
        f"Create ONE sprite sheet of {PERSONAGEM[quem]}, performing this exact action: "
        f"{gesto}. The feeling is {emo}. Keep the SAME face, colours, proportions and "
        "outline as the attached approved reference in every drawing — never a different "
        "character or a different style.\n\n"
        "RULES (apply all):\n"
        "1. ONE horizontal row of exactly 8 evenly spaced drawings of this movement, read "
        "left to right, all the same size, feet on one shared baseline, the 8th drawing "
        "flows smoothly back into the 1st (seamless loop).\n"
        "2. TRUE TRANSPARENT BACKGROUND (RGBA) — no paper, no ground line, NO SHADOW, no "
        "oval under the feet, no border, no text, no numbers. The shadow is added later "
        "by the animation.\n"
        "3. MINIMUM GAP between neighbouring drawings: at least one quarter of a figure's "
        "width of empty transparent space. Figures must NEVER touch or overlap.\n"
        "4. NO frame borders, no labels, no captions.\n\n"
        f"{micro}\n\n"
        "Keep the identity of the attached reference in every one of the 8 drawings."
    )


def rodar(cmd, cwd=None):
    r = subprocess.run(cmd, cwd=str(cwd or BASE), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.returncode, r.stdout + r.stderr


def submeter(quem, mov, meta):
    prompt = prompt_para(quem, mov, meta)
    nome = f"sem-{quem}-{mov}"
    cmd = [sys.executable, "-u", str(FETCH), "--kind", "image", "--no-launch",
           "--submit-only", "--cdp-url", CDP, "--project-dir", str(BASE),
           "--out-dir", str(BASE / "chars" / "folhas"), "--ref-image", str(REF[quem]),
           "--aspect", "16:9", "--wait", "60", "--skip-confirm", "--name", nome,
           "--prompt", prompt]
    rc, log = rodar(cmd)
    ok = "RESUMO 1/1" in log or "prompt enviado" in log
    util = " | ".join(l.strip() for l in log.splitlines()
                      if any(k in l for k in ("ERRO", "falhou:", "RESUMO", "prompt enviado",
                                              "ref-image", "nao conectou")))
    return ok, util[-320:]


def descarregar(n=60):
    destino = BASE / "chars" / "folhas" / "_semanticos"
    destino.mkdir(parents=True, exist_ok=True)
    cmd = ["node", str(DOWNLOADER), PROJETO, str(destino), "--n", str(n),
           "--cdp", CDP, "--hires"]
    rodar(cmd, cwd=DOWNLOADER.parent)
    imgs = sorted(destino.glob("*.webp"))
    print(f"download: {len(imgs)} imagens em {destino}")
    return imgs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apenas", type=int, default=0)
    ap.add_argument("--so", choices=("frida", "luna"), default=None)
    ap.add_argument("--sem-download", action="store_true")
    a = ap.parse_args()

    faltam = json.loads((BASE / "animacao" / "movimentos-semanticos-faltam.json").read_text(encoding="utf-8"))
    metas = gestos_por_nome()
    fila = []
    for quem, movs in faltam.items():
        if a.so and quem != a.so:
            continue
        for mov in sorted(movs):
            fila.append((quem, mov))
    if a.apenas:
        fila = fila[:a.apenas]

    print(f"{len(fila)} movimentos semânticos para gerar:")
    for quem, mov in fila:
        print(f"  {quem:6} {mov}")

    ok_n = 0
    for quem, mov in fila:
        print(f"\n>>> {quem}/{mov} ...", flush=True)
        ok, msg = submeter(quem, mov, metas.get(mov, {}))
        print(("  OK   " if ok else "  FALHOU ") + msg, flush=True)
        ok_n += ok

    print(f"\n{ok_n}/{len(fila)} submissões com sucesso")
    if not a.sem_download and ok_n:
        descarregar()
    return 0 if ok_n else 1


if __name__ == "__main__":
    raise SystemExit(main())
