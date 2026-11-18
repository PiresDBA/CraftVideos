"""Extrai os ciclos de movimento das sheets oficiais do StickFilms.

Fonte: C:\\Users\\Pires\\StickFilms\\characters\\<frida|luna>\\sheet-poses.jpg (grelha 12 colunas)
Catalogo: poses.json de cada personagem (as sequencias sao as que o artista desenhou).

Saida: chars\\stick\\<quem>\\<mov>_<idx>.png (RGBA, 512 px de altura) + movimentos.json
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(r"C:\Users\Pires\StickFilms\characters")
DST = Path(r"D:\CRAFT\work\frida-luna\chars\stick")
COLS = 12
H = 512

# movimento -> (lista de indices, fps) lidos do poses.json
USAR = {
    "frida": ["walk", "idle", "run", "jump", "dance"],
    "luna": ["walk", "idle", "run", "dance"],
}


def sem_fundo(cell: Image.Image) -> Image.Image:
    """Remove o fundo claro da celula por flood-fill a partir das bordas."""
    im = cell.convert("RGBA")
    a = np.array(im.convert("RGB"))
    h, w, _ = a.shape
    border = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3),
                             a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(border, axis=0)

    def is_bg(px):
        return np.abs(px.astype(np.int16) - bg.astype(np.int16)).sum() < 60

    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y, x] and is_bg(a[y, x]):
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y, x] and is_bg(a[y, x]):
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and is_bg(a[ny, nx]):
                seen[ny, nx] = True
                q.append((ny, nx))

    rgba = np.dstack([a, np.where(seen, 0, 255).astype(np.uint8)])
    out = Image.fromarray(rgba, "RGBA")
    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out


def main():
    catalogo = {}
    for who, movs in USAR.items():
        poses = json.loads((SRC / who / "poses.json").read_text(encoding="utf-8"))
        sheet = Image.open(SRC / who / "sheet-poses.jpg").convert("RGB")
        cw, ch = sheet.width // COLS, sheet.height // (poses["rows"])

        out_dir = DST / who
        out_dir.mkdir(parents=True, exist_ok=True)

        for mov in movs:
            conf = poses["motions"].get(mov)
            if not conf:
                continue
            seq = (conf.get("cycles") or [conf.get("poses")] or [[]])[0]
            if not seq:
                continue
            files = []
            for idx in seq:
                r, c = divmod(idx, COLS)
                cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
                cut = sem_fundo(cell)
                scale = H / cut.height
                cut = cut.resize((max(1, round(cut.width * scale)), H), Image.LANCZOS)
                name = f"{mov}_{idx:03d}.png"
                cut.save(out_dir / name)
                files.append(name)
            catalogo.setdefault(who, {})[mov] = {"fps": conf.get("fps", 8), "frames": files}
            print(f"{who}/{mov}: {len(files)} frames")

    (DST / "movimentos.json").write_text(json.dumps(catalogo, indent=1, ensure_ascii=False), encoding="utf-8")
    print("movimentos.json escrito")


if __name__ == "__main__":
    main()
