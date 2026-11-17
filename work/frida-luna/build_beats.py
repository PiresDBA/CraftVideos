"""Gera o beat sheet do video 'O Parque dos Pets' a partir da transcricao.

Fonte:  ref/words.json  (faster-whisper, 44 segmentos)
Saida:  beats.json + BEAT-SHEET.md

Cada frase recebe: cena, quem fala, pose da Frida, pose da Luna, fundo e movimento de camara.
As poses usam o vocabulario das folhas de expressao (Frida: 20+ poses; Luna: 20 expressoes).
Os tempos vem sempre da transcricao - nunca escritos a mao.
"""
import json
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")
words = json.loads((BASE / "ref" / "words.json").read_text(encoding="utf-8"))
segs = words["segments"]

# linha -> (cena, falante, pose_frida, pose_luna, accao)
PLAN = {
    1:  ("hook",     "narrador", "surprised",  "excited",    "cartao de titulo: interrogacao grande"),
    2:  ("hook",     "narrador", "excited",    "happy",      "montanha-russa de ossinho desenhada a aparecer"),
    3:  ("hook",     "narrador", "silly",      "excited",    "rodape a correr, letras a saltar"),
    4:  ("abertura", "frida",    "happy",      "happy",      "as duas a entrar em quadro"),
    5:  ("abertura", "frida",    "loved",      "shy",        "abraco de boas-vindas"),
    6:  ("abertura", "narrador", "proud",      "excited",    "apresentacao: as duas lado a lado"),
    7:  ("portao",   "narrador", "calm",       "curious",    "caminhada distraida, fundo de parque"),
    8:  ("portao",   "narrador", "surprised",  "surprised",  "letreiro 'Parque dos Petes' a entrar"),
    9:  ("portao",   "narrador", "happy",      "jump",       "Luna a dar pulinhos de alegria"),
    10: ("portao",   "narrador", "loved",      "loved",      "brilhos a volta das duas"),
    11: ("montanha", "narrador", "surprised",  "excited",    "Frida olha para a montanha-russa de biscoitos"),
    12: ("montanha", "narrador", "excited",    "happy",      "carrinho em forma de osso a chegar"),
    13: ("montanha", "narrador", "proud",      "happy",      "Frida ajeita as orelhas e chama a Luna"),
    14: ("montanha", "frida",    "mischievous","silly",      "fala da Frida: 'vamos ver quem chega primeiro'"),
    15: ("montanha", "narrador", "excited",    "excited",    "as duas a correr para o carrinho"),
    16: ("montanha", "narrador", "scared",     "scared",     "arranque: linhas de velocidade no fundo"),
    17: ("montanha", "narrador", "excited",    "silly",      "Luna a latir, orelhas a voar"),
    18: ("montanha", "narrador", "excited",    "excited",    "texto 'que velocidade maluca!'"),
    19: ("roda",     "narrador", "calm",       "curious",    "roda gigante de potinhos de racao"),
    20: ("roda",     "narrador", "surprised",  "surprised",  "cabines em forma de tigela colorida"),
    21: ("roda",     "narrador", "loved",      "silly",      "Frida a babar de vontade"),
    22: ("roda",     "frida",    "happy",      "excited",    "fala da Frida: 'da para ver o parque inteiro'"),
    23: ("carrossel","narrador", "happy",      "happy",      "carrossel magico a girar"),
    24: ("carrossel","narrador", "excited",    "loved",      "almofadas gigantes e pelucias de roedores"),
    25: ("carrossel","narrador", "silly",      "silly",      "Luna tenta morder o ar"),
    26: ("carrossel","luna",     "happy",      "confused",   "fala da Luna: 'girar da uma tontura boa'"),
    27: ("bolinhas", "narrador", "surprised",  "surprised",  "piscina de bolinhas de tenis amarelas"),
    28: ("bolinhas", "narrador", "excited",    "excited",    "Frida mergulha de barriga"),
    29: ("bolinhas", "narrador", "silly",      "happy",      "Frida aparece com uma bolinha na boca"),
    30: ("tunel",    "narrador", "happy",      "excited",    "tunel de grama com luzinhas"),
    31: ("tunel",    "narrador", "surprised",  "silly",      "Luna sai com o focinho sujo de terra"),
    32: ("tunel",    "narrador", "happy",      "proud",      "Luna como 'topeira charmosa'"),
    33: ("espelhos", "narrador", "calm",       "curious",    "casa dos espelhos"),
    34: ("espelhos", "narrador", "surprised",  "silly",      "reflexo com cabeca de melancia"),
    35: ("espelhos", "narrador", "excited",    "happy",      "Frida late ao proprio reflexo"),
    36: ("moral",    "narrador", "calm",       "calm",       "fundo por do sol, as duas juntas"),
    37: ("moral",    "narrador", "loved",      "loved",      "abraco, coracoes a subir"),
    38: ("moral",    "narrador", "loved",      "loved",      "texto: 'a amizade e o melhor presente'"),
    39: ("final",    "narrador", "happy",      "happy",      "cartao final"),
    40: ("final",    "narrador", "happy",      "happy",      "as duas a acenar"),
    41: ("final",    "narrador", "loved",      "shy",        "aceno de agradecimento"),
    42: ("final",    "narrador", "excited",    "excited",    "botoes like / inscrever a aparecer"),
    43: ("final",    "narrador", "loved",      "loved",      "beijo para a camera"),
    44: ("final",    "narrador", "happy",      "happy",      "seta para o proximo video"),
}

SCENES = {
    "hook":      {"bg": "cartao de titulo, fundo creme, particulas", "cam": "push-in lento"},
    "abertura":  {"bg": "entrada do parque, ceu claro", "cam": "fixa"},
    "portao":    {"bg": "portao grande de madeira e letreiro", "cam": "pan esquerda->direita"},
    "montanha":  {"bg": "montanha-russa de biscoitos, nuvens", "cam": "push-in + tilt up"},
    "roda":      {"bg": "roda gigante de tigelas, tarde", "cam": "tilt up lento"},
    "carrossel": {"bg": "carrossel com pelucias, luzes quentes", "cam": "orbita curta"},
    "bolinhas":  {"bg": "piscina de bolinhas amarelas", "cam": "fixa, zoom leve"},
    "tunel":     {"bg": "tunel de grama com luzinhas", "cam": "travelling lateral"},
    "espelhos":  {"bg": "casa dos espelhos, reflexos", "cam": "fixa com wobble"},
    "moral":     {"bg": "por do sol, silhuetas do parque", "cam": "push-in lento"},
    "final":     {"bg": "cartao final, coracoes", "cam": "fixa"},
}

beats = []
for i, s in enumerate(segs, 1):
    scene, speaker, pf, pl, action = PLAN[i]
    beats.append({
        "i": i,
        "t0": s["start"],
        "t1": s["end"],
        "dur": round(s["end"] - s["start"], 2),
        "scene": scene,
        "speaker": speaker,
        "text": s["text"],
        "frida": pf,
        "luna": pl,
        "action": action,
        "bg": SCENES[scene]["bg"],
        "cam": SCENES[scene]["cam"],
    })

(BASE / "beats.json").write_text(json.dumps({
    "video": "O Parque dos Pets",
    "source": "https://www.youtube.com/watch?v=1kxFAThSKas",
    "duration": words["duration"],
    "audio": "ref/audio.wav",
    "characters": {
        "frida": "Bulldog ingles, creme, colar de perolas",
        "luna": "Salsicha (dachshund), castanho, bandana roxa",
    },
    "beats": beats,
}, ensure_ascii=False, indent=1), encoding="utf-8")

# ---- resumo legivel, agrupado por cena
lines = ["# O Parque dos Pets — beat sheet", "",
         f"Fonte: {words['duration']:.1f} s · {len(beats)} frases · áudio original reaproveitado", ""]
order = []
for b in beats:
    if not order or order[-1][0] != b["scene"]:
        order.append([b["scene"], []])
    order[-1][1].append(b)
for scene, items in order:
    t0, t1 = items[0]["t0"], items[-1]["t1"]
    lines.append(f"## {scene} — {t0:6.1f}s → {t1:6.1f}s ({t1-t0:5.1f}s)")
    lines.append(f"*{SCENES[scene]['bg']} · câmara: {SCENES[scene]['cam']}*")
    lines.append("")
    lines.append("| t | quem | fala | Frida | Luna | acção |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for b in items:
        txt = b["text"].replace("|", "/")
        lines.append(f"| {b['t0']:.1f} | {b['speaker']} | {txt} | {b['frida']} | {b['luna']} | {b['action']} |")
    lines.append("")
(BASE / "BEAT-SHEET.md").write_text("\n".join(lines), encoding="utf-8")

print(f"{len(beats)} beats | cenas: {len(order)} | dur {words['duration']:.1f}s")
print("poses distintas — frida:", len({b['frida'] for b in beats}), "luna:", len({b['luna'] for b in beats}))
