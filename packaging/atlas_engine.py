"""Entry point of the packaged engine (``atlas-engine``), built by PyInstaller.

Exactly ``python -m engine.server …``: the Electron app starts it with
``--data-dir <userData> --port 0 --watch-stdin`` and the token in the
environment, and reads the ``ATLAS_READY port=N`` line it prints.
"""

from __future__ import annotations

import sys

from engine.server import main

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
