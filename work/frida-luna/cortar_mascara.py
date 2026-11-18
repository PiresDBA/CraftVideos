"""Corta uma fila de figuras separando o fundo por LIGACAO A BORDA (nao por cor).

Porque nao por cor: o peito, a barriga e o rosto sao creme/branco, quase iguais ao fundo.
Um limiar de cor cava buracos dentro do corpo (a imagem fica transparente por dentro).
Aqui o fundo e tudo o que, sendo da cor do fundo, esta LIGADO a borda da imagem. O que
esta fechado dentro da silhueta fica figura, mesmo que a cor seja igual ao fundo.

Passos:
1. dif = distancia de cor ao fundo (mediana das bordas);
2. candidato = dif >= limiar;
3. remove as linhas de chao (cobertura quase total) — senao ligam todas as figuras;
4. fundo = componentes de ~candidato que tocam a borda;
5. figura = tudo o que nao e fundo  -> inclui peito/barriga/rosto;
6. alfa com bordo suave de 1 px;
7. figuras separadas por componentes conectados, ordenadas por x, alinhadas pela base
   e pela altura mediana.

Uso: py cortar_mascara.py <imagem> <pasta-saida> [--limiar 26] [--area-min 2500] [--chao 0.92]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def mascara_figuras(im: np.ndarray, limiar: int, chao: float = 0.92):
    borda = np.concatenate([im[:3].reshape(-1, 3), im[-3:].reshape(-1, 3),
                            im[:, :3].reshape(-1, 3), im[:, -3:].reshape(-1, 3)])
    bg = np.median(borda, axis=0)
    dif = np.abs(im.astype(int) - bg.astype(int)).sum(axis=2)
    cand = dif >= limiar

    # linha de chao continua: liga todas as figuras e estraga a separacao
    cobertura = cand.mean(axis=1)
    linhas_chao = cobertura >= chao
    if linhas_chao.any():
        cand[linhas_chao, :] = False
        ys = np.nonzero(linhas_chao)[0]
        print(f"  linha de chao removida nas linhas {ys.min()}-{ys.max()}")

    # fundo = cor-de-fundo ligado a borda
    rot_bg, n_bg = ndimage.label(~cand)
    na_borda = set(np.concatenate([rot_bg[0, :], rot_bg[-1, :],
                                   rot_bg[:, 0], rot_bg[:, -1]]).tolist())
    na_borda.discard(0)
    fundo = np.isin(rot_bg, list(na_borda))
    figura = ~fundo

    # fecha fissuras finas do contorno sem inchar a silhueta
    figura = ndimage.binary_closing(figura, structure=np.ones((3, 3)), iterations=1)
    figura = ndimage.binary_opening(figura, structure=np.ones((2, 2)), iterations=1)
    return figura


def alfa_suave(mask: np.ndarray) -> np.ndarray:
    suave = ndimage.gaussian_filter(mask.astype(np.float32), 0.8)
    interior = ndimage.binary_erosion(mask, structure=np.ones((3, 3)), iterations=1)
    suave[interior] = 1.0
    return np.clip(suave * 255, 0, 255).astype(np.uint8)


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    limiar = int(sys.argv[sys.argv.index("--limiar") + 1]) if "--limiar" in sys.argv else 26
    area_min = int(sys.argv[sys.argv.index("--area-min") + 1]) if "--area-min" in sys.argv else 2500
    chao = float(sys.argv[sys.argv.index("--chao") + 1]) if "--chao" in sys.argv else 0.92

    dst.mkdir(parents=True, exist_ok=True)
    for f in dst.glob("*.png"):
        f.unlink()

    rgb = np.array(Image.open(src).convert("RGB"))
    fig = mascara_figuras(rgb, limiar, chao)
    alfa = alfa_suave(fig)

    rot, n = ndimage.label(fig)
    areas = ndimage.sum(fig, rot, index=range(1, n + 1))
    caixas = ndimage.find_objects(rot)
    figs = [i + 1 for i, a in enumerate(areas) if a >= area_min]
    figs.sort(key=lambda k: caixas[k - 1][1].start)
    print(f"componentes: {n} | figuras (area>={area_min}): {len(figs)}")
    if len(figs) < 4:
        raise SystemExit("poucas figuras — verifica a imagem ou baixa o --area-min")

    recortes = []
    for k in figs:
        sl = caixas[k - 1]
        sub_rgb = rgb[sl]
        sub_alfa = np.where(rot[sl] == k, alfa[sl], 0)
        recortes.append(Image.fromarray(np.dstack([sub_rgb, sub_alfa]), "RGBA"))

    alturas = sorted(r.height for r in recortes)
    alvo = alturas[len(alturas) // 2]
    largura = max(round(r.width * alvo / r.height) for r in recortes) + 10
    for i, r in enumerate(recortes):
        s = r.resize((round(r.width * alvo / r.height), alvo), Image.LANCZOS)
        canvas = Image.new("RGBA", (largura, alvo + 8), (0, 0, 0, 0))
        canvas.paste(s, ((largura - s.width) // 2, alvo + 8 - s.height), s)
        canvas.save(dst / f"f{i:02d}.png")
    print(f"{len(recortes)} frames -> {dst} (altura {alvo}, largura {largura})")


if __name__ == "__main__":
    main()
