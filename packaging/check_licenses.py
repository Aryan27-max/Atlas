"""Licence check for the third-party code that ships in the Atlas installer.

    python packaging/check_licenses.py            # exit 1 if something new needs a look
    python packaging/check_licenses.py --table    # the shipped packages, as Markdown

What "ships":

* **Python:** the dependency closure of ``engine/requirements.txt``, read from
  the Python running this script. That is what PyInstaller bundles into the
  engine, so run it with the build or development virtual environment.
* **JavaScript:** the packages the app's own source imports (vite bundles them
  into ``app/out/``) and their production dependencies, read from
  ``app/node_modules``. ``npm ls --omit=dev`` is empty for Atlas because every
  package is a devDependency: the bundle, not ``dependencies``, is what ships.
* **The Electron runtime.** Chromium's and FFmpeg's own components are listed
  by hand in THIRD_PARTY_NOTICES.md.
* **Brand assets:** the logo and start-up art in ``app/renderer/assets/brand/``
  (bundled into the app; the app icons are rendered from the logo). They are
  someone else's trademarks, not code under a licence: each must be named in
  THIRD_PARTY_NOTICES.md → Brand assets, which says whose marks they are.

The check fails when a shipped package's licence is copyleft, restrictive or
unknown and the package isn't in ``ALLOWED`` (each entry says why it's there),
or when THIRD_PARTY_NOTICES.md doesn't name a shipped package or brand asset.
Standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from importlib import metadata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
NOTICES = ROOT / "THIRD_PARTY_NOTICES.md"
REQUIREMENTS = ROOT / "engine" / "requirements.txt"
APP_SOURCES = ("main", "preload", "renderer", "src")
BRAND = APP / "renderer" / "assets" / "brand"

# Copyleft, restrictive, or "you need a commercial licence" wording.
FLAGGED = re.compile(
    r"\b(A?GPL|LGPL|GNU|Affero|SSPL|Server Side Public|MPL|Mozilla Public|EPL|Eclipse Public|CDDL|EUPL|OSL"
    r"|CC-BY-SA|Commercial|Proprietary|Artifex)\b",
    re.IGNORECASE,
)

# Known and accepted for now. A new entry needs the owner's decision.
ALLOWED: dict[str, str] = {
    "pymupdf": "AGPL-3.0, or a commercial licence from Artifex. Reported to the owner, who decides "
               "(THIRD_PARTY_NOTICES.md → Needs a decision).",
    "certifi": "MPL-2.0 (weak, file-level copyleft). Shipped unmodified: keep the notice; no source obligation.",
}

PIP_TOOLS = {"pip", "setuptools", "wheel"}


@dataclass(frozen=True)
class Package:
    ecosystem: str          # "Python" or "npm"
    name: str
    version: str
    licence: str

    @property
    def key(self) -> str:
        return self.name.lower()


# --------------------------------------------------------------------------- Python


def _requirement_name(line: str) -> tuple[str, str]:
    """``(name, marker)`` from a requirement line ("anyio<5,>=3; python_version < '3.11'")."""
    spec, _, marker = line.partition(";")
    match = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", spec)
    return (match.group(1) if match else ""), marker.strip()


def _marker_applies(marker: str) -> bool:
    if not marker:
        return True
    if "extra" in marker:                     # optional extras aren't installed by plain requirements
        return False
    try:
        from packaging.markers import Marker  # usually present; fall back to "include" if not

        return Marker(marker).evaluate()
    except Exception:  # noqa: BLE001 — unknown marker syntax: check it rather than miss it
        return True


def _python_licence(dist: metadata.Distribution) -> str:
    meta = dist.metadata
    expression = (meta.get("License-Expression") or "").strip()
    if expression:
        return expression
    classifiers = [c.split("::")[-1].strip() for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
    classifiers = [c for c in classifiers if c != "OSI Approved"]
    text = (meta.get("License") or "").strip()
    first = text.splitlines()[0].strip() if text else ""
    if classifiers:
        return " / ".join(dict.fromkeys(classifiers))
    if first and len(first) <= 80:
        return first
    return "UNKNOWN"


def python_packages() -> list[Package]:
    todo = []
    for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line and not line.startswith("-"):
            todo.append(_requirement_name(line)[0])
    seen: dict[str, Package] = {}
    while todo:
        name = todo.pop()
        key = name.lower().replace("_", "-")
        if not name or key in seen or key in PIP_TOOLS:
            continue
        try:
            dist = metadata.distribution(name)
        except metadata.PackageNotFoundError:
            continue                          # e.g. a dependency only for another operating system
        seen[key] = Package("Python", dist.metadata["Name"], dist.version, _python_licence(dist))
        for requirement in dist.requires or []:
            dependency, marker = _requirement_name(requirement)
            if _marker_applies(marker):
                todo.append(dependency)
    return sorted(seen.values(), key=lambda p: p.key)


# --------------------------------------------------------------------------- JavaScript


def _app_imports() -> set[str]:
    pattern = re.compile(r"""(?:from|import)\s*\(?\s*['"]([^'"./][^'"]*)['"]""")
    names: set[str] = set()
    for folder in APP_SOURCES:
        for path in (APP / folder).rglob("*"):
            if path.suffix not in {".ts", ".tsx", ".css"} or ".test." in path.name or path.name.endswith(".d.ts"):
                continue
            for spec in pattern.findall(path.read_text(encoding="utf-8")):
                if spec.startswith(("node:", "@shared/")):
                    continue
                parts = spec.split("/")
                names.add("/".join(parts[:2]) if spec.startswith("@") else parts[0])
    names.discard("electron")                 # the runtime, added below
    return names


def _manifest(name: str, parent: Path | None) -> Path | None:
    for base in ([parent / "node_modules"] if parent else []) + [APP / "node_modules"]:
        candidate = base / name / "package.json"
        if candidate.exists():
            return candidate
    return None


def _npm_licence(manifest: dict) -> str:
    value = manifest.get("license") or manifest.get("licenses") or "UNKNOWN"
    if isinstance(value, dict):
        value = value.get("type", "UNKNOWN")
    if isinstance(value, list):
        value = " OR ".join(v.get("type", "UNKNOWN") if isinstance(v, dict) else str(v) for v in value)
    return str(value)


def npm_packages() -> list[Package]:
    seen: dict[str, Package] = {}
    todo: list[tuple[str, Path | None]] = [(name, None) for name in sorted(_app_imports())] + [("electron", None)]
    while todo:
        name, parent = todo.pop()
        path = _manifest(name, parent)
        if path is None or name in seen:
            continue
        manifest = json.loads(path.read_text(encoding="utf-8"))
        seen[name] = Package("npm", name, manifest.get("version", "?"), _npm_licence(manifest))
        if name == "electron":                # its npm dependencies only download the runtime at install time
            continue
        for dependency in {**manifest.get("dependencies", {}), **manifest.get("optionalDependencies", {})}:
            todo.append((dependency, path.parent))
    return sorted(seen.values(), key=lambda p: p.key)


# --------------------------------------------------------------------------- check


def problems(packages: list[Package], notices: str) -> list[str]:
    found = []
    for package in packages:
        unknown = package.licence.strip().upper() in {"", "UNKNOWN", "SEE LICENSE IN LICENSE"}
        if (unknown or FLAGGED.search(package.licence)) and package.key not in ALLOWED:
            found.append(f"{package.ecosystem} {package.name} {package.version}: licence '{package.licence}' "
                         "is copyleft, restrictive or unknown. Ask the owner before shipping it; if accepted, "
                         "add it to ALLOWED with the reason.")
        if f"`{package.name}`" not in notices:
            found.append(f"{package.ecosystem} {package.name} isn't listed in THIRD_PARTY_NOTICES.md.")
    return found


def brand_assets() -> list[str]:
    """The brand art that ships: the renderer bundles it, and the app icons are rendered from the logo."""
    return sorted(path.name for path in BRAND.glob("*.svg"))


def brand_problems(assets: list[str], notices: str) -> list[str]:
    """Each shipped brand asset is named in THIRD_PARTY_NOTICES.md → Brand assets, which says whose marks they are."""
    if "## Brand assets" not in notices:
        return ["THIRD_PARTY_NOTICES.md has no 'Brand assets' section for the logo and start-up art."]
    section = notices.split("## Brand assets", 1)[1].split("\n## ", 1)[0]
    found = [f"brand asset {name} isn't listed in THIRD_PARTY_NOTICES.md → Brand assets."
             for name in assets if f"`{name}`" not in section]
    if "trademark" not in section.lower():
        found.append("THIRD_PARTY_NOTICES.md → Brand assets doesn't say whose trademarks the assets are.")
    return found


def table(packages: list[Package]) -> str:
    lines = ["| Package | Version | Licence |", "|---|---|---|"]
    lines += [f"| `{p.name}` | {p.version} | {p.licence} |" for p in packages]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--table", action="store_true", help="print the shipped packages as Markdown tables")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    python, npm = python_packages(), npm_packages()
    if args.table:
        print("### Python (bundled into the engine by PyInstaller)\n")
        print(table(python))
        print("\n### JavaScript (bundled into the app by vite, plus the Electron runtime)\n")
        print(table(npm))
        return 0
    notices = NOTICES.read_text(encoding="utf-8") if NOTICES.exists() else ""
    assets = brand_assets()
    found = problems(python + npm, notices) + brand_problems(assets, notices)
    accepted = [p for p in python + npm if p.key in ALLOWED]
    print(f"licences: {len(python)} Python and {len(npm)} JavaScript packages ship; "
          f"{len(accepted)} on the allowlist ({', '.join(p.name for p in accepted) or 'none'}); "
          f"{len(assets)} brand assets ({', '.join(assets) or 'none'})")
    for problem in found:
        print(f"licences: FAIL {problem}")
    print("licences: passed" if not found else f"licences: {len(found)} problem(s)")
    return 0 if not found else 1


if __name__ == "__main__":
    sys.exit(main())
