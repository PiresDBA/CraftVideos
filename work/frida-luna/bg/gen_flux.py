"""Fundos do episodio via FLUX.1-dev (NVIDIA NIM).

Porque FLUX: o SD1.5 do ComfyUI entregava cenarios rasos e com cara de rascunho.
O FLUX ja provou nestes personagens, e aceita o mesmo estilo.

Sem personagens e sem texto em nenhum prompt (a tipografia entra em pos).
Uso: py gen_flux.py [--only cena1 cena2 ...]
"""
import subprocess
import sys
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")
GEN = BASE / "gen_nvidia.py"
OUT = BASE / "bg" / "flux"
OUT.mkdir(parents=True, exist_ok=True)

ESTILO = ("Bright and joyful children's storybook illustration for toddlers, hand-drawn 2D cartoon style. "
          "Vivid, saturated, cheerful colors: sunny bright green grass, vivid sky blue, warm sunny yellow, "
          "cheerful orange and cherry red. Thick soft dark-brown outlines, clean flat shapes, crisp fresh look, "
          "playful happy mood. Not faded, not pastel, not vintage, not muted. "
          "No people. No animals. No text. No letters. No logos. ")

CENAS = {
    "hook": "A wide magical amusement park seen from the entrance path at golden hour, colourful flags and bunting, distant ferris wheel and roller coaster, soft clouds, lots of empty sky for a title.",
    "abertura": "A cheerful amusement park entrance: a wide sandy path leading between rounded green trees, small lamp posts and flower beds, a distant carousel, bright morning light.",
    "portao": "A big rustic wooden gate in a park fence, a large blank wooden signboard hanging above it, a stone path running under the gate towards a sunny park, pebbles and grass at the sides.",
    "montanha": "A candy roller coaster made of giant chocolate-chip cookies, with a bone-shaped cart on the rails, tall wooden supports, fluffy white clouds, green hills behind.",
    "roda": "A big ferris wheel whose cabins are colourful pet food bowls, seen from below against a soft afternoon sky, grass and small flowers at the base.",
    "carrossel": "A magical carousel with a striped canopy, giant soft cushions instead of horses, plush toy mice and squirrels on poles, strings of warm bulbs, sand circle at the base.",
    "bolinhas": "A huge ball pit full of bright yellow tennis balls, seen slightly from above, a low wooden edge around it, a few balls spilled on the grass, soft park light.",
    "tunel": "A tunnel made of curved green hedges and grass arcs, strings of small colourful fairy lights hanging inside, a light circle at the end, sandy floor.",
    "espelhos": "A mirror house interior: three tall wavy funfair mirrors in ornate wooden frames on a cream wall, a checkered floor, warm light, playful distortions.",
    "moral": "A peaceful sunset over an amusement park, orange and pink sky, dark silhouettes of the ferris wheel and trees in the distance, green meadow in the foreground.",
    "final": "A cozy end card: cream paper background with small hand-drawn hearts, paper bunting and confetti, a soft vignette, plenty of empty space in the middle.",
}


def main():
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1:])

    for name, prompt in CENAS.items():
        if only and name not in only:
            continue
        dest = OUT / f"{name}.png"
        if dest.exists() and not only:
            print(f"skip {name} (existe)")
            continue
        r = subprocess.run([sys.executable, str(GEN), str(dest), ESTILO + prompt, "--w", "1344", "--h", "768"],
                           capture_output=True, text=True)
        line = (r.stdout or r.stderr).strip().splitlines()
        print(f"{name}: {line[-1] if line else 'sem saida'}")


if __name__ == "__main__":
    main()
