"""
TrustSphere AI — Structured Logger
Provides a shared logger instance for the entire application.
"""

import logging
import sys

# Configure the root logger for TrustSphere
logger = logging.getLogger("trustsphere")
logger.setLevel(logging.DEBUG)

# Console handler with a clean format
_handler = logging.StreamHandler(sys.stdout)
_handler.setLevel(logging.DEBUG)
_formatter = logging.Formatter(
    "[%(asctime)s] %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
_handler.setFormatter(_formatter)

if not logger.handlers:
    logger.addHandler(_handler)
