"""Escreve o estado aprendido do Flow sem BOM (o PowerShell mete BOM e o json.loads falha)."""
import json
from pathlib import Path

p = Path(r"C:\videomaker\.flow_learned_state.json")
p.parent.mkdir(parents=True, exist_ok=True)

estado = {
    "ready": True,
    "url": "https://flow.google.com/u/0/project/62cb2bc8-7c82-4351-850d-d8453429108e",
    "title": "Google Flow project",
    "learned_at": "2026-11-18T02:10:00",
    "editors_found": [
        'div.ProseMirror[contenteditable="true"]',
        '[role="textbox"]',
        'div[contenteditable="true"]',
    ],
}

p.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")
lido = json.loads(p.read_text(encoding="utf-8"))
print("escrito:", p, p.stat().st_size, "bytes | ready =", lido["ready"])
