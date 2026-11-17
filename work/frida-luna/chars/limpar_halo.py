"""Remove o halo branco de autocolante das folhas, deixando o desenho 'direto no papel'.

Como funciona: faz flood-fill a partir das bordas da imagem pelos píxeis que são
fundo (creme) OU halo (branco quase puro). Tudo o que é alcançável a partir da borda
torna-se transparente; o interior do desenho (peito branco, focinho) fica intacto
porque não está ligado à borda.

Saída: <nome>-ok.png (RGBA transparente) e <nome>-ok-flat.png (achatado no creme).
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

CHARS = Path(r"D:\CRAFT\work\frida-luna\chars")
CREAM = np.array([244, 233, 216], dtype=np.int16)


def is_background(px: np.ndarray) -> bool:
    """Fundo ou halo: creme próximo, ou branco/quase-branco de baixa saturação."""
    d_cream = np.abs(px.astype(np.int16) - CREAM).sum()
    if d_cream < 45:
        return True
    mx, mn = int(px.max()), int(px.min())
    return mx >= 232 and (mx - mn) <= 14


def clean(path: Path) -> tuple[Path, Path]:
    im = Image.open(path).convert("RGB")
    a = np.array(im)
    h, w, _ = a.shape

    # cor de fundo real: mediana da moldura de 3 px (o creme varia de folha para folha)
    border = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3),
                             a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(border, axis=0).astype(np.int16)

    def is_bg(px: np.ndarray) -> bool:
        """Fundo (cor amostrada), halo branco e sombra suave do autocolante.

        O contorno escuro do desenho (distância >200 ao fundo) funciona como barreira,
        por isso uma tolerância larga aqui não come o peito branco nem o focinho.
        """
        if np.abs(px.astype(np.int16) - bg).sum() < 95:
            return True
        mx, mn = int(px.max()), int(px.min())
        return mx >= 200 and (mx - mn) <= 30

    visited = np.zeros((h, w), dtype=bool)
    q = deque()

    for x in range(w):
        for y in (0, h - 1):
            if not visited[y, x] and is_bg(a[y, x]):
                visited[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y, x] and is_bg(a[y, x]):
                visited[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_bg(a[ny, nx]):
                visited[ny, nx] = True
                q.append((ny, nx))

    rgba = np.dstack([a, np.where(visited, 0, 255).astype(np.uint8)])

    # limpeza: manter apenas componentes grandes (as figuras); apagar restos de sombra
    solid = ~visited
    seen = np.zeros_like(solid)
    keep = np.zeros_like(solid)
    for sy in range(h):
        for sx in range(w):
            if not solid[sy, sx] or seen[sy, sx]:
                continue
            comp = []
            dq = deque([(sy, sx)])
            seen[sy, sx] = True
            while dq:
                y, x = dq.popleft()
                comp.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        dq.append((ny, nx))
            if len(comp) >= 4000:
                for y, x in comp:
                    keep[y, x] = True
    dropped = int(solid.sum() - keep.sum())
    rgba[..., 3] = np.where(keep, 255, 0).astype(np.uint8)

    out = path.with_name(path.stem + "-ok.png")
    Image.fromarray(rgba, "RGBA").save(out)

    flat = None  # placeholder removido; o achatamento é feito abaixo com o canvas
    # achatado: junta sobre o creme
    canvas = Image.new("RGB", (w, h), tuple(int(c) for c in CREAM))
    canvas.paste(Image.fromarray(rgba, "RGBA"), (0, 0), Image.fromarray(rgba, "RGBA"))
    flat_out = path.with_name(path.stem + "-ok-flat.png")
    canvas.save(flat_out)
    print(f"{path.name} -> {out.name} ({100*visited.mean():.1f}% removido) + {flat_out.name}")
    return out, flat_out


for name in ("frida-v2.png", "luna-v2.png"):
    clean(CHARS / name)
