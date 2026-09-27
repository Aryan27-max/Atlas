"""Atlas engine: the headless screening pipeline behind the desktop app."""

import logging

# Library convention: stay silent until the app configures logging
# (engine/logs.py adds the rotating engine.log handler).
logging.getLogger("atlas").addHandler(logging.NullHandler())
