"""Backward-compatibility shim for ``casa_voice.providers``.

The implementation now lives in the ``casa_voice.providers`` package.
This module re-exports the same public API so old imports keep working
if Python ever resolves ``casa_voice.providers`` to this file.
"""

from casa_voice.providers import *  # noqa: F401,F403
