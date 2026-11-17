#!/usr/bin/env python
# -*- coding: utf-8 -*-
r"""
===============================================================================
 gerar_fundos.py  -  Especialista-ComfyUI / cadeia Frida & Luna
===============================================================================

 MANUAL DE UTILIZACAO
 --------------------
 Gera os 11 FUNDOS de "O Parque dos Pets" (196,07 s, 30 fps) a partir do
 sequence-plan.json, sem personagens e sem texto. Uma imagem de cada vez:
 a GTX 1060 tem 6 GB de VRAM, por isso a fila e' estritamente sequencial e o
 modelo e' descarregado (/free) entre imagens.

 Falar com a API do ComfyUI, nunca com a UI:
     POST /prompt          -> devolve prompt_id
     GET  /history/<id>    -> estado + lista de ficheiros produzidos
     GET  /view            -> bytes do PNG
     POST /free            -> liberta VRAM (unload_models + free_memory)
     GET  /system_stats    -> pre-voo: confirma que o servidor responde

 USO
 ---
   py gerar_fundos.py                    # gera os 11 fundos que faltam
   py gerar_fundos.py --only montanha    # so a cena indicada (pode repetir)
   py gerar_fundos.py --force            # reescreve ficheiros ja existentes
   py gerar_fundos.py --list             # mostra o plano, nao gera nada
   py gerar_fundos.py --no-free          # nao descarrega o modelo entre imagens
   py gerar_fundos.py --tint             # aplica a temperatura da STYLE-BIBLE 2.3
                                         # (por omissao NAO aplica: essa camada
                                         # vive no Remotion, aplica-la aqui duplicava-a)
   py gerar_fundos.py --passos 28 --cfg 7 --forca-lora 0.85
                                         # afinacao (probes rapidos com
                                         # --largura 896 --altura 512 --passos 16)
   py gerar_fundos.py --server http://127.0.0.1:8188

 DOIS METODOS, E PORQUE
 ---------------------
   9 cenarios (abertura -> moral) : ComfyUI, SD 1.5 + LoRA childrens-picture-book-sd15
                                    a 0.85, 28 steps, cfg 7, seed fixa por cena.
   2 cartoes (hook, final)        : desenhados por codigo em PIL (`desenhar_cartao`).
                                    O SD 1.5 escrevia texto falso no cartao
                                    ("PAARES TANE"), assinava o canto e chegou a
                                    inventar animais no cartao final. Num cartao
                                    de titulo isso e' defeito fatal, e a
                                    STYLE-BIBLE 8 permite fundos desenhados em
                                    Python. Aqui as cores saem exactas e o
                                    cartao nasce sem letras por construcao.

 PRECONDICOES
 ------------
   * ComfyUI a correr com --lowvram em http://127.0.0.1:8188
   * checkpoints : dreamshaper_8.safetensors (SD 1.5)
   * loras       : childrens-picture-book-sd15.safetensors
                   -> aprovado SO PARA FUNDOS/TEXTURAS. Para personagem foi
                      reprovado e continua proibido (regra de ouro #6).

 SAIDA
 -----
   bg/fundo-*.png      1344x768, PNG
   bg/manifest.json    cena, prompt, seed, ficheiro, tamanho em px e bytes

 NOMES: descritivos (fundo-montanha-biscoitos.png), nunca cena4.png.
===============================================================================
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

# ----------------------------------------------------------------------------
# Caminhos e constantes
# ----------------------------------------------------------------------------

AQUI = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(AQUI, "manifest.json")

SERVIDOR_PADRAO = "http://127.0.0.1:8188"
CHECKPOINT = "dreamshaper_8.safetensors"
LORA_INFANTIL = "childrens-picture-book-sd15.safetensors"

LARGURA, ALTURA = 1344, 768      # 16:9 aproximado, ~1,03 MP (zona segura SD 1.5)
PASSOS = 28                      # 25-30 pedido; 28 e' o ponto do LoRA
CFG = 6.5

SAMPLER = "dpmpp_2m"
SCHEDULER = "karras"
FORCA_LORA = 0.75                # vale so para fundos

# Ajustes mutaveis pela linha de comandos (probes rapidos sem tocar no codigo).
AJUSTES = {"passos": PASSOS, "cfg": CFG, "forca_lora": FORCA_LORA}

# Assinatura visual comum a todos os fundos (STYLE-BIBLE 0, 2.1, 2.5, 8).
# Repetida em todos os prompts porque o CLIP nao "lembra" nada entre chamadas.
ESTILO = (
    "children's picture book illustration, storybook art, 2D cartoon background painting, "
    "flat solid colour shapes, bold thick dark brown ink outline around every shape, "
    "hand drawn wobbly line, warm limited palette: pale cream paper, olive green foliage, "
    "warm brown wood, sand and amber accents only, matte gouache look, no airbrush"
)

SEM_GENTE = (
    "empty background plate, uninhabited scenery, nobody there, "
    "no characters, no animals, no dogs, no people, no faces, "
    "no text, no letters, no words, no numbers, no watermark, no signature"
)

NEGATIVO = (
    "people, person, human, human figure, character, creature, animal, dog, puppy, cat, "
    "bird, child, children, crowd, silhouette of a person, small figure walking, "
    "text, letters, words, typography, caption, signage lettering, watermark, signature, "
    "artist signature, handwriting, logo, "
    "photograph, photography, product mockup, flat lay, paper craft, origami, stationery, "
    "3d render, octane render, raytracing, photorealistic, cgi, "
    "depth of field, bokeh, ambient occlusion, heavy gradient, gradient mesh, "
    "desaturated, cold blue grey, neon, cyberpunk, blurry, low quality, jpeg artifacts, "
    "frame border, vignette border, black bars, cropped"
)

# Supressoes por cena: o SD 1.5 ignora negacoes genericas, por isso cada cena
# recebe os objectos concretos que nao pode inventar.
EXTRA = {
    "hook": "twine, rope, string, thread, ribbon, tag, label, frame, picture frame, "
            "tree, landscape, horizon, hill, grass, ground, hanging objects, pods",
    "abertura": "fence, picket fence, wall, stone arch, columns, signature",
    "portao": "stone arch, roman arch, marble column, brick, metal gate, "
              "signature, initials, engraved letters",
    "montanha": "cart, roller coaster car, people riding, wrist watch, candy bar wrapper, signature",
    "roda": "cart, people riding, tickets, balloon, signature",
    "carrossel": "horses, real horse, people riding, ticket booth, signature",
    "bolinhas": "bathtub, water, pool tiles, balls with letters, signature",
    "tunel": "cave, rock, stone, brick, night, signature",
    "espelhos": "clown, circus, people reflected, doorway, signature",
    "moral": "characters, buildings with windows lit, moon, night sky, signature",
    "final": "twine, rope, string, ribbon, gift, tag, label, frame, picture frame, "
             "food, fruit, sausage, shadow of an object, tree, landscape, horizon, "
             "hill, grass, ground",
}

# ----------------------------------------------------------------------------
# Os 11 fundos (ordem = sequence-plan.json). seed fixa por cena.
# ----------------------------------------------------------------------------

CENAS = [
    {
        "scene": "hook",
        "ficheiro": "fundo-cartao-titulo.png",
        "metodo": "cartao-pil",
        "seed": 110126,
        "temperatura": {"cor": "#FFF1DC", "opacidade": 0.08, "nota": "manha de papel"},
        "prompt": (
            "seamless cream paper texture background, warm ivory sheet, "
            "sparse small amber and olive confetti dots printed on the paper, "
            "flat lay, soft even light, no objects, empty middle"
        ),
    },
    {
        "scene": "abertura",
        "ficheiro": "fundo-entrada-parque.png",
        "seed": 220237,
        "temperatura": {"cor": "#FFF6E6", "opacidade": 0.06, "nota": "manha clara"},
        "prompt": (
            "the entrance of a friendly cartoon pet park seen from the path, "
            "olive green lawn and round bushes in the foreground, "
            "round fluffy trees with layered flat olive canopies, "
            "a dirt path leading forward between the bushes, "
            "pale cream paper sky with a few soft white clouds high above, "
            "a distant empty archway at the horizon with no lettering"
        ),
    },
    {
        "scene": "portao",
        "ficheiro": "fundo-portao-madeira.png",
        "seed": 330348,
        "temperatura": {"cor": "#FCEFD8", "opacidade": 0.08, "nota": "manha tardia"},
        "prompt": (
            "a large wooden park gate made of thick warm brown planks, wide open, "
            "two round topped wooden posts, a plain blank wooden sign board above it "
            "with no writing at all, "
            "dirt path with small pebbles running through the gate, "
            "morning light, olive green trees behind, pale cream paper sky"
        ),
    },
    {
        "scene": "montanha",
        "ficheiro": "fundo-montanha-biscoitos.png",
        "seed": 440459,
        "temperatura": {"cor": "#FFF3DE", "opacidade": 0.04, "nota": "meio-dia alto"},
        "prompt": (
            "a cartoon roller coaster built out of chocolate biscuits, "
            "long wavy biscuit track with cream filling layers and sprinkles, "
            "biscuit support towers, looping high over olive green grass, "
            "big soft white clouds in a bright paper sky, "
            "high noon light, wide establishing shot, empty track with no cart and no rider"
        ),
    },
    {
        "scene": "roda",
        "ficheiro": "fundo-roda-tigelas.png",
        "seed": 550560,
        "temperatura": {"cor": "#FFE3B8", "opacidade": 0.12, "nota": "tarde dourada"},
        "prompt": (
            "a giant cartoon ferris wheel whose cabins are pet food bowls, "
            "round amber bowls dangling on slim spokes, warm brown structure, "
            "seen from below against a golden late afternoon paper sky, "
            "olive green grass and a low hedge at the base, "
            "golden hour light, empty cabins, no riders"
        ),
    },
    {
        "scene": "carrossel",
        "ficheiro": "fundo-carrossel-pelucias.png",
        "seed": 660671,
        "temperatura": {"cor": "#FFCF9E", "opacidade": 0.16, "nota": "fim de tarde quente"},
        "prompt": (
            "a small cartoon carousel with plush toy seats, "
            "plush bear and plush rabbit shapes as seats, striped amber and cream canopy roof, "
            "little warm glowing bulbs hanging along the rim, "
            "warm brown painted poles, olive green grass around, "
            "late afternoon warm light, empty seats, no riders, no children"
        ),
    },
    {
        "scene": "bolinhas",
        "ficheiro": "fundo-piscina-bolinhas.png",
        "seed": 770782,
        "temperatura": {"cor": "#FFF0C8", "opacidade": 0.08, "nota": "amarelo reflectido"},
        "prompt": (
            "a big ball pit full of round yellow and amber plastic balls, "
            "hundreds of flat coloured spheres stacked and spilling over a low "
            "padded cream wall, warm yellow bounce light, "
            "plain cream paper wall behind, close wide shot, "
            "empty pit, no children, no animals"
        ),
    },
    {
        "scene": "tunel",
        "ficheiro": "fundo-tunel-grama.png",
        "seed": 880893,
        "temperatura": {"cor": "#D9C79E", "opacidade": 0.18, "nota": "sombra de relva"},
        "prompt": (
            "a tunnel made of tall grass and woven branches, "
            "a row of round arches formed by green grass blades and olive foliage, "
            "small warm string lights with tiny glowing bulbs hung along the tunnel, "
            "sunlight filtering through at the far end, "
            "packed dirt floor, deep green shadow, empty tunnel, no characters"
        ),
    },
    {
        "scene": "espelhos",
        "ficheiro": "fundo-casa-espelhos.png",
        "seed": 990904,
        "temperatura": {"cor": "#C9BBA6", "opacidade": 0.22, "nota": "interior neutro"},
        "prompt": (
            "the inside of a fairground house of mirrors, "
            "several tall wavy distorting mirrors in ornate warm brown frames leaning "
            "against a plain cream wall, reflections of the room inside the glass, "
            "a checkered cream and sand floor, a low wooden bench, "
            "dim neutral interior light, empty room, no characters, no reflections of people"
        ),
    },
    {
        "scene": "moral",
        "ficheiro": "fundo-por-do-sol.png",
        "seed": 1010015,
        "temperatura": {"cor": "#FFB877", "opacidade": 0.26, "nota": "por-do-sol"},
        "prompt": (
            "a warm sunset over a cartoon pet park, "
            "solid amber orange sky bands with a big low sun disc, "
            "dark warm brown flat silhouettes of the ferris wheel, the roller coaster and "
            "round trees along the horizon, olive green foreground grass, "
            "silhouettes are solid masses with no outlines, empty landscape, no characters"
        ),
    },
    {
        "scene": "final",
        "ficheiro": "fundo-cartao-final.png",
        "metodo": "cartao-pil",
        "seed": 1111126,
        "temperatura": {"cor": "#F7DCC0", "opacidade": 0.14, "nota": "cartao final ambar"},
        "prompt": (
            "seamless warm amber paper texture background, honey coloured sheet, "
            "a few small flat red orange heart shapes printed on the paper, "
            "flat lay, soft even light, no objects, empty middle"
        ),
    },
]


# ----------------------------------------------------------------------------
# Cliente HTTP minimo (stdlib apenas - sem requests)
# ----------------------------------------------------------------------------

class ErroComfy(Exception):
    """Falha explicita da API do ComfyUI. Nunca se disfarca de sucesso."""


def pedir(servidor, caminho, dados=None, metodo=None, timeout=120):
    url = servidor.rstrip("/") + caminho
    corpo = None
    cabecalhos = {}
    if dados is not None:
        corpo = json.dumps(dados).encode("utf-8")
        cabecalhos["Content-Type"] = "application/json"
    pedido = urllib.request.Request(url, data=corpo, headers=cabecalhos, method=metodo)
    try:
        with urllib.request.urlopen(pedido, timeout=timeout) as resposta:
            return resposta.read()
    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", "replace")[:2000]
        raise ErroComfy("HTTP %s em %s -> %s" % (erro.code, caminho, detalhe)) from None
    except urllib.error.URLError as erro:
        raise ErroComfy("servidor inacessivel em %s -> %s" % (url, erro.reason)) from None


def pedir_json(servidor, caminho, dados=None, timeout=120):
    bruto = pedir(servidor, caminho, dados=dados, timeout=timeout)
    if not bruto:
        return {}
    return json.loads(bruto.decode("utf-8"))


def pre_voo(servidor):
    """Confirma servidor, VRAM e checkpoints antes de gastar 15 minutos."""
    info = pedir_json(servidor, "/system_stats", timeout=30)
    aparelho = (info.get("devices") or [{}])[0]
    total = aparelho.get("vram_total", 0) / (1024 ** 3)
    livre = aparelho.get("vram_free", 0) / (1024 ** 3)
    print("[pre-voo] ComfyUI %s | %s | VRAM %.2f/%.2f GB livres"
          % (info.get("system", {}).get("comfyui_version", "?"),
             aparelho.get("name", "?"), livre, total))
    if total and total < 6.5:
        print("[pre-voo] AVISO: VRAM abaixo de 6 GB; manter uma imagem de cada vez.")

    checkpoints = pedir_json(servidor, "/object_info/CheckpointLoaderSimple", timeout=30)
    disponiveis = checkpoints["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
    if CHECKPOINT not in disponiveis:
        raise ErroComfy("checkpoint %r ausente. Disponiveis: %s"
                        % (CHECKPOINT, ", ".join(disponiveis)))

    loras = pedir_json(servidor, "/object_info/LoraLoader", timeout=30)
    lora_ok = LORA_INFANTIL in loras["LoraLoader"]["input"]["required"]["lora_name"][0]
    print("[pre-voo] checkpoint %s | LoRA infantil %s"
          % (CHECKPOINT, "presente" if lora_ok else "AUSENTE (gera sem LoRA)"))
    return lora_ok


# ----------------------------------------------------------------------------
# Grafo de workflow (API format, SD 1.5)
# ----------------------------------------------------------------------------

def construir_workflow(cena, largura, altura, usar_lora):
    positivo = "%s. %s. %s" % (cena["prompt"], ESTILO, SEM_GENTE)
    negativo = NEGATIVO
    if EXTRA.get(cena["scene"]):
        negativo = "%s, %s" % (EXTRA[cena["scene"]], NEGATIVO)

    grafo = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT},
        },
    }

    origem_modelo, origem_clip = ["1", 0], ["1", 1]

    if usar_lora:
        grafo["6"] = {
            "class_type": "LoraLoader",
            "inputs": {
                "model": ["1", 0],
                "clip": ["1", 1],
                "lora_name": LORA_INFANTIL,
                "strength_model": AJUSTES["forca_lora"],
                "strength_clip": AJUSTES["forca_lora"],
            },
        }
        origem_modelo, origem_clip = ["6", 0], ["6", 1]

    grafo["2"] = {
        "class_type": "CLIPTextEncode",
        "inputs": {"clip": origem_clip, "text": positivo},
    }
    grafo["3"] = {
        "class_type": "CLIPTextEncode",
        "inputs": {"clip": origem_clip, "text": negativo},
    }
    grafo["4"] = {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": largura, "height": altura, "batch_size": 1},
    }
    grafo["5"] = {
        "class_type": "KSampler",
        "inputs": {
            "model": origem_modelo,
            "positive": ["2", 0],
            "negative": ["3", 0],
            "latent_image": ["4", 0],
            "seed": cena["seed"],
            "steps": AJUSTES["passos"],
            "cfg": AJUSTES["cfg"],
            "sampler_name": SAMPLER,
            "scheduler": SCHEDULER,
            "denoise": 1.0,
        },
    }
    grafo["7"] = {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
    }
    grafo["8"] = {
        "class_type": "SaveImage",
        "inputs": {"images": ["7", 0], "filename_prefix": "frida-luna-%s" % cena["scene"]},
    }
    return grafo, positivo


# ----------------------------------------------------------------------------
# Fila: submeter, esperar, descarregar
# ----------------------------------------------------------------------------

def submeter(servidor, grafo, cliente):
    resposta = pedir_json(servidor, "/prompt", dados={"prompt": grafo, "client_id": cliente})
    if "prompt_id" not in resposta:
        raise ErroComfy("/prompt recusou o grafo: %s" % json.dumps(resposta)[:1500])
    if resposta.get("node_errors"):
        raise ErroComfy("/prompt devolveu node_errors: %s"
                        % json.dumps(resposta["node_errors"])[:1500])
    return resposta["prompt_id"]


def esperar(servidor, prompt_id, limite_s=900, intervalo_s=3):
    inicio = time.time()
    while time.time() - inicio < limite_s:
        historico = pedir_json(servidor, "/history/%s" % prompt_id, timeout=60)
        registo = historico.get(prompt_id)
        if registo:
            estado = (registo.get("status") or {}).get("status_str", "?")
            if estado == "error" or (registo.get("status") or {}).get("completed") is False:
                raise ErroComfy("execucao %s terminou em erro: %s"
                                % (prompt_id, json.dumps(registo.get("status"))[:1500]))
            saidas = (registo.get("outputs") or {})
            ficheiros = []
            for no in saidas.values():
                for imagem in no.get("images", []):
                    ficheiros.append(imagem)
            if ficheiros:
                return ficheiros
        time.sleep(intervalo_s)
    raise ErroComfy("timeout de %ss a espera de %s" % (limite_s, prompt_id))


def descarregar(servidor, imagem):
    consulta = urllib.parse.urlencode({
        "filename": imagem["filename"],
        "subfolder": imagem.get("subfolder", ""),
        "type": imagem.get("type", "output"),
    })
    return pedir(servidor, "/view?" + consulta, timeout=180)


def libertar_vram(servidor):
    """POST /free: descarrega modelos e cache. Sequencial, nunca em paralelo."""
    try:
        pedir(servidor, "/free", dados={"unload_models": True, "free_memory": True}, timeout=120)
        return True
    except ErroComfy as erro:
        print("[vram] aviso: /free falhou -> %s" % erro)
        return False


def tamanho_png(caminho):
    """Le largura/altura do IHDR sem depender de Pillow."""
    with open(caminho, "rb") as ficheiro:
        cabecalho = ficheiro.read(24)
    if len(cabecalho) < 24 or cabecalho[:8] != b"\x89PNG\r\n\x1a\n":
        return None, None
    largura = int.from_bytes(cabecalho[16:20], "big")
    altura = int.from_bytes(cabecalho[20:24], "big")
    return largura, altura


def aplicar_temperatura(caminho, cor, opacidade):
    """STYLE-BIBLE 2.3 - multiplicacao de temperatura so no fundo. Opcional."""
    try:
        from PIL import Image
    except ImportError:
        print("[tint] Pillow indisponivel, temperatura nao aplicada")
        return False
    vermelho = int(cor[1:3], 16)
    verde = int(cor[3:5], 16)
    azul = int(cor[5:7], 16)
    with Image.open(caminho) as imagem:
        base = imagem.convert("RGB")
        camada = Image.new("RGB", base.size, (vermelho, verde, azul))
        misturada = Image.blend(base, camada, opacidade)
        misturada.save(caminho, "PNG", optimize=True)
    return True


# ----------------------------------------------------------------------------
# Cartoes (hook e final) desenhados a codigo, nao por difusao
# ----------------------------------------------------------------------------
# Porque: em 5 tentativas o SD 1.5 escreveu texto falso ("PAARES TANE"), assinou
# o canto e chegou a inventar animais no cartao final. Num cartao de titulo isso
# e' defeito fatal e nao ha prompt que o garanta. A STYLE-BIBLE 8 permite fundos
# desenhados em Python; aqui isso e' ainda melhor porque as cores saem exactas
# (#F4E7D0, #E9A63C) e o cartao nasce sem letras por construcao.

PALETA_PAPEL = {
    "papel": (244, 231, 208),      # #F4E7D0
    "kraft": (226, 205, 175),      # papel mais escuro por tras da folha
    "contorno": (42, 26, 18),      # #2A1A12
    "ambar": (233, 166, 60),       # #E9A63C
    "verde": (110, 122, 51),       # #6E7A33
    "castanho": (107, 58, 34),     # #6B3A22
    "areia": (229, 207, 168),      # #E5CFA8
    "vermelho": (178, 58, 42),     # #B23A2A
}


def _poligono_rasgado(caixa, tremor, semente):
    """Perimetro com desvio de mao (STYLE-BIBLE 2.5) em vez de arestas perfeitas."""
    import random as _random
    aleatorio = _random.Random(semente)
    x0, y0, x1, y1 = caixa
    pontos = []
    passos = 26
    for i in range(passos + 1):                     # topo, esquerda -> direita
        pontos.append((x0 + (x1 - x0) * i / passos, y0 + aleatorio.uniform(-tremor, tremor)))
    for i in range(passos + 1):                     # direita, topo -> base
        pontos.append((x1 + aleatorio.uniform(-tremor, tremor), y0 + (y1 - y0) * i / passos))
    for i in range(passos + 1):                     # base, direita -> esquerda
        pontos.append((x1 - (x1 - x0) * i / passos, y1 + aleatorio.uniform(-tremor, tremor)))
    for i in range(passos + 1):                     # esquerda, base -> topo
        pontos.append((x0 + aleatorio.uniform(-tremor, tremor), y1 - (y1 - y0) * i / passos))
    return pontos


def _coracao(centro, raio):
    """Coracao por equacao parametrica: massa cheia, sem gradiente."""
    import math
    x0, y0 = centro
    pontos = []
    for passo in range(0, 360, 12):
        angulo = math.radians(passo)
        x = 16 * math.sin(angulo) ** 3
        y = (13 * math.cos(angulo) - 5 * math.cos(2 * angulo)
             - 2 * math.cos(3 * angulo) - math.cos(4 * angulo))
        pontos.append((x0 + x * raio / 16.0, y0 - y * raio / 16.0))
    return pontos


def desenhar_cartao(cena, largura, altura, destino):
    """Cartao de titulo / cartao final: papel creme, confetti ou coracoes, zero texto."""
    from PIL import Image, ImageDraw, ImageChops

    final = cena["scene"] == "final"
    papel = (247, 220, 192) if final else PALETA_PAPEL["papel"]
    imagem = Image.new("RGB", (largura, altura), PALETA_PAPEL["kraft"])
    desenho = ImageDraw.Draw(imagem)

    margem = max(18, int(largura * 0.018))          # 24 px a 1344 (STYLE-BIBLE 8)
    caixa = (margem, margem, largura - margem, altura - margem)

    # sombra curta por baixo da folha, depois a folha rasgada
    desenho.polygon(_poligono_rasgado((caixa[0] + 5, caixa[1] + 7, caixa[2] + 5, caixa[3] + 7),
                                     4, cena["seed"] + 1), fill=(206, 184, 154))
    desenho.polygon(_poligono_rasgado(caixa, 4, cena["seed"]), fill=papel)

    # zona central protegida: e' onde o Remotion poe o titulo (Zona A)
    seguro = (largura * 0.16, altura * 0.30, largura * 0.84, altura * 0.74)

    if final:
        for _ in range(11):
            raio = int(altura * (0.022 + 0.020 * random_between(cena["seed"], _ + 80)))
            x = int(random_between(cena["seed"], _) * (caixa[2] - caixa[0] - 2 * raio - 24)
                    + caixa[0] + raio + 12)
            y = int(random_between(cena["seed"], _ + 40) * (caixa[3] - caixa[1] - 2 * raio - 24)
                    + caixa[1] + raio + 12)
            if seguro[0] < x < seguro[2] and seguro[1] < y < seguro[3]:
                continue
            cor = PALETA_PAPEL["vermelho"] if _ % 3 else PALETA_PAPEL["ambar"]
            desenho.polygon(_coracao((x, y), raio), fill=cor,
                            outline=PALETA_PAPEL["contorno"], width=2)
    else:
        cores = [PALETA_PAPEL["ambar"], PALETA_PAPEL["verde"], PALETA_PAPEL["castanho"],
                 PALETA_PAPEL["areia"], PALETA_PAPEL["vermelho"]]
        for _ in range(46):
            raio = int(altura * (0.006 + 0.016 * random_between(cena["seed"], _ + 61)))
            x = int(random_between(cena["seed"], _) * (caixa[2] - caixa[0] - 2 * raio - 24)
                    + caixa[0] + raio + 12)
            y = int(random_between(cena["seed"], _ + 31) * (caixa[3] - caixa[1] - 2 * raio - 24)
                    + caixa[1] + raio + 12)
            if seguro[0] < x < seguro[2] and seguro[1] < y < seguro[3]:
                continue
            cor = cores[_ % len(cores)]
            desenho.ellipse((x - raio, y - raio, x + raio, y + raio), fill=cor,
                            outline=PALETA_PAPEL["contorno"], width=1)

    # borda de mao, discreta, sem invadir o centro
    desenho.line(_poligono_rasgado((caixa[0] + 12, caixa[1] + 12,
                                    caixa[2] - 12, caixa[3] - 12), 3, cena["seed"] + 7),
                 fill=PALETA_PAPEL["contorno"], width=2, joint="curve")

    # grao de papel deterministico (multiplicativo, quase invisivel)
    import random as _random
    aleatorio = _random.Random(cena["seed"] + 99)
    ruido = Image.new("L", (96, 96))
    ruido.putdata([aleatorio.randint(247, 255) for _ in range(96 * 96)])
    ruido = ruido.resize((largura, altura), Image.BILINEAR).convert("RGB")
    imagem = ImageChops.multiply(imagem, ruido)

    imagem.save(destino, "PNG", optimize=True)


def random_between(semente, indice):
    """Pseudo-aleatorio estavel por (cena, indice): o cartao sai igual sempre."""
    valor = (semente * 2654435761 + indice * 40503) & 0xFFFFFFFF
    valor ^= valor >> 15
    valor = (valor * 2246822519) & 0xFFFFFFFF
    valor ^= valor >> 13
    return (valor & 0xFFFFFF) / float(0xFFFFFF)


# ----------------------------------------------------------------------------
# Orquestracao
# ----------------------------------------------------------------------------

def gerar(cena, servidor, cliente, usar_lora, forcar, aplicar_cor, largura, altura):
    destino = os.path.join(AQUI, cena["ficheiro"])
    if os.path.exists(destino) and not forcar:
        print("[skip] %s ja existe (usa --force para refazer)" % cena["ficheiro"])
        return None

    # Cartoes: desenhados a codigo (ver bloco "Cartoes" acima). Nao passam pelo ComfyUI.
    if cena.get("metodo") == "cartao-pil":
        inicio = time.time()
        desenhar_cartao(cena, largura, altura, destino)
        largura_real, altura_real = tamanho_png(destino)
        if (largura_real, altura_real) != (largura, altura):
            raise ErroComfy("dimensoes inesperadas em %s: %sx%s"
                            % (cena["ficheiro"], largura_real, altura_real))
        kb = os.path.getsize(destino) / 1024.0
        print("[ok]   %-10s %6.1f KB  %dx%d  cartao desenhado em codigo"
              % (cena["scene"], kb, largura_real, altura_real))
        return {
            "scene": cena["scene"],
            "ficheiro": cena["ficheiro"],
            "caminho": os.path.join("bg", cena["ficheiro"]).replace("\\", "/"),
            "prompt": "cartao desenhado por codigo (PIL) - sem difusao",
            "prompt_negativo": None,
            "seed": cena["seed"],
            "metodo": "cartao-pil",
            "tamanho": {"largura": largura_real, "altura": altura_real},
            "bytes": os.path.getsize(destino),
            "kilobytes": round(kb, 1),
            "checkpoint": None,
            "lora": None,
            "forca_lora": None,
            "steps": None,
            "cfg": None,
            "sampler": None,
            "temperatura": cena["temperatura"],
            "temperatura_aplicada_no_png": False,
            "prompt_id": None,
            "segundos": round(time.time() - inicio, 2),
            "nota": ("cartao sem texto e sem personagens por construcao; o SD 1.5 "
                     "escrevia letras falsas nestas duas cenas"),
        }

    grafo, positivo = construir_workflow(cena, largura, altura, usar_lora)
    print("[fila] %-10s seed=%-8d %dx%d" % (cena["scene"], cena["seed"], largura, altura))
    inicio = time.time()
    prompt_id = submeter(servidor, grafo, cliente)
    ficheiros = esperar(servidor, prompt_id)
    bytes_png = descarregar(servidor, ficheiros[0])

    if len(bytes_png) < 20 * 1024:
        raise ErroComfy("PNG suspeito: %d bytes (< 20 KB)" % len(bytes_png))

    temporario = destino + ".parcial"
    with open(temporario, "wb") as saida:
        saida.write(bytes_png)
    os.replace(temporario, destino)

    largura_real, altura_real = tamanho_png(destino)
    if (largura_real, altura_real) != (largura, altura):
        raise ErroComfy("dimensoes inesperadas em %s: %sx%s"
                        % (cena["ficheiro"], largura_real, altura_real))

    if aplicar_cor:
        aplicar_temperatura(destino, cena["temperatura"]["cor"], cena["temperatura"]["opacidade"])

    segundos = time.time() - inicio
    kb = os.path.getsize(destino) / 1024.0
    print("[ok]   %-10s %6.1f KB  %dx%d  %.1fs"
          % (cena["scene"], kb, largura_real, altura_real, segundos))

    return {
        "scene": cena["scene"],
        "ficheiro": cena["ficheiro"],
        "caminho": os.path.join("bg", cena["ficheiro"]).replace("\\", "/"),
        "prompt": positivo,
        "prompt_negativo": NEGATIVO,
        "seed": cena["seed"],
        "metodo": "comfyui-api",
        "tamanho": {"largura": largura_real, "altura": altura_real},
        "bytes": os.path.getsize(destino),
        "kilobytes": round(kb, 1),
        "checkpoint": CHECKPOINT,
        "lora": LORA_INFANTIL if usar_lora else None,
        "forca_lora": AJUSTES["forca_lora"] if usar_lora else None,
        "steps": AJUSTES["passos"],
        "cfg": AJUSTES["cfg"],
        "sampler": "%s / %s" % (SAMPLER, SCHEDULER),
        "temperatura": cena["temperatura"],
        "temperatura_aplicada_no_png": bool(aplicar_cor),
        "prompt_id": prompt_id,
        "segundos": round(segundos, 1),
        "nota": "fundo sem personagens e sem texto; personagens saem das folhas aprovadas",
    }


def ler_manifest():
    if os.path.exists(MANIFEST):
        with open(MANIFEST, "r", encoding="utf-8") as ficheiro:
            try:
                return json.load(ficheiro)
            except json.JSONDecodeError:
                print("[manifest] ilegivel, sera reescrito")
    return {"projeto": "frida-luna / O Parque dos Pets", "gerador": "gerar_fundos.py",
            "servidor": None, "fundos": []}


def main():
    parser = argparse.ArgumentParser(description="Gera os 11 fundos de O Parque dos Pets")
    parser.add_argument("--server", default=SERVIDOR_PADRAO)
    parser.add_argument("--only", nargs="*", default=None, help="ids de cena")
    parser.add_argument("--force", action="store_true", help="refaz ficheiros existentes")
    parser.add_argument("--list", action="store_true", help="so mostra o plano")
    parser.add_argument("--no-free", action="store_true", help="nao liberta VRAM entre imagens")
    parser.add_argument("--tint", action="store_true", help="aplica a temperatura 2.3 no PNG")
    parser.add_argument("--largura", type=int, default=LARGURA)
    parser.add_argument("--altura", type=int, default=ALTURA)
    parser.add_argument("--passos", type=int, default=PASSOS,
                        help="steps de sampling (25-30 no render final)")
    parser.add_argument("--forca-lora", type=float, default=FORCA_LORA,
                        help="forca do LoRA infantil nos fundos (0.6-0.9)")
    parser.add_argument("--cfg", type=float, default=CFG,
                        help="cfg de sampling; mais alto empurra o negativo")
    argumentos = parser.parse_args()

    AJUSTES["passos"] = argumentos.passos
    AJUSTES["cfg"] = argumentos.cfg
    AJUSTES["forca_lora"] = argumentos.forca_lora

    alvo = CENAS
    if argumentos.only:
        pedidos = set(argumentos.only)
        alvo = [c for c in CENAS if c["scene"] in pedidos]
        faltam = pedidos - {c["scene"] for c in alvo}
        if faltam:
            print("[erro] cenas desconhecidas: %s" % ", ".join(sorted(faltam)))
            return 2
        if not alvo:
            print("[erro] nenhuma cena seleccionada")
            return 2

    if argumentos.list:
        for cena in alvo:
            print("%-10s seed=%-8d %s" % (cena["scene"], cena["seed"], cena["ficheiro"]))
        return 0

    try:
        usar_lora = pre_voo(argumentos.server)
    except ErroComfy as erro:
        print("[FALHA] %s" % erro)
        return 1

    cliente = uuid.uuid4().hex
    manifest = ler_manifest()
    manifest["servidor"] = argumentos.server
    manifest["resolucao_padrao"] = {"largura": argumentos.largura, "altura": argumentos.altura}
    feitos = {f["scene"]: f for f in manifest.get("fundos", [])}

    falhas = []
    for indice, cena in enumerate(alvo, 1):
        print("--- %d/%d ---" % (indice, len(alvo)))
        try:
            registo = gerar(cena, argumentos.server, cliente, usar_lora,
                            argumentos.force, argumentos.tint,
                            argumentos.largura, argumentos.altura)
            if registo:
                feitos[cena["scene"]] = registo
                manifest["fundos"] = [feitos[c["scene"]] for c in CENAS if c["scene"] in feitos]
                with open(MANIFEST, "w", encoding="utf-8") as ficheiro:
                    json.dump(manifest, ficheiro, ensure_ascii=False, indent=2)
        except ErroComfy as erro:
            print("[FALHA] cena %s -> %s" % (cena["scene"], erro))
            falhas.append((cena["scene"], str(erro)))
        finally:
            # Uma imagem de cada vez: nunca correr nada em paralelo na GTX 1060.
            if not argumentos.no_free:
                libertar_vram(argumentos.server)

    manifest["fundos"] = [feitos[c["scene"]] for c in CENAS if c["scene"] in feitos]
    manifest["total"] = len(manifest["fundos"])
    manifest["falhas"] = [{"scene": s, "erro": e} for s, e in falhas]
    with open(MANIFEST, "w", encoding="utf-8") as ficheiro:
        json.dump(manifest, ficheiro, ensure_ascii=False, indent=2)

    print("\n%d/%d fundos no manifest: %s" % (len(manifest["fundos"]), len(CENAS), MANIFEST))
    if falhas:
        for cena, erro in falhas:
            print("[FALHA] %s: %s" % (cena, erro))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
