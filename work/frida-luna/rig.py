# -*- coding: utf-8 -*-
"""rig.py - constroi o rig de recorte (cutout) da Frida e da Luna a partir das poses aprovadas.

O QUE FAZ
  1. Alinha as 8 poses de `chars/poses-v3/<quem>/` num canvas comum. E preciso porque cada
     pose foi exportada com uma largura diferente (381..400 px): sem alinhar, uma mascara
     definida uma vez nao servia nas outras poses. O alinhamento e medido (IoU do corpo
     inferior), nao adivinhado.
  2. Define as mascaras UMA vez por personagem, em fraccoes da altura do sprite, com cantos
     arredondados e feather de 2,5 px (evita costura visivel entre partes).
  3. Corta 7 partes: cabeca (com orelhas), tronco, braco_esq, braco_dir, perna_esq,
     perna_dir, cauda. Guarda `chars/rig/<quem>/<parte>.png` + `anchors.json`
     (pontos de rotacao em fraccoes da altura: ombro, anca, base do pescoco).
  4. Limpa a boca gravada na arte (inpainting por blur iterativo, so na zona da boca) e
     desenha 3 estados de boca - fechada / meia / aberta - que o Remotion liga ao RMS da voz.
  5. Escreve um QA visual `chars/rig/_debug-masks.png` com as mascaras por cima do sprite.

O QUE NAO FAZ
  - nao redesenha o personagem: os pixeis do corpo sao os da folha aprovada. A unica zona
    alterada e a boca (para poder animar), e e dito no relatorio.
  - nao usa IA generativa.

USO
  python rig.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# ---------------------------------------------------------------- caminhos e constantes
BASE = Path(r"D:\CRAFT\work\frida-luna")      # raiz do cartao
POSES = BASE / "chars" / "poses-v3"           # poses aprovadas (8 por personagem)
RIG = BASE / "chars" / "rig"                  # destino do rig
FEATHER = 2.5                                 # sigma do feather das mascaras (px a 512 de altura)
EXPORT_SCALE = 2                              # rig exportado a 2x para o browser nao perder nitidez
POSES_USADAS = ("happy", "excited")           # happy = base do rig; excited = variante de cara


# ---------------------------------------------------------------- ficha de cada personagem
# Coordenadas em fraccoes do sprite (x/W, y/H), y de cima para baixo.
# Formas suportadas: ("rect", x, y, w, h, raio) e ("ell", cx, cy, w, h).
FICHA = {
    "frida": {
        "base": "happy",
        # a Luna mede 0,72 da Frida (PERSONAGENS.md) - a proporcao em si vive no Remotion,
        # aqui e so a altura de referencia de cada sprite.
        "partes": {
            # cabeca inclui orelhas e joulas: corta em 0,455 da altura (base do pescoco)
            "cabeca": [("rect", 0.00, 0.00, 1.00, 0.455, 0.06)],
            # tronco comeca acima do corte da cabeca (0,385) para haver sobreposicao: e o
            # tronco que tapa a costura do pescoco, nao o contrario
            "tronco": [("rect", -0.02, 0.385, 1.04, 0.565, 0.05)],
            # bracos: blocos redondos a volta da pata dianteira, desenhados por cima do tronco
            "braco_esq": [("ell", 0.062, 0.722, 0.175, 0.155)],
            "braco_dir": [("ell", 0.955, 0.718, 0.170, 0.160)],
            # pernas: cada uma apanha metade da base do sprite
            "perna_esq": [("rect", 0.150, 0.862, 0.295, 0.150, 0.04)],
            "perna_dir": [("rect", 0.556, 0.862, 0.320, 0.150, 0.04)],
            # Frida nao tem cauda visivel na arte aprovada (vista frontal): lista vazia ->
            # parte vazia, marcada "presente": false no anchors.json
            "cauda": [],
            # orelhas: copia dos mesmos pixeis da cabeca, so para ter atraso de secundaria
            "orelha_esq": [("ell", 0.180, 0.110, 0.260, 0.210)],
            "orelha_dir": [("ell", 0.828, 0.110, 0.255, 0.205)],
        },
        # ancoras (pontos de rotacao) em fraccoes: x/W e y/H
        "ancoras": {
            "cabeca": (0.500, 0.448),      # base do pescoco
            "tronco": (0.500, 0.660),      # centro da anca
            "braco_esq": (0.075, 0.600),   # ombro esquerdo
            "braco_dir": (0.925, 0.600),   # ombro direito
            "perna_esq": (0.298, 0.872),   # anca esquerda
            "perna_dir": (0.716, 0.872),   # anca direita
            "cauda": (0.060, 0.800),
            "orelha_esq": (0.235, 0.150),  # raiz da orelha
            "orelha_dir": (0.775, 0.150),
        },
        # caixa onde vive a boca (para limpar a boca gravada e desenhar os 3 estados)
        "boca": (0.470, 0.298, 0.270, 0.135),
    },
    "luna": {
        "base": "happy",
        "partes": {
            "cabeca": [("rect", 0.00, 0.00, 1.00, 0.400, 0.06)],
            "tronco": [("rect", -0.02, 0.330, 1.04, 0.580, 0.05)],
            "braco_esq": [("ell", 0.400, 0.785, 0.190, 0.140)],
            "braco_dir": [("ell", 0.600, 0.785, 0.190, 0.140)],
            "perna_esq": [("rect", 0.170, 0.880, 0.290, 0.135, 0.04)],
            "perna_dir": [("rect", 0.560, 0.880, 0.290, 0.135, 0.04)],
            # cauda da salsicha: curva a esquerda, raiz junto ao flanco
            "cauda": [("ell", 0.105, 0.745, 0.215, 0.175)],
            "orelha_esq": [("ell", 0.135, 0.250, 0.290, 0.290)],
            "orelha_dir": [("ell", 0.868, 0.250, 0.290, 0.290)],
        },
        "ancoras": {
            "cabeca": (0.500, 0.372),
            "tronco": (0.500, 0.650),
            "braco_esq": (0.415, 0.700),
            "braco_dir": (0.585, 0.700),
            "perna_esq": (0.300, 0.890),
            "perna_dir": (0.700, 0.890),
            "cauda": (0.200, 0.828),
            "orelha_esq": (0.230, 0.150),
            "orelha_dir": (0.770, 0.150),
        },
        "boca": (0.345, 0.305, 0.345, 0.085),
        # sombra clara gravada por baixo dos pes na arte da Luna - tem de sair do rig,
        # senao andava com as pernas; a sombra de contacto passa a ser desenhada no Remotion
        "sombra_gravada": (0.12, 0.968),
    },
}


# ---------------------------------------------------------------- utilitarios de imagem
def rgba(path: Path) -> np.ndarray:
    """Le um PNG como array RGBA uint8."""
    return np.array(Image.open(path).convert("RGBA"))


def mascara_forma(forma, W: int, H: int) -> np.ndarray:
    """Rasteriza uma forma da ficha para uma mascara booleana W x H (supersampling 4x)."""
    s = 4                                    # supersampling: cantos arredondados limpos
    img = Image.new("L", (W * s, H * s), 0)  # mascara em cinza, 4x maior
    d = ImageDraw.Draw(img)                  # desenho a 4x
    kind = forma[0]                          # tipo da forma
    if kind == "rect":                       # retangulo de cantos arredondados
        _, x, y, w, h, r = forma            # fraccoes + raio em fraccao da altura
        box = [x * W * s, y * H * s, (x + w) * W * s, (y + h) * H * s]
        d.rounded_rectangle(box, radius=max(1, r * H * s), fill=255)
    elif kind == "ell":                      # elipse por centro + tamanho
        _, cx, cy, w, h = forma
        box = [(cx - w / 2) * W * s, (cy - h / 2) * H * s,
               (cx + w / 2) * W * s, (cy + h / 2) * H * s]
        d.ellipse(box, fill=255)
    else:
        raise ValueError(f"forma desconhecida: {kind}")
    m = img.resize((W, H), Image.LANCZOS)    # volta a resolucao nativa (anti-aliased)
    return np.asarray(m, dtype=np.float32) / 255.0


def alinhar(a: np.ndarray, ref: np.ndarray, low: float = 0.55) -> tuple[int, int]:
    """Devolve o (dx, dy) que alinha `a` com `ref` no corpo inferior (IoU maximo).

    Mede em meia resolucao para ser rapido e refina: e o que garante que a mesma mascara
    serve nas 8 poses.
    """
    W = max(a.shape[1], ref.shape[1]) + 64    # canvas largo o suficiente para o deslocamento
    H = ref.shape[0]
    def col(x):                              # poe a imagem no canto inferior-centro do canvas
        c = np.zeros((H, W), bool)
        x0 = (W - x.shape[1]) // 2
        c[:, x0:x0 + x.shape[1]] = x[:, :, 3] > 128
        return c
    A, R = col(a), col(ref)
    rows = slice(int(H * low), H)            # so o corpo inferior: a cabeca muda de pose
    best = (-1.0, 0, 0)
    for dy in range(-6, 7, 2):               # varrimento grosso (passo 2)
        for dx in range(-24, 25, 2):
            M = np.roll(np.roll(A, dy, axis=0), dx, axis=1)
            inter = (M[rows] & R[rows]).sum() / max(1, (M[rows] | R[rows]).sum())
            if inter > best[0]:
                best = (inter, dx, dy)
    _, gx, gy = best
    best = (-1.0, gx, gy)
    for dy in range(gy - 2, gy + 3):         # varrimento fino (passo 1)
        for dx in range(gx - 2, gx + 3):
            M = np.roll(np.roll(A, dy, axis=0), dx, axis=1)
            inter = (M[rows] & R[rows]).sum() / max(1, (M[rows] | R[rows]).sum())
            if inter > best[0]:
                best = (inter, dx, dy)
    return best[1], best[2]


def limpar_sombra(img: np.ndarray, frac_xy: tuple[float, float]) -> np.ndarray:
    """Apaga a sombra clara gravada na arte (cor amostrada no canto inferior)."""
    out = img.copy()
    H, W = out.shape[:2]
    sx, sy = int(frac_xy[0] * W), int(frac_xy[1] * H)   # ponto onde so ha sombra
    cor = out[sy, sx, :3].astype(np.int16)              # cor da sombra gravada
    band = out[int(0.90 * H):]                          # so a faixa dos pes
    rgb = band[..., :3].astype(np.int16)
    dif = np.abs(rgb - cor).max(axis=2)                 # distancia por canal
    alvo = (dif <= 14) & (band[..., 3] > 0)             # pixeis da cor da sombra
    band[alvo, 3] = 0                                   # apaga (alpha 0)
    return out


def limpar_boca(img: np.ndarray, caixa) -> np.ndarray:
    """Apaga a boca gravada preenchendo a zona com a cor do focinho a volta.

    Usa a cor do pixel mais proximo FORA da caixa (transformada de distancia) e funde com
    feather na borda: nao fica remendo chapado nem arrasta o castanho da boca para dentro.
    """
    from scipy.ndimage import distance_transform_edt, gaussian_filter   # scipy local

    out = img.copy()
    H, W = out.shape[:2]
    x, y, w, h = caixa
    x0, y0 = int(x * W), int(y * H)
    x1, y1 = int((x + w) * W), int((y + h) * H)
    buraco = np.zeros((H, W), bool)                    # zona a apagar
    buraco[y0:y1, x0:x1] = True
    buraco &= out[..., 3] > 0                          # so onde ha sprite
    if not buraco.any():
        return out
    dist, (iy, ix) = distance_transform_edt(buraco, return_indices=True)  # vizinho mais perto
    cor = out[..., :3][iy, ix].astype(np.float32)      # cor emprestada de fora
    cor = np.stack([gaussian_filter(cor[..., i], 3) for i in range(3)], axis=-1)  # suaviza
    fundo = dist / 3.0                                 # 0 na borda -> 1 a 3 px para dentro
    fundo = np.clip(fundo, 0, 1)[..., None]
    novo = out[..., :3].astype(np.float32) * (1 - fundo) + cor * fundo
    out[..., :3] = np.where(buraco[..., None], novo, out[..., :3]).astype(np.uint8)
    return out


def recortar(img: np.ndarray, m: np.ndarray) -> tuple[Image.Image, list[int]]:
    """Aplica a mascara (feather incluido) e devolve o recorte + bbox [x,y,w,h] no canvas."""
    al = img[..., 3].astype(np.float32) / 255.0   # alpha original
    a = al * m                                    # alpha cortado pela mascara
    ys, xs = np.nonzero(a > 0.02)                 # bbox do que sobrou
    if len(ys) == 0:                              # parte vazia (ex.: cauda da Frida)
        return Image.new("RGBA", (8, 8), (0, 0, 0, 0)), [0, 0, 0, 0]
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba_out = img[y0:y1, x0:x1].copy()
    rgba_out[..., 3] = (a[y0:y1, x0:x1] * 255.0).round().astype(np.uint8)
    # exporta a 2x: o canvas de 512 px e mostrado a ~700 px, o browser reduz e fica nitido
    im = Image.fromarray(rgba_out)
    up = im.resize((im.width * EXPORT_SCALE, im.height * EXPORT_SCALE), Image.LANCZOS)
    return up, [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]


def desenhar_boca(canvas_wh, caixa, estado: str, cor_contorno, cor_lingua) -> Image.Image:
    """Desenha um dos 3 estados de boca no canvas (coordenadas do sprite, nao do recorte)."""
    W, H = canvas_wh
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))  # camada transparente
    d = ImageDraw.Draw(im)
    x, y, w, h = caixa
    cx, cy = (x + w / 2) * W, (y + h * 0.52) * H  # centro da boca, um pouco abaixo do meio
    bw, bh = w * W, h * H                         # tamanho da caixa em pixeis
    lw = max(2, int(round(H * 0.010)))            # espessura do traco (5 px a 512)
    tinta = tuple(int(c) for c in cor_contorno) + (255,)
    if estado == "fechada":                        # sorriso fechado: arco para baixo
        box = [cx - bw * 0.26, cy - bh * 0.46, cx + bw * 0.26, cy + bh * 0.34]
        d.arc(box, start=20, end=160, fill=tinta, width=lw)
    elif estado == "meia":                         # meia-aberta: oval pequena cheia
        box = [cx - bw * 0.13, cy - bh * 0.30, cx + bw * 0.13, cy + bh * 0.34]
        d.ellipse(box, fill=tinta)
    else:                                          # aberta: oval grande + lingua
        box = [cx - bw * 0.19, cy - bh * 0.44, cx + bw * 0.19, cy + bh * 0.46]
        d.ellipse(box, fill=tinta)
        ling = [box[0] + bw * 0.06, box[3] - bh * 0.30, box[2] - bw * 0.06, box[3] - bh * 0.01]
        d.ellipse(ling, fill=tuple(int(c) for c in cor_lingua) + (255,))
    return im


def cor_contorno(img: np.ndarray) -> tuple[int, int, int]:
    """Cor do traco da arte = mediana dos pixeis mais escuros do sprite."""
    rgb = img[..., :3].reshape(-1, 3).astype(np.int16)
    al = img[..., 3].reshape(-1) > 250
    f = rgb[al]
    escuro = f[f.sum(axis=1) < np.percentile(f.sum(axis=1), 6)]
    return tuple(int(v) for v in np.median(escuro, axis=0))


def cor_lingua(img: np.ndarray, caixa) -> tuple[int, int, int]:
    """Cor da lingua = pixel mais vermelho dentro da caixa da boca."""
    H, W = img.shape[:2]
    x, y, w, h = caixa
    reg = img[int(y * H):int((y + h) * H), int(x * W):int((x + w) * W)]
    rgb = reg[..., :3].astype(np.int16)
    al = reg[..., 3] > 200
    if not al.any():
        return (200, 70, 85)
    score = (rgb[..., 0] - rgb[..., 1]) + (rgb[..., 0] - rgb[..., 2])
    score[~al] = -999
    iy, ix = np.unravel_index(np.argmax(score), score.shape)
    c = reg[iy, ix, :3]
    return (int(c[0]), int(c[1]), int(c[2]))


# ---------------------------------------------------------------- construcao do rig
def construir(quem: str) -> dict:
    """Constroi o rig de uma personagem e devolve o seu anchors.json (dict)."""
    f = FICHA[quem]
    pasta = RIG / quem
    pasta.mkdir(parents=True, exist_ok=True)
    poses = {p.stem: rgba(p) for p in sorted((POSES / quem).glob("*.png"))}
    base = poses[f["base"]]
    H, W = base.shape[:2]

    # -- 1) alinhar todas as poses com a de referencia (corpo inferior tem de coincidir)
    desloc = {}
    for nome, im in poses.items():
        if im.shape != base.shape:                # largura diferente -> alinhar
            dx, dy = alinhar(im, base)
        else:
            dx, dy = 0, 0
        desloc[nome] = (dx, dy)

    pad = 48                                      # margem para a rotacao nao cortar nada
    CW, CH = W + 2 * pad, H                       # canvas normalizado
    def para_canvas(im: np.ndarray, dx: int, dy: int) -> np.ndarray:
        c = np.zeros((CH, CW, 4), np.uint8)        # canvas vazio
        x0 = pad + dx + (W - im.shape[1]) // 2    # centrado + deslocamento medido
        y0 = dy                                   # o fundo do sprite fica em CH
        ys0, ys1 = max(0, y0), min(CH, y0 + im.shape[0])
        xs0, xs1 = max(0, x0), min(CW, x0 + im.shape[1])
        c[ys0:ys1, xs0:xs1] = im[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0]
        return c

    # -- 2) mascar as mascaras uma vez (valem para todas as poses)
    masc = {nome: None for nome in f["partes"]}
    for nome, formas in f["partes"].items():
        m = np.zeros((CH, CW), np.float32)         # mascara acumulada
        for forma in formas:
            # as formas estao em fraccoes do SPRITE; converter para o canvas
            fm = list(forma)
            if forma[0] == "rect":
                fm[1] = (pad + forma[1] * W) / CW
                fm[3] = forma[3] * W / CW
                fm[2] = forma[2] * H / CH
                fm[4] = forma[4] * H / CH
                fm[5] = forma[5] * H / CH
            else:
                fm[1] = (pad + forma[1] * W) / CW
                fm[3] = forma[3] * W / CW
                fm[2] = forma[2] * H / CH
                fm[4] = forma[4] * H / CH
            m = np.maximum(m, mascara_forma(tuple(fm), CW, CH))
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(FEATHER))) / 255.0   # feather: 2,5 px -> sem costura
        masc[nome] = m

    info_partes = {}
    previas = {}                                   # para o QA visual
    # -- 3) cortar as partes de cada pose usada (happy + excited para troca de cara)
    for pose in POSES_USADAS:
        if pose not in poses:                      # pose em falta -> usa a base
            continue
        dx, dy = desloc[pose]
        cv = para_canvas(poses[pose], dx, dy)      # sprite no canvas comum
        if "sombra_gravada" in f:                  # a Luna traz sombra gravada: apagar
            cv = limpar_sombra(cv, f["sombra_gravada"])
        cv = limpar_boca(cv, f["boca"])            # tirar a boca gravada (para o lipsync)
        for nome, m in masc.items():
            sufixo = "" if pose == f["base"] else "~" + pose
            alvo_nome = f"{nome}{sufixo}.png"
            img, bbox = recortar(cv, m)
            img.save(pasta / alvo_nome)
            if pose == f["base"]:
                # ancora em pixeis do canvas (nao do recorte) e em fraccoes do sprite
                ax_f, ay_f = f["ancoras"][nome]
                ancora = [pad + ax_f * W, ay_f * H]
                presente = bbox[2] > 0 and float((np.asarray(img)[..., 3] > 8).mean()) > 0.002
                info_partes[nome] = {
                    "ficheiro": alvo_nome,
                    "bbox": bbox,
                    "ancora": [round(ancora[0], 2), round(ancora[1], 2)],
                    "ancora_frac": [round(ax_f, 4), round(ay_f, 4)],
                    "presente": bool(presente),
                }
                previas[nome] = (m, bbox)
            else:
                info_partes.setdefault(nome, {}).setdefault("variantes", {})[pose] = {
                    "ficheiro": alvo_nome,
                    "bbox": bbox,
                }

    # -- 4) bocas: 3 estados desenhados na zona da boca, em coordenadas do canvas
    caixa = f["boca"]
    caixa_cv = ((pad + caixa[0] * W) / CW, caixa[1], caixa[2] * W / CW, caixa[3])
    contorno = cor_contorno(base)
    lingua = cor_lingua(base, caixa)
    bocas = {}
    for estado in ("fechada", "meia", "aberta"):
        cam = desenhar_boca((CW, CH), caixa_cv, estado, contorno, lingua)
        arr = np.asarray(cam)
        ys, xs = np.nonzero(arr[..., 3] > 0)
        bbox = [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]
        crop = cam.crop((bbox[0], bbox[1], bbox[0] + bbox[2], bbox[1] + bbox[3]))
        nome = f"boca_{estado}.png"
        crop.resize((crop.width * EXPORT_SCALE, crop.height * EXPORT_SCALE),
                    Image.LANCZOS).save(pasta / nome)
        bocas[estado] = {"ficheiro": nome, "bbox": bbox}

    # -- 5) anchors.json
    dados = {
        "quem": quem,
        "fonte": str((POSES / quem / f"{f['base']}.png")).replace("\\", "/"),
        "sprite_px": [W, H],
        "canvas_px": [CW, CH],
        "origem_canvas": [pad, 0],
        "export_scale": EXPORT_SCALE,
        "feather_px": FEATHER,
        "cor_contorno": list(contorno),
        "cor_lingua": list(lingua),
        "partes": info_partes,
        "bocas": bocas,
        "deslocamentos_poses": {k: list(v) for k, v in desloc.items()},
    }
    (pasta / "anchors.json").write_text(json.dumps(dados, indent=2, ensure_ascii=False), "utf-8")

    # -- 6) QA visual das mascaras
    prev = para_canvas(poses[f["base"]], 0, 0)
    prev = limpar_boca(prev, f["boca"])
    fundo = Image.new("RGBA", (CW * len(masc), CH), (250, 248, 244, 255))
    cores = [(255, 0, 0), (0, 120, 255), (0, 170, 90), (240, 150, 0),
             (160, 0, 220), (0, 200, 200), (200, 0, 120), (90, 90, 90), (90, 90, 90)]
    for i, (nome, m) in enumerate(masc.items()):
        p = Image.fromarray(prev).copy()
        tint = Image.new("RGBA", p.size, cores[i % len(cores)] + (255,))
        a = Image.fromarray((m * 150).astype(np.uint8))
        p = Image.composite(tint, p, a)
        d = ImageDraw.Draw(p)
        ax, ay = f["ancoras"][nome]
        d.ellipse([pad + ax * W - 5, ay * H - 5, pad + ax * W + 5, ay * H + 5],
                  outline=(0, 0, 0, 255), width=2)
        d.text((8, 8), nome, fill=(0, 0, 0, 255))
        fundo.alpha_composite(p, (CW * i, 0))
    fundo.convert("RGB").save(RIG / f"_debug-masks-{quem}.png")
    return dados


def main() -> None:
    RIG.mkdir(parents=True, exist_ok=True)
    resumo = {}
    for quem in FICHA:
        dados = construir(quem)
        vazias = [n for n, p in dados["partes"].items() if not p.get("presente", True)]
        resumo[quem] = {"partes": len(dados["partes"]), "vazias": vazias}
        print(f"{quem}: {len(dados['partes'])} partes, canvas {dados['canvas_px']}, "
              f"vazias={vazias or 'nenhuma'}")
    print("rig em", RIG)


if __name__ == "__main__":
    main()
