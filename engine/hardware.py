"""What computer is this? (Phase 3, step 3.3; ARCHITECTURE §15)

For Settings → About and for a first, rough time estimate before anything
has been measured. Standard library only, read-only, and nothing leaves the
machine: the CPU name comes from the registry (Windows), ``sysctl`` (macOS) or
``/proc/cpuinfo`` (Linux); RAM from the OS; and whether Ollama runs the model
on a GPU from Ollama's own ``/api/ps`` (``size_vram`` > 0), which is only
known while a model is loaded.
"""

from __future__ import annotations

import ctypes
import os
import platform
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from typing import Any, Callable, Literal, Protocol

Kind = Literal["cpu", "apple_silicon", "gpu"]


class _OllamaPs(Protocol):
    def running_models(self) -> list[dict[str, Any]]: ...


@dataclass(frozen=True)
class Hardware:
    cpu: str
    cores: int
    ram_gb: float | None
    os: str
    arch: str
    apple_silicon: bool
    gpu_in_use: bool | None        # None: no model loaded in Ollama right now, so unknown
    vram_gb: float | None

    @property
    def kind(self) -> Kind:
        """Which row of the speed table (estimate.HARDWARE_PRIOR) fits this computer."""
        if self.gpu_in_use:
            return "gpu"
        if self.apple_silicon:
            return "apple_silicon"
        return "cpu"

    def as_dict(self) -> dict[str, Any]:
        return {**asdict(self), "kind": self.kind}


def profile(
    ollama: _OllamaPs | None = None,
    *,
    system: str | None = None,
    machine: str | None = None,
    run: Callable[[list[str]], str] | None = None,
) -> Hardware:
    """Describe this computer. Never raises: unknown parts come back empty or ``None``."""
    system = system or platform.system()
    machine = (machine or platform.machine() or "").lower()
    run = run or _run
    arch = {"amd64": "x86_64", "x86_64": "x86_64", "arm64": "arm64", "aarch64": "arm64"}.get(machine, machine or "unknown")
    cpu = _cpu_name(system, run) or platform.processor() or "Unknown processor"
    apple = system == "Darwin" and (arch == "arm64" or cpu.startswith("Apple"))
    gpu, vram = _ollama_gpu(ollama)
    return Hardware(
        cpu=" ".join(cpu.split()), cores=os.cpu_count() or 0, ram_gb=_ram_gb(system, run),
        os=_os_name(system), arch=arch, apple_silicon=apple, gpu_in_use=gpu, vram_gb=vram,
    )


def _run(command: list[str]) -> str:
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=5, check=False).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def _cpu_name(system: str, run: Callable[[list[str]], str]) -> str:
    if system == "Windows":
        try:
            import winreg

            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as key:
                return str(winreg.QueryValueEx(key, "ProcessorNameString")[0])
        except (OSError, ImportError):
            return ""
    if system == "Darwin":
        return run(["sysctl", "-n", "machdep.cpu.brand_string"])
    try:
        with open("/proc/cpuinfo", encoding="utf-8") as handle:
            for line in handle:
                if line.lower().startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return ""


def _ram_gb(system: str, run: Callable[[list[str]], str]) -> float | None:
    total = 0
    if system == "Windows" and sys.platform == "win32":
        class _MemoryStatus(ctypes.Structure):
            _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong), ("total", ctypes.c_ulonglong),
                        ("avail", ctypes.c_ulonglong), ("total_page", ctypes.c_ulonglong),
                        ("avail_page", ctypes.c_ulonglong), ("total_virtual", ctypes.c_ulonglong),
                        ("avail_virtual", ctypes.c_ulonglong), ("avail_extended", ctypes.c_ulonglong)]

        status = _MemoryStatus()
        status.length = ctypes.sizeof(_MemoryStatus)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):  # type: ignore[attr-defined]
            total = int(status.total)
    elif system == "Darwin":
        value = run(["sysctl", "-n", "hw.memsize"])
        total = int(value) if value.isdigit() else 0
    else:
        try:
            total = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
        except (ValueError, OSError, AttributeError):
            total = 0
    return round(total / 1024**3, 1) if total else None


def _os_name(system: str) -> str:
    if system == "Windows":
        build = re.search(r"\.(\d{5})", platform.version() or "")
        if build and int(build.group(1)) >= 22000:
            return "Windows 11"
        return f"Windows {platform.release()}".strip()
    if system == "Darwin":
        return f"macOS {platform.mac_ver()[0]}".strip()
    return system or "Unknown"


def _ollama_gpu(ollama: _OllamaPs | None) -> tuple[bool | None, float | None]:
    if ollama is None:
        return None, None
    try:
        loaded = ollama.running_models()
    except Exception:  # noqa: BLE001 — Ollama down or odd: the GPU is simply unknown
        return None, None
    if not loaded:
        return None, None
    vram = max(int(m.get("size_vram") or 0) for m in loaded)
    return vram > 0, round(vram / 1024**3, 1) if vram else 0.0
