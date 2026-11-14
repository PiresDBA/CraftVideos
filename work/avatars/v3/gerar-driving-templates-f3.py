#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
================================================================================
GERAR DRIVING TEMPLATES F3 — LivePortrait + Bases v2
================================================================================

MANUAL DE USO
-------------
Proposito:
    Gerar os 6 templates de driving que o contrato de direcao (direcao.mjs /
    CATALOGO_DRIVERS) espera. Cada template e um video do avatar (Frida ou Luna
    v2) animado por um driving nativo do LivePortrait.

    Os templates sao guardados em work/avatars/driving_templates/ com os
    nomes exatos que o CATALOGO_DRIVERS referencia:
      frida_anchor_neutral_breathing.mp4
      frida_anchor_emphatic_nod.mp4
      frida_listening_to_luna.mp4
      luna_cohost_listening_react.mp4
      luna_cohost_curious_headtilt.mp4
      luna_cohost_skeptical_ironic.mp4

    O motor (yt-clone-build.mjs) ja sabe ler estes ficheiros: o campo
    driving_template no estado de cada beat aponta para eles.

Parametros CLI:
    --bases-dir <pasta>     onde estao as bases v2 (default: work/avatars/v2)
    --out-dir <pasta>       onde gravar os templates (default: work/avatars/driving_templates)
    --repo <pasta>          repositorio LivePortrait (default: D:\\CRAFT\\tools\\LivePortrait)
    --python <exe>          python do ComfyUI/LivePortrait (default: D:\\Comfy\\ComfyUI\\venv\\Scripts\\python.exe)
    --device <cpu|cuda>     dispositivo (default: cuda)
    --template <nome>       template especifico a gerar (default: todos)
    --dry-run               so imprime o plano, nao executa
    --ajuda                 mostra esta ajuda

Mapeamento template -> (base, driving nativo):
    frida_anchor_neutral_breathing.mp4: base=frida, driving=d0.mp4
    frida_anchor_emphatic_nod.mp4:      base=frida, driving=d13.mp4
    frida_listening_to_luna.mp4:        base=frida, driving=d0.mp4
    luna_cohost_listening_react.mp4:    base=luna,  driving=d13.mp4
    luna_cohost_curious_headtilt.mp4:   base=luna,  driving=d6.mp4
    luna_cohost_skeptical_ironic.mp4:   base=luna,  driving=d9.mp4

Dependencias:
    LivePortrait (inference.py) + bases v2 (geradas na F2). O ComfyUI nao e
    necessario para este passo.

Exemplo:
    D:\\Comfy\\ComfyUI\\venv\\Scripts\\python.exe gerar-driving-templates-f3.py ^
        --bases-dir ..\\v2 --out-dir ..\\driving_templates
================================================================================
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DEFAULT_REPO = r"D:\\CRAFT\\tools\\LivePortrait"
DEFAULT_PYTHON = r"D:\\Comfy\\ComfyUI\\venv\\Scripts\\python.exe"

# Mapeamento: template_destino -> {base, driving_nativo}
MAPEAMENTO = {
    # Frida
    "frida_anchor_neutral_breathing.mp4":   {"base": "frida", "driving": "d0.mp4"},
    "frida_anchor_emphatic_nod.mp4":        {"base": "frida", "driving": "d13.mp4"},
    "frida_listening_to_luna.mp4":          {"base": "frida", "driving": "d0.mp4"},

    # Luna
    "luna_cohost_listening_react.mp4":      {"base": "luna",  "driving": "d13.mp4"},
    "luna_cohost_curious_headtilt.mp4":     {"base": "luna",  "driving": "d6.mp4"},
    "luna_cohost_skeptical_ironic.mp4":     {"base": "luna",  "driving": "d9.mp4"},
}


def main():
    ap = argparse.ArgumentParser(description="Gerar driving templates F3 para Frida & Luna")
    ap.add_argument("--bases-dir", default=r"work\avatars\v2")
    ap.add_argument("--out-dir", default=r"work\avatars\driving_templates")
    ap.add_argument("--repo", default=DEFAULT_REPO)
    ap.add_argument("--python", default=DEFAULT_PYTHON)
    ap.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    ap.add_argument("--template", help="template especifico a gerar (ex: frida_anchor_neutral_breathing.mp4)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--ajuda", action="store_true")
    args = ap.parse_args()

    if args.ajuda:
        print(__doc__)
        return 0

    repo = Path(args.repo)
    py_exe = Path(args.python)
    bases_dir = Path(args.bases_dir).resolve()
    out_dir = Path(args.out_dir).resolve()

    if not repo.is_dir():
        print(f"ERRO: repositorio LivePortrait nao encontrado: {repo}")
        return 2
    if not py_exe.is_file():
        print(f"ERRO: python nao encontrado: {py_exe}")
        return 2
    if not bases_dir.is_dir():
        print(f"ERRO: bases-dir nao encontrado: {bases_dir}")
        return 2

    # Filtra templates
    templates = list(MAPEAMENTO.items())
    if args.template:
        templates = [(k, v) for k, v in templates if k == args.template]
        if not templates:
            print(f"ERRO: template '{args.template}' nao existe no mapeamento")
            return 2

    if not templates:
        print("ERRO: nenhum template seleccionado apos filtros")
        return 2

    # Imprime plano
    print("=== PLANO DE GERACAO F3 ===")
    for nome, info in templates:
        base_path = bases_dir / f"{info['base']}_v2_base.png"
        driving_path = repo / "assets" / "examples" / "driving" / info["driving"]
        print(f"  {nome:45s} <- base={info['base']:6s} ({'OK' if base_path.is_file() else 'FALTA'})  driving={info['driving']:10s} ({'OK' if driving_path.is_file() else 'FALTA'})")

    if args.dry_run:
        print("\n[dry-run] nada executado")
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)

    # PATH do ffmpeg (o inference.py faz fast_check_ffmpeg() no PATH)
    ffmpeg_bin = r"C:\Users\Pires\AppData\Local\hermes\tools\ffmpeg-9.0.1-win32-x64\bin"
    env = os.environ.copy()
    env["PATH"] = ffmpeg_bin + os.pathsep + env.get("PATH", "")
    env["PYTHONIOENCODING"] = "utf-8"

    # Executa cada template via inference.py do LivePortrait
    ok = 0
    falhas = 0
    for nome, info in templates:
        base_path = bases_dir / f"{info['base']}_v2_base.png"
        driving_path = repo / "assets" / "examples" / "driving" / info["driving"]
        saida = out_dir / nome

        if not base_path.is_file():
            print(f"  [FALHA] {nome}: base nao encontrada ({base_path})")
            falhas += 1
            continue
        if not driving_path.is_file():
            print(f"  [FALHA] {nome}: driving nao encontrado ({driving_path})")
            falhas += 1
            continue

        # inference.py escreve num DIRETORIO, nao num ficheiro.
        # Usamos uma pasta temporaria e depois movemos o ficheiro produzido.
        with tempfile.TemporaryDirectory(prefix=f"lp_{nome}_") as tmpdir:
            cmd = [
                str(py_exe), "inference.py",
                "-s", str(base_path),
                "-d", str(driving_path),
                "-o", tmpdir,
                "--flag-stitching",
                "--flag-relative-motion",
                "--source-max-dim", "512",
                "--device-id", "0",
                "--animation-region", "all",
            ]
            if args.device == "cpu":
                cmd.append("--flag-force-cpu")

            print(f"  [GERAR] {nome} ...")
            # Muda para o repo para que os caminhos relativos dos pesos funcionem
            proc = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, timeout=1800, env=env)
            if proc.returncode != 0:
                print(f"  [FALHA] {nome}: LivePortrait saiu com codigo {proc.returncode}")
                print(f"    stderr: {proc.stderr[-500:]}")
                falhas += 1
                continue

            # Procura o MP4 gerado na pasta temporaria
            gerados = list(Path(tmpdir).glob("*.mp4"))
            if not gerados:
                print(f"  [FALHA] {nome}: nenhum MP4 produzido em {tmpdir}")
                falhas += 1
                continue

            # Move o primeiro (e unico) para o destino final
            shutil.move(str(gerados[0]), str(saida))
            size_kb = round(saida.stat().st_size / 1024, 1)
            print(f"  [OK] {nome} -> {saida} ({size_kb} KB)")
            ok += 1

    print(f"\n=== RESUMO F3: {ok} OK, {falhas} falhas ===")
    return 0 if falhas == 0 else 1


if __name__ == "__main__":
    sys.exit(main())