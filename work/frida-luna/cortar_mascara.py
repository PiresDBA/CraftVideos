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

    # linha de chao continua: liga todas as figuras e estraga a separacao.
    # Tem de ser UMA FAIXA FINA e ISOLADA (com fundo por baixo). Sem isto, numa tira de
    # bonecos pequenos a faixa dos proprios pes tem cobertura alta e era apagada.
    cobertura = cand.mean(axis=1)
    alto = cobertura >= chao
    linhas_chao = np.zeros_like(alto)
    y = 0
    while y < len(alto):
        if not alto[y]:
            y += 1
            continue
        f = y
        while f + 1 < len(alto) and alto[f + 1]:
            f += 1
        comprimento = f - y + 1
        por_baixo = cobertura[f + 1:f + 9] if f + 1 < len(cobertura) else np.array([])
        fundo_depois = len(por_baixo) == 0 or float(np.mean(por_baixo)) < 0.35
        if comprimento <= 8 and fundo_depois:
            linhas_chao[y:f + 1] = True
            print(f"  linha de chao removida nas linhas {y}-{f} "
                  f"({comprimento} px, fundo por baixo)")
        y = f + 1

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
    area_min = int(sys.argv[sys.argv.index("--area-min") + 1]) if "--area-min" in sys.argv else 400
    chao = float(sys.argv[sys.argv.index("--chao") + 1]) if "--chao" in sys.argv else 0.92

    dst.mkdir(parents=True, exist_ok=True)
    for f in dst.glob("*.png"):
        f.unlink()

    imagem = Image.open(src).convert("RGBA")
    rgba = np.array(imagem)
    alfa_existente = rgba[:, :, 3]

    # Se o Flow entregou a imagem com fundo transparente de verdade, NAO ha que recortar
    # por cor: usamos o alfa que veio da geracao. Isto elimina uma fonte grande de erro
    # (cortar a pelagem creme que tem a cor do papel).
    transparente = (alfa_existente.min() < 250 and
                    float((alfa_existente < 128).mean()) > 0.05)
    if transparente:
        print("  imagem ja tem fundo transparente — alfa aproveitado, sem recorte por cor")
        rgb = rgba[:, :, :3]
        fig = alfa_existente > 128
        alfa = alfa_existente
    else:
        rgb = rgba[:, :, :3]
        fig = mascara_figuras(rgb, limiar, chao)
        alfa = alfa_suave(fig)

    rot, n = ndimage.label(fig)
    areas = ndimage.sum(fig, rot, index=range(1, n + 1))
    caixas = ndimage.find_objects(rot)
    maior = max(areas) if len(areas) else 0

    # A sombra de contacto e criada na animacao (depende do chao de cada cena), nunca
    # vem no sprite. O Flow as vezes desenha uma oval baixa e achatada: remove-la aqui.
    candidatos = []
    for i, area in enumerate(areas):
        if area < area_min:
            continue
        sl = caixas[i]
        alt, larg = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        no_fundo = sl[0].start > fig.shape[0] * 0.82
        oval = (larg / max(1, alt)) > 2.2 and area < maior * 0.30
        if no_fundo and oval:
            print(f"  sombra descartada: componente {i+1} ({larg}x{alt})")
            continue
        candidatos.append(i + 1)

    # Figuras encostadas fundem-se num componente so. O prompt agora exige espacamento
    # minimo de 1/4 da largura, mas se ainda acontecer avisamos em vez de cortar mal.
    if len(candidatos) < 4 and candidatos:
        print("  AVISO: menos de 4 componentes — as figuras podem estar encostadas. "
              "Rejeitar a folha e pedir mais espacamento no Flow.")

    figs = candidatos
    figs.sort(key=lambda k: caixas[k - 1][1].start)
    print(f"componentes: {n} | figuras usadas: {len(figs)}")
    if len(figs) < 4:
        raise SystemExit("poucas figuras - verifica a imagem ou baixa o --area-min")

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
