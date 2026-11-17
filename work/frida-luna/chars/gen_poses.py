"""Gera as 20 expressões de cada personagem como imagem separada (FLUX/FLUX.1-dev via NIM).

Manual de uso
-------------
    py gen_poses.py                 # gera tudo o que faltar (frida + luna)
    py gen_poses.py frida           # só um personagem
    py gen_poses.py luna loved      # só uma expressão
    py gen_poses.py --force         # regera mesmo que o ficheiro já exista

Porque é que não se gera a grelha de uma vez
--------------------------------------------
Duas tentativas de grelha 4x5 num único pedido devolveram (1) 4x4 = 16 células com
sombra no chão e colar de um só pendente, e (2) uma imagem vazia. O FLUX não cumpre
contagens altas de células. Solução: uma imagem por expressão, com o bloco de
personagem *byte a byte igual*, e a grelha é montada depois por compor_grelhas.py —
assim há exactamente 20 células, sem texto, sem linhas e sem molduras.

Saída: chars/_raw/<personagem>/<expressao>.png (1024x1216, fundo creme)
"""
from __future__ import annotations

import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "_raw"
GEN = HERE.parent / "gen_nvidia.py"

# ---------------------------------------------------------------- expressões
# (id, frase de pose/expressão) — a ordem e os nomes são o contrato do manifesto.
EXPRESSOES = [
    ("happy",       "smiling big open happy smile, tongue slightly visible, eyes sparkling, tail up"),
    ("sad",         "sad face, drooping ears, one single big tear falling from the eye, mouth turned down"),
    ("angry",       "angry face, eyebrows pushed down hard, teeth showing in a growl, ears back"),
    ("excited",     "super excited, mouth wide open in a cheer, both arms raised up, eyes wide and bright"),
    ("scared",      "terrified, eyes huge and round, pupils tiny, body shivering, ears flat down, mouth wobbly"),
    ("tired",       "very tired, heavy eyelids almost shut, wide open yawn, head drooping to one side, ears limp"),
    ("confused",    "confused, head tilted to one side, one eyebrow raised high, mouth a twisted squiggle, mouth closed with no tongue showing, ears uneven"),
    ("proud",       "proud, chest puffed out, chin up, eyes closed with satisfaction, small confident smile"),
    ("surprised",   "surprised, mouth in a round O, eyebrows very high, eyes popped wide open"),
    ("shy",         "shy, looking down and away, big pink blush on both cheeks, paws held together in front"),
    ("silly",       "silly playful face, winking one eye, cheerful open grin with the tongue hanging out of the side of the mouth, ears flipped up"),
    ("sick",        "sick, coat turned pale yellow-green, dizzy spiral eyes, one big sweat drop on the forehead, wavy unhappy mouth"),
    ("worried",     "worried, eyebrows raised in the middle, biting the lip, small sweat drop, paws fidgeting"),
    ("mischievous", "mischievous, sly sideways grin, one eyebrow raised, eyes narrowed and plotting"),
    ("loved",       "in love, both eyes drawn as big red heart shapes, huge happy smile, heavy pink blush on the cheeks"),
    ("bored",       "bored, flat half lidded eyes, mouth a straight line, head resting on one paw"),
    ("grumpy",      "grumpy, pouting scowl, bottom lip out, arms crossed, eyebrows low"),
    ("jealous",     "jealous, side eye glare to the side, one eyebrow down, mouth twisted, ears slightly back"),
    ("calm",        "calm and peaceful, eyes gently closed, soft small smile, relaxed shoulders"),
    ("lovestruck",  "lovestruck and dreamy, soft swooning eyes looking up, goofy happy smile, blushing cheeks, one small pink heart floating beside the head"),
]

# ------------------------------------------------------------------- estilo
# Bloco de estilo: idêntico em todas as chamadas. Insiste no traço grosso e no
# cel-shading plano porque o FLUX foge para o 3D suave / render com brilho.
ESTILO = (
    "Flat 2D hand-drawn cartoon character art for a children's animation, thick uniform dark brown ink outline, "
    "flat solid colour fills, exactly one flat cel shadow tone per colour, simple rounded shapes, big head, "
    "short body, absolutely no 3D render, no airbrush, no gradient, no gloss highlight, no outline glow, "
    "NO white die-cut border, NO sticker edge, NO drop shadow, NO cast shadow, NO grey ellipse under the feet, "
    "plain flat cream paper background reaching the edges of the image, one single character alone, "
    "standing upright facing the viewer on all four short legs, both arms hanging at the sides, "
    "tail visible, full body from head to paws, centred, generous empty cream margin. "
    "No text, no letters, no numbers, no speech bubble, no watermark, no frame, no border."
)

PERSONAGENS = {
    "frida": (
        "The character is a short chubby English bulldog puppy girl: caramel-brown coat, a wide cream stripe "
        "running down the middle of her face, cream muzzle, cream chest and round belly, dark brown droopy floppy "
        "ears, big round black eyes, pink oval blush on the cheeks, big black nose with two nostrils, short wrinkly "
        "snout, a pearl necklace of many small round white pearls around her neck, four short sturdy legs with cream "
        "paws, tiny arms at her sides, short curled tail."
    ),
    "luna": (
        "The character is a small dachshund sausage dog puppy: warm brown coat, lighter tan belly and muzzle, a very "
        "long body on four very short legs, extremely long droopy ears hanging to the shoulders, a little tuft of "
        "three hairs standing up on top of the head, big round black eyes, big black nose, small pink tongue, "
        "a purple triangular bandana tied around her neck, long thin tail curving up, tiny arms at her sides."
    ),
}


def gerar(personagem: str, expr: str, frase: str, force: bool = False) -> tuple[str, bool]:
    out = RAW / personagem / f"{expr}.png"
    if out.exists() and not force:
        return f"skip {personagem}/{expr}", True
    prompt = f"{PERSONAGENS[personagem]} Expression: {frase}. {ESTILO}"
    for tent in range(1, 4):
        r = subprocess.run(
            [sys.executable, str(GEN), str(out), prompt, "--w", "1024", "--h", "1216"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if r.returncode == 0 and out.exists() and out.stat().st_size > 20_000:
            return f"ok   {personagem}/{expr} ({out.stat().st_size // 1024} KB)", True
        print(f"  retry {tent} {personagem}/{expr}: {r.stdout.strip()[:160]}", flush=True)
        time.sleep(3 * tent)
    return f"FAIL {personagem}/{expr}", False


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    alvos = args[0].split(",") if args and args[0] in PERSONAGENS else list(PERSONAGENS)
    filtro = {a for a in args[1:] if a}

    jobs = [(p, e, f) for p in alvos for e, f in EXPRESSOES if not filtro or e in filtro]
    RAW.mkdir(parents=True, exist_ok=True)
    print(f"{len(jobs)} imagens, 3 em paralelo", flush=True)

    falhas = 0
    # 3 workers: o NIM aceita concorrência moderada; mais que isso começa a dar 429.
    with ThreadPoolExecutor(max_workers=3) as pool:
        for msg, ok in pool.map(lambda j: gerar(*j, force=force), jobs):
            print(msg, flush=True)
            falhas += not ok
    print(f"falhas: {falhas}")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
