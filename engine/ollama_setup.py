"""Is Ollama installed, and can Atlas start it? (Phase 3, step 3.3)

Atlas never downloads or installs anything. It only:

* **looks** for an installed Ollama in the places its installers put it;
* **starts** it the platform's own way when the recruiter presses
  "Start Ollama":
  * macOS: ``open -a Ollama``, the menu-bar app, which runs the server;
  * Windows: ``ollama app.exe``, the tray app, which runs the server, or
    ``ollama serve`` if only the command-line tool exists;
  * Linux: ``ollama serve``.

The process is started detached, so it outlives Atlas, exactly as if the
recruiter had opened it themselves.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal, Mapping

How = Literal["app", "serve", ""]


@dataclass(frozen=True)
class OllamaInstall:
    installed: bool
    path: str | None = None
    how: How = ""


def find_ollama(
    *,
    system: str | None = None,
    env: Mapping[str, str] | None = None,
    exists: Callable[[str], bool] = os.path.exists,
    which: Callable[[str], str | None] = shutil.which,
) -> OllamaInstall:
    """Where Ollama is installed, if anywhere. Never raises."""
    import platform

    system = system or platform.system()
    env = os.environ if env is None else env
    candidates: list[tuple[str, How]] = []
    if system == "Windows":
        base = env.get("LOCALAPPDATA", "")
        if base:
            folder = Path(base) / "Programs" / "Ollama"
            candidates += [(str(folder / "ollama app.exe"), "app"), (str(folder / "ollama.exe"), "serve")]
    elif system == "Darwin":
        home = env.get("HOME", "")
        candidates += [("/Applications/Ollama.app", "app")]
        if home:
            candidates.append((str(Path(home) / "Applications" / "Ollama.app"), "app"))
        candidates += [("/usr/local/bin/ollama", "serve"), ("/opt/homebrew/bin/ollama", "serve")]
    for path, how in candidates:
        if exists(path):
            return OllamaInstall(True, path, how)
    found = which("ollama")
    if found:
        return OllamaInstall(True, found, "serve")
    return OllamaInstall(False)


def start_ollama(
    install: OllamaInstall,
    *,
    system: str | None = None,
    popen: Callable[..., Any] = subprocess.Popen,
) -> bool:
    """Launch the installed Ollama, detached. True if a process was started."""
    import platform

    if not install.installed or not install.path:
        return False
    system = system or platform.system()
    if system == "Darwin" and install.how == "app":
        command = ["open", "-a", install.path]
    elif install.how == "app":
        command = [install.path]
    else:
        command = [install.path, "serve"]
    kwargs: dict[str, Any] = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL,
                              "stderr": subprocess.DEVNULL, "close_fds": True}
    if system == "Windows":
        # Detached (no console window, survives Atlas) and in its own group (Ctrl+C in Atlas doesn't reach it).
        kwargs["creationflags"] = (getattr(subprocess, "DETACHED_PROCESS", 0x8)
                                   | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200))
    else:
        kwargs["start_new_session"] = True
    try:
        popen(command, **kwargs)
    except OSError:
        return False
    return True
