"""Funde o chunk semantico dos docs novos no grafo existente e regenera saidas.

Porque existe: `graphify update` so trata codigo e o `--backend gemini` falhou
(404 no endpoint OpenAI-compat desta chave), por isso o passe semantico dos
documentos corre por subagente e a fusao e feita aqui - com as mesmas garantias:
ids unicos, arestas so entre nos existentes, etiquetas de comunidade preservadas.
"""
import collections
import json
from pathlib import Path

from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json

OUT = Path("graphify-out")
ROOT = Path(OUT / ".graphify_root").read_text(encoding="utf-8-sig").strip()

g = json.loads((OUT / "graph.json").read_text(encoding="utf-8"))
chunk = json.loads((OUT / ".graphify_chunk_11.json").read_text(encoding="utf-8"))

nodes = list(g["nodes"])
links = list(g["links"])
hyperedges = list(g.get("hyperedges", []))
have = {n["id"] for n in nodes}
old_comm = {n["id"]: (int(n.get("community", -1)), n.get("community_name", "")) for n in nodes}

added_nodes, added_edges = 0, 0
for n in chunk.get("nodes", []):
    if n["id"] in have:
        continue
    n.setdefault("_origin", "semantic")
    nodes.append(n)
    have.add(n["id"])
    added_nodes += 1

existing_pairs = {(tuple(sorted((e["source"], e["target"]))), e.get("relation")) for e in links}
for e in chunk.get("edges", []):
    if e.get("source") not in have or e.get("target") not in have:
        continue
    key = (tuple(sorted((e["source"], e["target"]))), e.get("relation"))
    if key in existing_pairs:
        continue
    e.setdefault("_origin", "semantic")
    links.append(e)
    existing_pairs.add(key)
    added_edges += 1

hyperedges += [h for h in chunk.get("hyperedges", []) if h not in hyperedges]

extraction = {"nodes": nodes, "edges": links, "hyperedges": hyperedges,
              "input_tokens": 0, "output_tokens": 0}
(OUT / ".graphify_extract.json").write_text(json.dumps(extraction, ensure_ascii=False), encoding="utf-8")

G = build_from_json(extraction, root=ROOT, directed=False)
communities = cluster(G)
cohesion = score_all(G, communities)

# preserva os nomes curados: voto de maioria do nome antigo dentro da nova comunidade
labels, used = {}, set()
for cid, members in communities.items():
    votes = collections.Counter(old_comm[m][1] for m in members if m in old_comm)
    name, cnt = votes.most_common(1)[0] if votes else ("", 0)
    cand = name if (name and cnt >= max(2, 0.4 * len(members))) else f"Community {cid}"
    while cand in used:
        cand += " (2)"
    used.add(cand)
    labels[cid] = cand

gods = god_nodes(G)
surprises = surprising_connections(G, communities)
questions = suggest_questions(G, communities, labels)
detect = {"total_files": 199, "files": {"code": ["(incremental)"]}, "total_words": 0}
report = generate(G, communities, cohesion, labels, gods, surprises, detect,
                  {"input": 0, "output": 0}, ROOT, suggested_questions=questions)
(OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
(OUT / ".graphify_labels.json").write_text(
    json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False), encoding="utf-8")
wrote = to_json(G, communities, str(OUT / "graph.json"), community_labels=labels)
print(f"+{added_nodes} nos, +{added_edges} arestas -> {G.number_of_nodes()} nos, "
      f"{G.number_of_edges()} arestas, {len(communities)} comunidades (escrito={bool(wrote)})")
