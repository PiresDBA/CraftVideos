#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
================================================================================
VALIDAR AVATARES v2 — DETECCAO DE ROSTO COM O DETECTOR REAL DO LIVEPORTRAIT
================================================================================

MANUAL DE USO
-------------
Proposito:
    Provar que uma base de avatar (a imagem que o motor vai animar) e mesmo
    DETECTAVEL e RECORTAVEL pelo motor de animacao. Um avatar que o detector
    nao encontra nao e animado: o LivePortrait devolve a imagem de origem
    estatica, frame a frame, e o video final sai com as duas apresentadoras
    de cara fixa. Esta ferramenta apanha esse caso ANTES de gastar uma
    build inteira.

    A ferramenta usa os DETECTORES REAIS do LivePortrait — nao uma aproximacao:
      - pipeline "human": insightface (vendored) + landmarks 106 pontos
      - pipeline "animal": XPose (UniPose-SwinT), 9 pontos de animal
    E o mesmo codigo (src/utils/cropper.py) que o motor executa.

Parametros CLI:
    --imagem <ficheiro>     imagem a validar (obrigatorio, repetivel).
    --pipeline <modo>       "auto" (default) | "human" | "animal"
                            "auto" corre o humano e o animal e reporta ambos.
    --repo <pasta>          repositorio LivePortrait
                            (default: D:\\CRAFT\\tools\\LivePortrait)
    --device <cpu|cuda>     onde correr a deteccao (default: cuda).
    --out <pasta>           onde gravar os recortes faciais e o relatorio.
                            Sem este parametro nada e escrito.
    --min-face <fraccao>    fracao minima do lado da imagem que a face
                            deve ocupar (default: 0.08). Uma face minúscula
                            é detectada mas o recorte sai péssimo.
    --json                  imprime o relatorio em JSON no stdout.

Saidas:
    <out>/<nome>_human_face.png    recorte do pipeline humano (se houver)
    <out>/<nome>_animal_face.png   recorte do pipeline animal (se houver)
    <out>/relatorio-avatar-v2.json relatorio completo (machine-readable)

Codigo de saida:
    0  pelo menos um dos pipelines detectou a face e o recorte é utilizavel
    1  nenhum pipeline detectou a face (o avatar NAO será animado)
    2  erro de uso (ficheiro em falta, etc.)

Dependencias:
    Python do ComfyUI (D:\\Comfy\\ComfyUI\\venv\\Scripts\\python.exe) — tem
    torch, opencv e onnxruntime com CUDA. Os pesos do insightface e do XPose
    ja vem no repositorio LivePortrait: nada se instala, nada se descarrega.

Exemplo:
    D:\\Comfy\\ComfyUI\\venv\\Scripts\\python.exe validar-avatar-v2.py ^
        --imagem ..\\frida.png --imagem ..\\luna.png --out .\\recortes
================================================================================
"""

import argparse
import json
import os
import sys
import traceback
from pathlib import Path

import cv2
import numpy as np

# ---------------------------------------------------------------------------------
# PASSO 1 — resolver o repositorio LivePortrait e tornar o pacote "src" importavel.
# O LivePortrait resolve os pesos por caminho RELATIVO ao proprio ficheiro
# (src/config/base_config.py -> make_abs_path), por isso o cwd pode ser outro;
# mesmo assim, mudamos para o repo para que qualquer caminho relativo interno
# continue a funcionar.
# ---------------------------------------------------------------------------------
DEFAULT_REPO = r"D:\CRAFT\tools\LivePortrait"


def preparar_repo(repo: Path) -> None:
    """Poe o repositorio LivePortrait no sys.path e posiciona o cwd."""
    if not repo.is_dir():
        raise FileNotFoundError("repositorio LivePortrait nao encontrado: " + str(repo))
    sys.path.insert(0, str(repo))
    os.chdir(repo)


# ---------------------------------------------------------------------------------
# PASSO 2 — carregar a imagem como RGB (o Cropper trabalha em RGB; o insightface
# recebe BGR e converte internamente).
# ---------------------------------------------------------------------------------
def carregar_rgb(caminho: Path) -> np.ndarray:
    """Le a imagem do disco e devolve um array RGB."""
    if not caminho.is_file():
        raise FileNotFoundError("imagem nao encontrada: " + str(caminho))
    bgr = cv2.imread(str(caminho), cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("nao consegui ler a imagem (formato invalido?): " + str(caminho))
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


# ---------------------------------------------------------------------------------
# PASSO 3 — correr UM pipeline de deteccao.
#
# "human": Cropper com image_type='human_face'. Se nao houver face, o
#          crop_source_image devolve None (o proprio LivePortrait avisa
#          "No face detected in the source image.").
# "animal": Cropper com image_type='animal_face'. O XPose e um detector de
#          keypoints de animal: devolve None ou lanca quando nao encontra.
# ---------------------------------------------------------------------------------
def correr_pipeline(modo: str, img_rgb: np.ndarray, crop_cfg, repo: Path, device: str):
    """
    Corre um pipeline e devolve um dicionario com o resultado.

    Nunca lanca: uma falha e registada como 'erro' para que o programa
    continue e reporte o outro pipeline.
    """
    from src.utils.cropper import Cropper

    resultado = {
        "pipeline": modo,
        "detectado": False,
        "bbox": None,
        "crop": None,          # ndarray (guardado em memoria)
        "erro": None,
    }

    try:
        force_cpu = device == "cpu"
        cropper = Cropper(
            crop_cfg=crop_cfg,
            image_type="human_face" if modo == "human" else "animal_face",
            flag_force_cpu=force_cpu,
            device_id=crop_cfg.device_id,
        )

        ret = cropper.crop_source_image(img_rgb, crop_cfg)
        if ret is None:
            resultado["erro"] = "nenhum rosto detectado"
            return resultado

        # bbox: o LivePortrait devolve-o como [x1, y1, x2, y2] em pixeles.
        bbox = ret.get("bbox")
        if bbox is not None:
            resultado["bbox"] = [round(float(v), 1) for v in np.asarray(bbox).reshape(-1)[:4]]

        crop = ret.get("img_crop")
        if crop is None:
            resultado["erro"] = "rosto detectado mas sem recorte"
            return resultado

        resultado["detectado"] = True
        resultado["crop"] = crop
        resultado["crop_shape"] = [int(crop.shape[1]), int(crop.shape[0])]

        # --- o retangulo do rosto dentro do recorte: mede se o detector
        #     apanhou a cara OU APANHOU SÓ PARTE (um olho, a testa).
        #     O LivePortrait usa esta regiao para reconstruir a cara, e um
        #     recorte pela metade da cara produz uma deformacao grotesca.
        lmk = ret.get("lmk_crop")
        if lmk is not None:
            lmk = np.asarray(lmk)
            if lmk.ndim == 2 and lmk.shape[0] >= 5:
                xs, ys = lmk[:, 0], lmk[:, 1]
                # normaliza para [0,1] sobre o lado do recorte
                lado = float(crop.shape[0])
                frac_x = float((xs.max() - xs.min()) / lado)
                frac_y = float((ys.max() - ys.min()) / lado)
                resultado["face_coverage"] = {
                    "largura_relativa": round(frac_x, 4),
                    "altura_relativa": round(frac_y, 4),
                }

        del cropper
        return resultado

    except Exception as exc:  # noqa: BLE001 — o erro tem de ser reportado, nao fatal
        resultado["erro"] = (type(exc).__name__ + ": " + str(exc)).strip()
        resultado["stack"] = traceback.format_exc(limit=3)
        return resultado


# ---------------------------------------------------------------------------------
# PASSO 4 — o programa principal.
# ---------------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(
        description="Valida se uma base de avatar e detectavel pelo motor de animacao."
    )
    ap.add_argument("--imagem", action="append", required=True,
                    help="imagem a validar (repetivel)")
    ap.add_argument("--pipeline", default="auto", choices=["auto", "human", "animal"])
    ap.add_argument("--repo", default=DEFAULT_REPO)
    ap.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    ap.add_argument("--out", default="")
    ap.add_argument("--min-face", type=float, default=0.08)
    ap.add_argument("--json", action="store_true", help="imprime JSON no stdout")
    args = ap.parse_args()

    repo = Path(args.repo)
    out_dir = Path(args.out).resolve() if args.out else None
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)

    # Resolve os caminhos ANTES de mudar de directorio: preparar_repo() faz
    # chdir para o repo LivePortrait e um caminho relativo apontaria la.
    caminhos = [Path(c).resolve() for c in args.imagem]

    preparar_repo(repo)

    # O CropConfig traz os valores por omissao do proprio LivePortrait
    # (dsize 512, scale 2.3, det_thresh 0.1, pesos ja presentes no repo).
    from src.config.crop_config import CropConfig
    crop_cfg = CropConfig()

    pipelines = ["human", "animal"] if args.pipeline == "auto" else [args.pipeline]

    relatorio = {
        "repo": str(repo),
        "device": args.device,
        "minFace": args.min_face,
        "imagens": [],
    }

    ok_global = True

    for img_path in caminhos:
        entrada = {
            "imagem": str(img_path),
            "existe": img_path.is_file(),
            "pipelines": [],
        }

        if not entrada["existe"]:
            entrada["erro"] = "ficheiro nao encontrado"
            relatorio["imagens"].append(entrada)
            ok_global = False
            continue

        img_rgb = carregar_rgb(img_path)
        entrada["dimensao"] = [int(img_rgb.shape[1]), int(img_rgb.shape[0])]

        algum_ok = False
        for modo in pipelines:
            res = correr_pipeline(modo, img_rgb, crop_cfg, repo, args.device)

            # --- o recorte e "utilizavel"? tem de cobrir uma fraccao
            #     minima da imagem, senao o detector apanhou so um pedaco.
            util = False
            if res["detectado"]:
                bbox = res.get("bbox")
                if bbox:
                    largura = abs(bbox[2] - bbox[0])
                    altura = abs(bbox[3] - bbox[1])
                    lado = max(float(img_rgb.shape[0]), float(img_rgb.shape[1]))
                    frac = max(largura, altura) / lado
                    res["fraccao_imagem"] = round(frac, 4)
                    util = frac >= args.min_face
                else:
                    # sem bbox: usa a cobertura relativa dos landmarks
                    cov = res.get("face_coverage") or {}
                    util = float(cov.get("largura_relativa", 0)) >= args.min_face
                res["utilizavel"] = util

            # --- grava o recorte quando pedido
            if out_dir and res["detectado"] and res.get("crop") is not None:
                nome = img_path.stem + "_" + modo + "_face.png"
                destino = out_dir / nome
                cv2.imwrite(str(destino), cv2.cvtColor(res["crop"], cv2.COLOR_RGB2BGR))
                res["crop_saved"] = str(destino)

            # o crop em memoria nao serializa em JSON
            res.pop("crop", None)

            if util:
                algum_ok = True

            entrada["pipelines"].append(res)

        entrada["animavel"] = algum_ok
        if not algum_ok:
            ok_global = False
        relatorio["imagens"].append(entrada)

    # ------------------------------------------------------------------ relatorio
    if out_dir:
        destino_json = out_dir / "relatorio-avatar-v2.json"
        destino_json.write_text(
            json.dumps(relatorio, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    if args.json:
        print(json.dumps(relatorio, indent=2, ensure_ascii=False))
    else:
        for img in relatorio["imagens"]:
            print("--- " + img["imagem"])
            if not img["existe"]:
                print("    ERRO: ficheiro nao encontrado")
                continue
            for p in img["pipelines"]:
                if p["detectado"]:
                    estado = "utilizavel" if p.get("utilizavel") else "pequeno demais"
                    print("    {:7s} DETECTADO  bbox={}  crop={}  {}".format(
                        p["pipeline"], p["bbox"], p.get("crop_shape"), estado))
                else:
                    print("    {:7s} NAO DETECTADO  ({})".format(
                        p["pipeline"], p.get("erro") or "sem motivo"))
        print("")
        print("veredicto: " + ("animavel" if ok_global else "NAO animavel em nenhum pipeline"))

    return 0 if ok_global else 1


if __name__ == "__main__":
    sys.exit(main())
