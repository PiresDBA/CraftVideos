"""Procura no grafo (graph.json) os nos relevantes para a animacao Frida/Luna."""
import json
from pathlib import Path

g = json.loads(Path(r"D:\CRAFT\graphify-out\graph.json").read_text(encoding="utf-8"))
deg = {}
for e in g["links"]:
    deg[e["source"]] = deg.get(e["source"], 0) + 1
    deg[e["target"]] = deg.get(e["target"], 0) + 1

KEYS = ["avatar", "luna", "frida", "lipsync", "lip-sync", "sincroniza", "remotion", "desenho",
        "personage", "historinh", "dachshund", "buldog", "bulldog", "ficha", "referencia",
        "catalogo de avatares", "express"]

hits = []
for n in g["nodes"]:
    lab = str(n.get("label", "")).lower()
    src = str(n.get("source_file", "")).lower()
    if any(k in lab for k in KEYS) or any(k in src for k in ("avatar", "historinh")):
        hits.append((deg.get(n["id"], 0), n.get("label"), n.get("source_file"), n.get("file_type"), n.get("community_name")))

hits.sort(reverse=True)
print(f"{len(hits)} nos relevantes\n")
for d, lab, src, ft, com in hits[:60]:
    print(f"{d:3}  [{ft}] {str(lab)[:56]:56} {src[:58]:58} {com}")
