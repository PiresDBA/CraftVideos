"""Transcreve a narracao de referencia com timestamps por palavra.

Uso:  py transcribe.py [audio.wav] [out.json]
Saida: segments + words (start/end em segundos) para montar o beat sheet.
"""
import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else r"D:\CRAFT\work\frida-luna\ref\audio.wav")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else r"D:\CRAFT\work\frida-luna\ref\words.json")

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe(
    str(SRC),
    language="pt",
    word_timestamps=True,
    vad_filter=True,
    beam_size=1,
)

segs = []
for s in segments:
    segs.append({
        "start": round(s.start, 3),
        "end": round(s.end, 3),
        "text": s.text.strip(),
        "words": [
            {"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)}
            for w in (s.words or [])
        ],
    })

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({
    "audio": str(SRC),
    "duration": round(info.duration, 3),
    "language": info.language,
    "segments": segs,
}, ensure_ascii=False, indent=1), encoding="utf-8")

total = sum(len(s["text"].split()) for s in segs)
print(f"{len(segs)} segmentos | {total} palavras | {info.duration:.1f} s -> {OUT}")
