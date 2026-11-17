"""Gera imagem via NVIDIA NIM (FLUX.1-dev / SDXL) usando as chaves do VoiceCraft/.env.

Uso:  py gen_nvidia.py <out.png> "<prompt>" [--size 1024]
Tenta, por ordem: flux.1-dev -> stable-diffusion-3.5-large -> sdxl.
"""
import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENV = Path(r"D:\CRAFT\VoiceCraft\.env")
KEYS = []
for line in ENV.read_text(encoding="utf-8", errors="replace").splitlines():
    if line.strip().startswith("NVIDEA_TTS_API"):
        KEYS.append(line.split("=", 1)[1].strip())
KEYS = [k for k in KEYS if k.startswith("nvapi-")]

MODELS = [
    ("flux", "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
     lambda p, w, h: {"prompt": p, "mode": "base", "steps": 40,
                      "width": w, "height": h, "cfg_scale": 3.5}),
    ("flux-plain", "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
     lambda p, w, h: {"prompt": p, "width": w, "height": h}),
    ("flux-schnell", "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
     lambda p, w, h: {"prompt": p, "width": w, "height": h}),
]


def attempt(key, url, body):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode("utf-8"))
    arts = data.get("artifacts") or []
    if not arts:
        raise RuntimeError(f"sem artifacts: {str(data)[:300]}")
    b64 = arts[0].get("base64")
    if not b64:
        raise RuntimeError(f"artifact sem base64: {str(arts[0])[:200]}")
    return base64.b64decode(b64)


def main():
    out = Path(sys.argv[1])
    prompt = sys.argv[2]
    w = h = 1024
    if "--w" in sys.argv:
        w = int(sys.argv[sys.argv.index("--w") + 1])
    if "--h" in sys.argv:
        h = int(sys.argv[sys.argv.index("--h") + 1])
    if "--size" in sys.argv:
        w = h = int(sys.argv[sys.argv.index("--size") + 1])

    errors = []
    for key in KEYS:
        for name, url, mk in MODELS:
            try:
                img = attempt(key, url, mk(prompt, w, h))
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(img)
                print(f"OK {name} key=...{key[-6:]} -> {out} ({len(img)/1024:.0f} KB)")
                return 0
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", "replace")[:220]
                errors.append(f"{name} key=...{key[-6:]} HTTP {e.code}: {body}")
            except Exception as e:  # noqa: BLE001
                errors.append(f"{name} key=...{key[-6:]}: {type(e).__name__}: {str(e)[:200]}")
    print("FALHOU")
    for e in errors:
        print("  -", e)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

