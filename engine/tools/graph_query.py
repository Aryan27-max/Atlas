"""Small, targeted questions to graphify-out/graph.json, so it's never read whole.

    python -m engine.tools.graph_query find claim_next_download      # nodes whose label matches
    python -m engine.tools.graph_query callers claim_next_download   # who calls / uses / imports it
    python -m engine.tools.graph_query callees Worker                # what it calls / uses / imports
    python -m engine.tools.graph_query file engine/worker.py         # what the file defines

Output is `label  [relation]  file:line`. The graph is a map: read the real
file before editing, and if they disagree the code wins (the graph is stale).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

LINKS = {"calls", "uses", "imports", "imports_from", "references", "inherits", "method"}


def _load(path: Path) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    graph = json.loads(path.read_text(encoding="utf-8"))
    return {n["id"]: n for n in graph["nodes"]}, graph.get("links") or graph.get("edges") or []


def _where(node: dict[str, Any]) -> str:
    return f"{node.get('source_file', '?')}:{str(node.get('source_location', '')).lstrip('L')}"


def _match(nodes: dict[str, dict[str, Any]], name: str) -> list[str]:
    needle = name.lower().strip("().")
    exact = [i for i, n in nodes.items() if n.get("label", "").lower().strip("().") == needle]
    return exact or [i for i, n in nodes.items() if needle in n.get("label", "").lower()]


def run(command: str, name: str, graph: Path, limit: int = 40) -> list[str]:
    nodes, links = _load(graph)
    if command == "file":
        wanted = name.replace("\\", "/")
        rows = [n for n in nodes.values() if str(n.get("source_file", "")).replace("\\", "/") == wanted]
        return [f"{n['label']}  {_where(n)}" for n in sorted(rows, key=_where)][:limit]
    targets = set(_match(nodes, name))
    if command == "find":
        return [f"{nodes[i]['label']}  {_where(nodes[i])}" for i in sorted(targets)][:limit]
    out = []
    for link in links:
        if link.get("relation") not in LINKS:
            continue
        here, there = ("target", "source") if command == "callers" else ("source", "target")
        if link[here] in targets and link[there] in nodes:
            other = nodes[link[there]]
            out.append(f"{other['label']}  [{link['relation']}]  {_where(other)}")
    return sorted(set(out))[:limit]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["find", "callers", "callees", "file"])
    parser.add_argument("name")
    parser.add_argument("--graph", default="graphify-out/graph.json", type=Path)
    parser.add_argument("--limit", type=int, default=40)
    args = parser.parse_args(argv)
    if not args.graph.is_file():
        print(f"No graph at {args.graph}. Build it with /graphify, or update it with `graphify update .`.")
        return 2
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # labels contain §, → … (Windows consoles default to cp1252)
    rows = run(args.command, args.name, args.graph, args.limit)
    print("\n".join(rows) if rows else "Nothing found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
