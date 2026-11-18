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
   py gerar_fundos.py --so-borda         # so a borda de papel nos PNG existentes
   py gerar_fundos.py --sem-borda        # nao desenha a borda de papel
   py gerar_fundos.py --server http://127.0.0.1:8188

 TRES COISAS QUE SE APRENDERAM A FORCA (nao repetir os erros)
 ----------------------------------------------------------
   1. Ordem do prompt. Sujeito -> proibicao de gente -> estilo. Com o estilo
      antes da proibicao sairam um cao, um motociclista e dois figurantes num
      tunel que devia estar vazio.
   2. Geometria nao se pede, desenha-se. Texto sozinho nao segura a cena: a
      roda gigante saiu casa, o carrossel saiu fila de pelucias e a montanha
      de biscoitos saiu bosque com veados. As 7 cenas com `"esboco": True`
      recebem um layout desenhado em PIL (roda, carris, arcos, espelhos, sol)
      que sobe por POST /upload/image e entra num img2img a denoise 0.5; o
      modelo pinta a textura dentro da geometria.
   3. Denoise alto em esboco esparso = bicho inventado. 0.5 e' o ponto; com
      zonas vazias no esboco o modelo enche-as com criaturas.
   4. Bordas de papel rasgado em todos os fundos (STYLE-BIBLE 8): tapam as
      assinaturas que o modelo escreve no canto e unem as 11 cenas.

 ESTADO CONHECIDO / LIMITES
 --------------------------
   * 2 cartoes (hook, final) e 9 cenarios. Os 2 cartoes sao codigo puro.
   * 7 cenarios usam esboco + img2img: abertura, montanha, roda, carrossel,
     tunel, espelhos, moral.
   * 2 cenarios sao text2img puro por terem saido bem assim: portao, bolinhas.
   * O LoRA infantil fica em 0.75-0.85 e SO nos fundos. Personagem continua
     proibido (regra de ouro #6): sai das folhas aprovadas do Artista-desenho.

 DOIS METODOS, E PORQUE
 ---------------------
   9 cenarios (abertura -> moral) : ComfyUI, SD 1.5 + LoRA childrens-picture-book-sd15
                                    a 0.75-0.85. 7 deles com esboco em img2img
                                    (denoise 0.5); portao e bolinhas em text2img.
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
AJUSTES = {"passos": PASSOS, "cfg": CFG, "forca_lora": FORCA_LORA, "denoise": 0.5}

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
    "statue, totem, mascot, scarecrow, plush toy, doll, "
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
        "esboco": True,
        "seed": 220237,
        "temperatura": {"cor": "#FFF6E6", "opacidade": 0.06, "nota": "manha clara"},
        "prompt": (
            "an empty park path between round olive green bushes and trees, "
            "pale cream sky with soft clouds, a small stone archway in the distance, "
            "flat cartoon scenery, nobody there"
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
        "esboco": True,
        "seed": 440459,
        "temperatura": {"cor": "#FFF3DE", "opacidade": 0.04, "nota": "meio-dia alto"},
        "prompt": (
            "a roller coaster track made of chocolate biscuits, "
            "wavy biscuit rails with cream filling stacked high on brown biscuit supports, "
            "green grass below, bright cream sky, empty ride with no cart"
        ),
    },
    {
        "scene": "roda",
        "ficheiro": "fundo-roda-tigelas.png",
        "esboco": True,
        "seed": 550560,
        "temperatura": {"cor": "#FFE3B8", "opacidade": 0.12, "nota": "tarde dourada"},
        "prompt": (
            "a big ferris wheel with round amber bowl shaped cabins, seen from below, "
            "slim brown spokes, green grass at the base, golden sky, empty cabins"
        ),
    },
    {
        "scene": "carrossel",
        "ficheiro": "fundo-carrossel-pelucias.png",
        "esboco": True,
        "seed": 660671,
        "temperatura": {"cor": "#FFCF9E", "opacidade": 0.16, "nota": "fim de tarde quente"},
        "prompt": (
            "a fairground carousel with a round striped canopy roof and painted poles, "
            "small warm glowing bulbs along the rim, empty seats, "
            "green grass around, warm late afternoon light"
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
        "esboco": True,
        "seed": 880893,
        "temperatura": {"cor": "#D9C79E", "opacidade": 0.18, "nota": "sombra de relva"},
        "prompt": (
            "a tunnel made of tall green grass arches with small hanging string lights, "
            "a dirt path running through it, deep green shadow, sunlight at the far end, "
            "empty tunnel"
        ),
    },
    {
        "scene": "espelhos",
        "ficheiro": "fundo-casa-espelhos.png",
        "esboco": True,
        "seed": 990904,
        "temperatura": {"cor": "#C9BBA6", "opacidade": 0.22, "nota": "interior neutro"},
        "prompt": (
            "a row of tall wavy funhouse distorting mirrors in gold frames leaning "
            "against a cream wall, warped glass, checkered floor, "
            "dim neutral interior light, empty room"
        ),
    },
    {
        "scene": "moral",
        "ficheiro": "fundo-por-do-sol.png",
        "esboco": True,
        "seed": 1010015,
        "temperatura": {"cor": "#FFB877", "opacidade": 0.26, "nota": "por-do-sol"},
        "prompt": (
            "a big orange sun setting on the horizon, amber and orange sky bands, "
            "dark warm brown silhouette skyline of a ferris wheel and round trees, "
            "olive green foreground grass, empty landscape, solid silhouettes"
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

def construir_workflow(cena, largura, altura, usar_lora, esboco=None):
    # Ordem importa: o sujeito primeiro, a proibicao de gente logo a seguir,
    # o estilo no fim. Com o estilo no meio o SD 1.5 perde o sujeito e inventa
    # transeuntes (foi assim que apareceram um cao, um motociclista e dois
    # figurantes num tunel que devia estar vazio).
    positivo = "%s. %s. %s" % (cena["prompt"], SEM_GENTE, ESTILO)
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
    if esboco:
        # img2img guiado por esboco: a geometria vem do PIL, a textura do modelo.
        grafo["9"] = {
            "class_type": "LoadImage",
            "inputs": {"image": esboco},
        }
        grafo["10"] = {
            "class_type": "VAEEncode",
            "inputs": {"pixels": ["9", 0], "vae": ["1", 2]},
        }
        latent, denoise = ["10", 0], AJUSTES["denoise"]
    else:
        grafo["4"] = {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": largura, "height": altura, "batch_size": 1},
        }
        latent, denoise = ["4", 0], 1.0

    grafo["5"] = {
        "class_type": "KSampler",
        "inputs": {
            "model": origem_modelo,
            "positive": ["2", 0],
            "negative": ["3", 0],
            "latent_image": latent,
            "seed": cena["seed"],
            "steps": AJUSTES["passos"],
            "cfg": AJUSTES["cfg"],
            "sampler_name": SAMPLER,
            "scheduler": SCHEDULER,
            "denoise": denoise,
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

def carregar_imagem(servidor, caminho):
    """POST /upload/image em multipart, escrito a mao (so stdlib).

    O esboco nunca e' escrito dentro da pasta de instalacao do ComfyUI: entra
    pela API, como manda o AGENTS.md (outputs e inputs ficam em work/).
    """
    fronteira = "----fridaluna%s" % uuid.uuid4().hex
    with open(caminho, "rb") as ficheiro:
        conteudo = ficheiro.read()
    nome = os.path.basename(caminho)
    partes = [
        ("--%s\r\n" % fronteira).encode(),
        ('Content-Disposition: form-data; name="image"; filename="%s"\r\n' % nome).encode(),
        b"Content-Type: image/png\r\n\r\n",
        conteudo,
        ("\r\n--%s\r\n" % fronteira).encode(),
        b'Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue',
        ("\r\n--%s--\r\n" % fronteira).encode(),
    ]
    corpo = b"".join(partes)
    pedido = urllib.request.Request(
        servidor.rstrip("/") + "/upload/image", data=corpo, method="POST",
        headers={"Content-Type": "multipart/form-data; boundary=%s" % fronteira})
    try:
        with urllib.request.urlopen(pedido, timeout=120) as resposta:
            dados = json.loads(resposta.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        raise ErroComfy("upload do esboco falhou: HTTP %s -> %s"
                        % (erro.code, erro.read().decode("utf-8", "replace")[:800])) from None
    except urllib.error.URLError as erro:
        raise ErroComfy("upload do esboco falhou: %s" % erro.reason) from None
    if "name" not in dados:
        raise ErroComfy("upload devolveu resposta inesperada: %s" % json.dumps(dados)[:600])
    return dados["name"]


def submeter(servidor, grafo, cliente):
    resposta = pedir_json(servidor, "/prompt", dados={"prompt": grafo, "client_id": cliente})
    if "prompt_id" not in resposta:
        raise ErroComfy("/prompt recusou o grafo: %s" % json.dumps(resposta)[:1500])
    if resposta.get("node_errors"):
        raise ErroComfy("/prompt devolveu node_errors: %s"
                        % json.dumps(resposta["node_errors"])[:1500])
    return resposta["prompt_id"]


def esperar(servidor, prompt_id, limite_s=2400, intervalo_s=3):
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


# ----------------------------------------------------------------------------
# Esbocos de layout -> img2img
# ----------------------------------------------------------------------------
# Porque existem: a 6.5, 7 e 8.5 o SD 1.5 trocou a roda gigante por uma casa, o
# carrossel por uma fila de pelucias e a montanha-russa de biscoitos por um
# bosque com veados. Texto nao resolve; falta-lhe geometria. Aqui a geometria e'
# desenhada em PIL (roda, carris, arcos, espelhos, sol) e o modelo so pinta a
# textura dentro dela, com denoise 0.6. A composicao deixa de ser sorte.

def _elipse_tremida(centro, raio_x, raio_y, tremor, semente, passos=54):
    """Elipse com desvio de mao: evita o circulo perfeito reprovado pela biblia."""
    import math
    import random as _random
    aleatorio = _random.Random(semente)
    x0, y0 = centro
    pontos = []
    for passo in range(passos):
        angulo = 2 * math.pi * passo / passos
        desvio = 1.0 + aleatorio.uniform(-tremor, tremor) / 100.0
        pontos.append((x0 + raio_x * desvio * math.cos(angulo),
                       y0 + raio_y * desvio * math.sin(angulo)))
    return pontos


def desenhar_esboco(cena, largura, altura, destino):
    """Layout plano da cena, cores da biblia, sem texto e sem personagem."""
    from PIL import Image, ImageDraw

    L, A = largura, altura
    contorno = PALETA_PAPEL["contorno"]
    imagem = Image.new("RGB", (L, A), PALETA_PAPEL["papel"])
    d = ImageDraw.Draw(imagem)
    s = cena["seed"]

    def forma(pontos, cor, largura_linha=4, linha=True):
        d.polygon(pontos, fill=cor)
        if linha:
            d.line(pontos + [pontos[0]], fill=contorno, width=largura_linha, joint="curve")

    def circulo(centro, rx, ry, cor, largura_linha=4, linha=True, semente=0):
        forma(_elipse_tremida(centro, rx, ry, 2.5, s + semente), cor, largura_linha, linha)

    def rect(x0, y0, x1, y1, cor, linha=True, largura_linha=4, semente=0):
        forma(_poligono_rasgado((x0, y0, x1, y1), 2, s + semente), cor, largura_linha, linha)

    def banda_seno(y_base, amplitude, espessura, cor, cor_contorno=contorno, semente=0):
        """Carris ondulados da montanha-russa (ou qualquer fita ondulada)."""
        import math
        pontos_alto, pontos_baixo = [], []
        for i in range(0, 41):
            x = L * i / 40.0
            y = y_base + amplitude * math.sin(i / 40.0 * math.pi * 2.2)
            pontos_alto.append((x, y))
            pontos_baixo.append((x, y + espessura))
        d.polygon(pontos_alto + pontos_baixo[::-1], fill=cor)
        d.line(pontos_alto, fill=cor_contorno, width=5, joint="curve")
        d.line(pontos_baixo, fill=cor_contorno, width=5, joint="curve")
        return pontos_baixo

    def nuvem(cx, cy, escala, semente=0):
        """Nuvem de circulos cheios, sem contorno fino: evita virar balao de fala."""
        import random as _random
        aleatorio = _random.Random(s + semente)
        for _ in range(4):
            rx = L * escala * aleatorio.uniform(0.55, 0.95)
            ry = rx * 0.62
            deslocamento = L * escala * aleatorio.uniform(-0.9, 0.9)
            circulo((cx + deslocamento, cy + aleatorio.uniform(-0.25, 0.25) * ry),
                    rx, ry, (255, 251, 242), largura_linha=0, linha=False,
                    semente=semente + _)

    def colinas():
        """Fundo de colinas: tira o vazio onde o modelo inventa bichos."""
        circulo((L * 0.20, A * 0.78), L * 0.42, A * 0.20, (150, 158, 96),
                largura_linha=4, semente=21)
        circulo((L * 0.78, A * 0.80), L * 0.46, A * 0.22, (128, 138, 78),
                largura_linha=4, semente=22)

    def tufos(y, quantidade=14, cor=None):
        """Tufos de relva: preenchem o primeiro plano."""
        import random as _random
        aleatorio = _random.Random(s + 44)
        for i in range(quantidade):
            x = L * (i + aleatorio.uniform(0.1, 0.9)) / quantidade
            altura = A * aleatorio.uniform(0.015, 0.035)
            d.polygon([(x, y), (x - altura * 0.5, y + altura), (x + altura * 0.5, y + altura)],
                      fill=cor or (86, 98, 42))

    if cena["scene"] == "abertura":
        rect(0, int(A * 0.52), L, A, PALETA_PAPEL["verde"], linha=False)
        colinas()
        nuvem(L * 0.30, A * 0.14, 0.11, semente=5)
        nuvem(L * 0.72, A * 0.12, 0.09, semente=9)
        for i, x in enumerate([0.10, 0.24, 0.40, 0.62, 0.78, 0.92]):
            cx, cy = L * x, A * (0.34 + 0.05 * (i % 2))
            rect(cx - 10, cy, cx + 10, A * 0.80, PALETA_PAPEL["castanho"], largura_linha=3,
                 semente=i)
            circulo((cx, cy - A * 0.05), L * 0.085, A * 0.11, PALETA_PAPEL["verde"],
                    semente=i * 3)
        rect(L * 0.36, A * 0.60, L * 0.64, A * 0.70, PALETA_PAPEL["areia"], largura_linha=5)
        forma([(L * 0.47, A * 0.62), (L * 0.53, A * 0.62), (L * 0.60, A), (L * 0.40, A)],
              PALETA_PAPEL["areia"], largura_linha=5)
        for i, x in enumerate([0.16, 0.30, 0.70, 0.86]):
            circulo((L * x, A * 0.72), L * 0.075, A * 0.075, PALETA_PAPEL["verde"],
                    semente=i * 7)
        tufos(int(A * 0.93))

    elif cena["scene"] == "montanha":
        import math
        colinas()
        nuvem(L * 0.22, A * 0.15, 0.10, semente=3)
        nuvem(L * 0.62, A * 0.11, 0.12, semente=8)
        nuvem(L * 0.87, A * 0.18, 0.08, semente=12)
        apoio = banda_seno(A * 0.46, A * 0.14, A * 0.075, PALETA_PAPEL["castanho"], semente=3)
        # camada de creme a meio da fita: e' isto que a le como biscoito recheado
        creme = []
        for i in range(0, 41):
            x = L * i / 40.0
            creme.append((x, A * 0.46 + A * 0.14 * math.sin(i / 40.0 * math.pi * 2.2)
                          + A * 0.028))
        d.line(creme, fill=PALETA_PAPEL["areia"], width=int(A * 0.022), joint="curve")
        # pepitas e golpes de biscoito: sem isto a fita le-se como tubo de madeira
        for i in range(0, 41, 2):
            x = L * i / 40.0
            y = A * 0.46 + A * 0.14 * math.sin(i / 40.0 * math.pi * 2.2) + A * 0.037
            raio = A * 0.008
            d.ellipse((x - raio, y - raio, x + raio, y + raio), fill=(74, 44, 28))
        for i in range(1, 12):
            x = L * i / 12.0
            topo = A * 0.46 + A * 0.14 * math.sin(i / 12.0 * math.pi * 2.2)
            d.line([(x, topo), (x, topo + A * 0.075)], fill=contorno, width=3)
        for i in range(0, len(apoio), 5):
            x, y = apoio[i]
            d.line([(x, y), (x, A * 0.86)], fill=contorno, width=6)
        rect(0, int(A * 0.86), L, A, PALETA_PAPEL["verde"], linha=False)
        tufos(int(A * 0.88))

    elif cena["scene"] == "roda":
        rect(0, int(A * 0.80), L, A, PALETA_PAPEL["verde"], linha=False)
        cx, cy, raio = L * 0.5, A * 0.46, A * 0.34
        d.line([(cx - raio * 0.7, A * 0.86), (cx, cy)], fill=contorno, width=11)
        d.line([(cx + raio * 0.7, A * 0.86), (cx, cy)], fill=contorno, width=11)
        d.line(_elipse_tremida((cx, cy), raio, raio, 1.2, s + 2), fill=contorno,
               width=9, joint="curve")
        d.line(_elipse_tremida((cx, cy), raio * 0.86, raio * 0.86, 1.2, s + 4),
               fill=contorno, width=5, joint="curve")
        for i in range(8):
            import math
            angulo = i * math.pi / 4
            px, py = cx + raio * math.cos(angulo), cy + raio * math.sin(angulo)
            d.line([(cx, cy), (px, py)], fill=contorno, width=4)
            circulo((px, py + A * 0.055), L * 0.042, A * 0.045, PALETA_PAPEL["ambar"],
                    largura_linha=4, semente=i * 9)
        circulo((cx, cy), L * 0.03, A * 0.05, PALETA_PAPEL["castanho"], semente=6)
        tufos(int(A * 0.88))

    elif cena["scene"] == "carrossel":
        rect(0, int(A * 0.80), L, A, PALETA_PAPEL["verde"], linha=False)
        cx = L * 0.5
        circulo((cx, A * 0.80), L * 0.30, A * 0.055, PALETA_PAPEL["areia"], semente=2)
        for i, x in enumerate([0.34, 0.42, 0.50, 0.58, 0.66]):
            rect(L * x - 6, A * 0.42, L * x + 6, A * 0.80, PALETA_PAPEL["castanho"],
                 largura_linha=3, semente=i)
        forma([(cx, A * 0.20), (L * 0.24, A * 0.44), (L * 0.76, A * 0.44)],
              PALETA_PAPEL["ambar"], largura_linha=6)
        for i in range(5):
            largura_faixa = (L * 0.52) / 5
            x0 = L * 0.24 + i * largura_faixa
            tronco = [(cx, A * 0.20)]
            esq = (x0, A * 0.44)
            dir_ = (x0 + largura_faixa, A * 0.44)
            if i % 2:
                d.polygon([tronco[0], esq, dir_], fill=PALETA_PAPEL["areia"])
        for i in range(9):
            circulo((L * (0.26 + 0.06 * i), A * 0.455), L * 0.011, A * 0.017,
                    PALETA_PAPEL["ambar"], largura_linha=2, linha=False, semente=i * 5)
        d.line([(L * 0.24, A * 0.44), (L * 0.76, A * 0.44)], fill=contorno, width=6)
        tufos(int(A * 0.93))

    elif cena["scene"] == "tunel":
        rect(0, 0, L, A, PALETA_PAPEL["verde"], linha=False)
        for i in range(4):
            factor = 1.0 - i * 0.19
            rx = L * 0.52 * factor
            ry = A * 0.72 * factor
            cor = (58, 66, 30) if i % 2 else (76, 88, 38)
            forma(_elipse_tremida((L * 0.5, A * 0.62), rx, ry, 2.0, s + i), cor,
                  largura_linha=6)
        forma(_elipse_tremida((L * 0.5, A * 0.62), L * 0.13, A * 0.24, 2.0, s + 9),
              PALETA_PAPEL["papel"], largura_linha=5)
        forma([(L * 0.44, A), (L * 0.56, A), (L * 0.545, A * 0.80), (L * 0.455, A * 0.80)],
              PALETA_PAPEL["areia"], largura_linha=5)
        for i in range(5):
            x = L * (0.20 + 0.15 * i)
            y = A * (0.20 + 0.06 * (i % 2))
            d.line([(x, 0), (x, y)], fill=contorno, width=3)
            circulo((x, y + A * 0.03), L * 0.012, A * 0.022, PALETA_PAPEL["ambar"],
                    largura_linha=2, semente=i * 6)
        tufos(int(A * 0.94))

    elif cena["scene"] == "espelhos":
        rect(0, 0, L, A, (236, 224, 204), linha=False)
        rect(0, int(A * 0.78), L, A, PALETA_PAPEL["areia"], linha=False)
        for linha in range(3):
            for coluna in range(9):
                if (linha + coluna) % 2:
                    continue
                x0 = L * coluna / 9.0
                y0 = A * 0.78 + (A * 0.22) * linha / 3.0
                d.polygon([(x0, y0), (x0 + L / 9.0, y0),
                           (x0 + L / 9.0, y0 + A * 0.073), (x0, y0 + A * 0.073)],
                          fill=(214, 198, 172))
        for i, (x, w, h) in enumerate([(0.14, 0.17, 0.46), (0.42, 0.20, 0.54), (0.72, 0.16, 0.44)]):
            cx = L * (x + w / 2)
            forma(_poligono_rasgado((L * x, A * 0.24, L * (x + w), A * (0.24 + h)), 3, s + i),
                  PALETA_PAPEL["ambar"], largura_linha=7)
            forma(_elipse_tremida((cx, A * (0.26 + h * 0.5)),
                                  L * w * 0.42, A * h * 0.46, 3.0, s + i * 4),
                  (198, 206, 208), largura_linha=4)

    elif cena["scene"] == "moral":
        for i, cor in enumerate([(255, 184, 119), (247, 160, 96), (232, 138, 78)]):
            y0 = A * (0.18 + 0.22 * i)
            rect(0, y0, L, y0 + A * 0.22, cor, linha=False)
        circulo((L * 0.5, A * 0.52), L * 0.13, A * 0.16, PALETA_PAPEL["ambar"],
                largura_linha=0, linha=False, semente=3)
        rect(0, int(A * 0.72), L, A, PALETA_PAPEL["verde"], linha=False)
        escuro = (58, 36, 21)
        cx, cy, raio = L * 0.30, A * 0.50, A * 0.20
        d.line(_elipse_tremida((cx, cy), raio, raio, 1.0, s + 5), fill=escuro, width=9)
        import math
        for i in range(8):
            angulo = i * math.pi / 4
            d.line([(cx, cy), (cx + raio * math.cos(angulo), cy + raio * math.sin(angulo))],
                   fill=escuro, width=6)
            d.ellipse((cx + raio * math.cos(angulo) - 10, cy + raio * math.sin(angulo) - 10,
                       cx + raio * math.cos(angulo) + 10, cy + raio * math.sin(angulo) + 10),
                      fill=escuro)
        for i, x in enumerate([0.62, 0.74, 0.86, 0.95]):
            altura_arvore = A * (0.16 + 0.03 * (i % 2))
            d.polygon([(L * x, A * 0.72 - altura_arvore), (L * x - L * 0.045, A * 0.73),
                       (L * x + L * 0.045, A * 0.73)], fill=escuro)
        tufos(int(A * 0.90), cor=(74, 84, 38))

    imagem.save(destino, "PNG")
    return destino


def aplicar_borda_papel(caminho, largura, altura, semente, espessura=None):
    """STYLE-BIBLE 8: borda de papel rasgado nas extremidades.

    Nenhum fundo toca o rebordo do quadro. Alem de cumprir a regra, tapa as
    assinaturas que o SD 1.5 insiste em escrever no canto inferior direito.
    """
    from PIL import Image, ImageDraw
    espessura = espessura or max(14, int(largura * 0.016))
    with Image.open(caminho) as origem:
        base = origem.convert("RGB")
    mascara = Image.new("L", base.size, 0)
    pincel = ImageDraw.Draw(mascara)
    pincel.polygon(_poligono_rasgado((espessura, espessura, largura - espessura,
                                      altura - espessura), 4, semente), fill=255)
    kraft = Image.new("RGB", base.size, PALETA_PAPEL["kraft"])
    resultado = Image.composite(base, kraft, mascara)
    desenho = ImageDraw.Draw(resultado)
    desenho.line(_poligono_rasgado((espessura, espessura, largura - espessura,
                                    altura - espessura), 4, semente),
                 fill=PALETA_PAPEL["contorno"], width=2, joint="curve")
    resultado.save(caminho, "PNG", optimize=True)


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

def gerar(cena, servidor, cliente, usar_lora, forcar, aplicar_cor, largura, altura,
          aplicar_borda=True):
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

    grafo, positivo = construir_workflow(cena, largura, altura, usar_lora, None)
    esboco_nome = None
    if cena.get("esboco"):
        pasta_esbocos = os.path.join(AQUI, "_esbocos")
        os.makedirs(pasta_esbocos, exist_ok=True)
        caminho_esboco = os.path.join(pasta_esbocos, "esboco-%s.png" % cena["scene"])
        desenhar_esboco(cena, largura, altura, caminho_esboco)
        esboco_nome = carregar_imagem(servidor, caminho_esboco)
        grafo, positivo = construir_workflow(cena, largura, altura, usar_lora, esboco_nome)
        print("[esboco] %-10s layout enviado como %s (denoise %.2f)"
              % (cena["scene"], esboco_nome, AJUSTES["denoise"]))
    print("[fila] %-10s seed=%-8d %dx%d" % (cena["scene"], cena["seed"], largura, altura))
    inicio = time.time()
    prompt_id = submeter(servidor, grafo, cliente)
    # 2400 s: uma cena ja demorou 1217 s nesta GTX 1060 quando o /free apanhou
    # o modelo a meio. Desistir aos 900 s era desistir de uma imagem que saiu bem.
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

    if aplicar_borda:
        aplicar_borda_papel(destino, largura, altura, cena["seed"])
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
        "esboco": esboco_nome,
        "denoise": AJUSTES["denoise"] if esboco_nome else 1.0,
        "borda_de_papel": bool(aplicar_borda),
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
    parser.add_argument("--sem-borda", action="store_true",
                        help="nao desenha a borda de papel rasgado (STYLE-BIBLE 8)")
    parser.add_argument("--so-borda", action="store_true",
                        help="aplica so a borda de papel aos PNG que ja existem")
    parser.add_argument("--largura", type=int, default=LARGURA)
    parser.add_argument("--altura", type=int, default=ALTURA)
    parser.add_argument("--passos", type=int, default=PASSOS,
                        help="steps de sampling (25-30 no render final)")
    parser.add_argument("--forca-lora", type=float, default=FORCA_LORA,
                        help="forca do LoRA infantil nos fundos (0.6-0.9)")
    parser.add_argument("--cfg", type=float, default=CFG,
                        help="cfg de sampling; mais alto empurra o negativo")
    parser.add_argument("--denoise", type=float, default=AJUSTES["denoise"],
                        help="denoise do img2img guiado por esboco (0.5-0.75)")
    argumentos = parser.parse_args()

    AJUSTES["passos"] = argumentos.passos
    AJUSTES["cfg"] = argumentos.cfg
    AJUSTES["forca_lora"] = argumentos.forca_lora
    AJUSTES["denoise"] = argumentos.denoise

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

    if argumentos.so_borda:
        for cena in alvo:
            destino = os.path.join(AQUI, cena["ficheiro"])
            if not os.path.exists(destino):
                print("[skip] %s nao existe" % cena["ficheiro"])
                continue
            if cena.get("metodo") == "cartao-pil":
                print("[skip] %s e' cartao (ja tem borda propria)" % cena["ficheiro"])
                continue
            largura_real, altura_real = tamanho_png(destino)
            aplicar_borda_papel(destino, largura_real, altura_real, cena["seed"])
            print("[borda] %s" % cena["ficheiro"])
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
                            argumentos.largura, argumentos.altura,
                            aplicar_borda=not argumentos.sem_borda)
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
