"""Edicao de imagem (image-to-image) via NVIDIA NIM FLUX.1-Kontext.

Porque isto e o ponto critico: gerar de novo muda o personagem; editar a folha
aprovada mantem corpo, traco e proporcoes - so a expressao muda.

Uso:  py gen_edit.py <in.png> <out.png> "<instrucao>" [--w 832 --h 1024]
"""
import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENV = Path(r"D:\CRAFT\VoiceCraft\.env")
KEYS = [l.split("=", 1)[1].strip() for l in ENV.read_text(encoding="utf-8", errors="replace").splitlines()
        if l.strip().startswith("NVIDEA_TTS_API") and l.split("=", 1)[1].strip().startswith("nvapi-")]

ENDPOINTS = [
    "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-kontext-dev",
    "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-kontext-pro",
]


def post(key, url, payload):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Accept": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=240) as r:
        return json.loads(r.read().decode())


def main():
    src, out, prompt = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    w = int(sys.argv[sys.argv.index("--w") + 1]) if "--w" in sys.argv else 832
    h = int(sys.argv[sys.argv.index("--h") + 1]) if "--h" in sys.argv else 1024
    b64 = base64.b64encode(src.read_bytes()).decode()
    errs = []
    for key in KEYS:
        for url in ENDPOINTS:
            for payload in ({"prompt": prompt, "image": b64, "width": w, "height": h},
                            {"prompt": prompt, "image": b64},
                            {"prompt": prompt, "image": f"{src.as_posix()}"}):
                try:
                    d = post(key, url, payload)
                    arts = d.get("artifacts") or []
                    if not arts or not arts[0].get("base64"):
                        errs.append(f"{url.split('/')[-1]} sem artifact: {str(d)[:160]}")
                        continue
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(base64.b64decode(arts[0]["base64"]))
                    print(f"OK {url.split('/')[-1]} -> {out} ({out.stat().st_size/1024:.0f} KB)")
                    return 0
                except urllib.error.HTTPError as e:
                    errs.append(f"{url.split('/')[-1]} keys={list(payload)} HTTP {e.code}: {e.read().decode('utf-8','replace')[:200]}")
                except Exception as e:  # noqa: BLE001
                    errs.append(f"{url.split('/')[-1]} {type(e).__name__}: {str(e)[:160]}")
    print("FALHOU")
    for e in dict.fromkeys(errs):
        print("  -", e)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
