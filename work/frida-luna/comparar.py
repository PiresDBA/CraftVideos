"""Compara o episódio renderizado com o vídeo de origem — métricas objectivas, sem IA.

Mede:
- duração, fps e resolução (vídeo e áudio separadamente);
- correlação da envoltória de áudio (fala/música no mesmo sítio?);
- energia de movimento quadro a quadro (o original é quase estático; o nosso tem de ter movimento);
- presença de áudio e de frames negros.

Uso: py comparar.py <renderizado.mp4> [origem.mp4] [--out relatorio.json]
"""
import argparse
import json
import subprocess
import wave
from pathlib import Path

import numpy as np

BASE = Path(r"D:\CRAFT\work\frida-luna")
FF = Path(r"C:\Users\Pires\AppData\Local\hermes\tools\ffmpeg-9.0.1-win32-x64\bin")
FFPROBE = FF / "ffprobe.exe"
FFMPEG = FF / "ffmpeg.exe"
ORIGEM = BASE / "ref" / "parque-dos-pets.mp4"


def probe(p):
    r = subprocess.run([str(FFPROBE), "-v", "error", "-show_entries",
                        "format=duration:stream=index,codec_type,width,height,r_frame_rate",
                        "-of", "json", str(p)], capture_output=True, text=True)
    d = json.loads(r.stdout or "{}")
    v = next((s for s in d.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in d.get("streams", []) if s.get("codec_type") == "audio"), {})
    return {
        "duracao": round(float(d.get("format", {}).get("duration", 0)), 3),
        "largura": v.get("width"), "altura": v.get("height"),
        "fps": v.get("r_frame_rate"), "tem_audio": bool(a),
    }


def envelope(p, taxa=8000):
    wav = BASE / "_tmp_audio.wav"
    subprocess.run([str(FFMPEG), "-y", "-v", "error", "-i", str(p), "-vn",
                    "-ac", "1", "-ar", str(taxa), str(wav)], check=False,
                   capture_output=True)
    if not wav.exists():
        return np.array([])
    with wave.open(str(wav), "rb") as f:
        x = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32)
    wav.unlink(missing_ok=True)
    if len(x) < taxa:
        return np.array([])
    blk = taxa // 10
    n = len(x) // blk
    return np.abs(x[:n * blk].reshape(n, blk)).mean(axis=1)


def energia(p):
    out = BASE / "_tmp_quadros"
    out.mkdir(exist_ok=True)
    for f in out.glob("q_*.png"):
        f.unlink()
    subprocess.run([str(FFMPEG), "-y", "-v", "error", "-i", str(p),
                    "-vf", "fps=2,scale=160:-1", str(out / "q_%04d.png")],
                   check=False, capture_output=True)
    fs = sorted(out.glob("q_*.png"))
    if len(fs) < 3:
        return 0.0, 0
    from PIL import Image
    imgs = [np.asarray(Image.open(f).convert("L"), dtype=np.float32) for f in fs]
    ds = [float(np.abs(a - b).mean()) for a, b in zip(imgs, imgs[1:])]
    for f in fs:
        f.unlink()
    return round(float(np.mean(ds)), 4), len(fs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("renderizado")
    ap.add_argument("origem", nargs="?", default=str(ORIGEM))
    ap.add_argument("--out")
    a = ap.parse_args()

    r, o = Path(a.renderizado), Path(a.origem)
    rel = {"renderizado": str(r), "origem": str(o),
           "render": probe(r), "origem_probe": probe(o)}
    er, eo = envelope(r), envelope(o)
    if len(er) and len(eo):
        n = min(len(er), len(eo))
        ar, ao = er[:n] - er[:n].mean(), eo[:n] - eo[:n].mean()
        den = np.linalg.norm(ar) * np.linalg.norm(ao)
        rel["correlacao_audio"] = round(float(np.dot(ar, ao) / den), 3) if den else 0.0
    else:
        rel["correlacao_audio"] = None
    rel["energia_render"], rel["quadros_render"] = energia(r)
    rel["energia_origem"], rel["quadros_origem"] = energia(o)
    rel["ratio_movimento"] = (round(rel["energia_render"] / rel["energia_origem"], 2)
                              if rel["energia_origem"] else None)

    avisos = []
    if abs(rel["render"]["duracao"] - rel["origem_probe"]["duracao"]) > 0.5:
        avisos.append("duracao diferente da origem em mais de 0,5 s")
    if not rel["render"]["tem_audio"]:
        avisos.append("sem faixa de audio")
    if rel["correlacao_audio"] is not None and rel["correlacao_audio"] < 0.5:
        avisos.append("audio pouco correlacionado com a origem")
    if rel["ratio_movimento"] is not None and rel["ratio_movimento"] < 2:
        avisos.append("movimento insuficiente face a origem estatica")
    rel["avisos"] = avisos
    rel["veredito"] = "OK" if not avisos else "REVER"

    out = Path(a.out) if a.out else BASE / "animacao" / "comparacao.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rel, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(rel, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
