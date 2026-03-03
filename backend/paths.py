"""
Platform detection and path resolution for QuickAccela (Linux/SteamOS).

Centralises all platform-specific logic. On Steam Deck, Decky runs as root
so ~ expands to /root/. We include explicit /home/deck/ paths to handle this.
"""

from __future__ import annotations

import os
from typing import Optional

try:
    import decky  # type: ignore
    _DECKY_AVAILABLE = True
except ImportError:
    _DECKY_AVAILABLE = False


# ---------------------------------------------------------------------------
# Plugin directory helpers
# ---------------------------------------------------------------------------

def get_plugin_dir() -> str:
    if _DECKY_AVAILABLE:
        return decky.DECKY_PLUGIN_DIR
    return os.path.abspath(os.path.join(os.path.dirname(os.path.realpath(__file__)), ".."))


def get_backend_dir() -> str:
    return os.path.join(get_plugin_dir(), "backend")


def backend_path(filename: str) -> str:
    return os.path.join(get_backend_dir(), filename)


def data_dir() -> str:
    d = os.path.join(get_backend_dir(), "data")
    os.makedirs(d, exist_ok=True)
    return d


def data_path(filename: str) -> str:
    return os.path.join(data_dir(), filename)


def settings_dir() -> str:
    if _DECKY_AVAILABLE:
        return decky.DECKY_PLUGIN_SETTINGS_DIR
    d = os.path.join(get_plugin_dir(), "defaults")
    os.makedirs(d, exist_ok=True)
    return d


# ---------------------------------------------------------------------------
# Steam path resolution
# ---------------------------------------------------------------------------

# On Steam Deck (Decky runs as root), ~ is /root/ — we must list /home/deck/ first.
_STEAM_PATHS = [
    "/home/deck/.local/share/Steam",
    "/home/deck/.steam/steam",
    os.path.expanduser("~/.steam/steam"),
    os.path.expanduser("~/.local/share/Steam"),
    "/opt/steam/steam",
    "/usr/local/steam",
]


def find_steam_root() -> Optional[str]:
    """Search well-known locations for the Steam installation."""
    for path in _STEAM_PATHS:
        if os.path.isdir(path) and os.path.isfile(os.path.join(path, "steam.sh")):
            return path
    for path in _STEAM_PATHS:
        if os.path.isdir(path):
            return path
    return None


def get_stplugin_dir(steam_root: Optional[str] = None) -> Optional[str]:
    root = steam_root or find_steam_root()
    if root is None:
        return None
    return os.path.join(root, "config", "stplug-in")


def get_depotcache_dir(steam_root: Optional[str] = None) -> Optional[str]:
    root = steam_root or find_steam_root()
    if root is None:
        return None
    return os.path.join(root, "depotcache")


# ---------------------------------------------------------------------------
# SLSsteam paths
# ---------------------------------------------------------------------------

_SLSSTEAM_CANDIDATES = [
    "/home/deck/.local/share/SLSsteam",
    "/home/deck/SLSsteam",
    os.path.expanduser("~/.local/share/SLSsteam"),
    os.path.expanduser("~/SLSsteam"),
    "/opt/SLSsteam",
]


def find_slssteam_root() -> str:
    for path in _SLSSTEAM_CANDIDATES:
        if os.path.isdir(path) and os.path.isfile(os.path.join(path, "SLSsteam.so")):
            return path
    return os.path.expanduser("~/.local/share/SLSsteam")


def get_slssteam_config_dir() -> str:
    # Try deck user first since Decky runs as root
    deck_path = "/home/deck/.config/SLSsteam"
    if os.path.isdir(deck_path):
        return deck_path
    return os.path.expanduser("~/.config/SLSsteam")


def get_slssteam_config_path() -> str:
    return os.path.join(get_slssteam_config_dir(), "config.yaml")


def check_slssteam_installed() -> bool:
    for path in _SLSSTEAM_CANDIDATES:
        if os.path.isfile(os.path.join(path, "SLSsteam.so")):
            return True
    return False


# ---------------------------------------------------------------------------
# ACCELA paths
# ---------------------------------------------------------------------------

_ACCELA_CANDIDATES = [
    "/home/deck/.local/share/ACCELA",
    "/home/deck/accela",
    os.path.expanduser("~/.local/share/ACCELA"),
    os.path.expanduser("~/accela"),
]


def find_accela_root() -> Optional[str]:
    for path in _ACCELA_CANDIDATES:
        if os.path.isdir(path):
            return path
    return None


def check_accela_installed() -> bool:
    return find_accela_root() is not None


def get_accela_run_script() -> Optional[str]:
    accela_dir = find_accela_root()
    if not accela_dir:
        return None
    for name in ("launch_debug.sh", "run.sh"):
        script = os.path.join(accela_dir, name)
        if os.path.isfile(script):
            return script
    return None


# ---------------------------------------------------------------------------
# SLSsteam injection verification
# ---------------------------------------------------------------------------

def _get_ld_audit_line() -> str:
    sls_dir = find_slssteam_root()
    return f'export LD_AUDIT={sls_dir}/library-inject.so:{sls_dir}/SLSsteam.so'


def verify_slssteam_injected() -> dict:
    if not check_slssteam_installed():
        return {"patched": False, "already_ok": False, "error": "SLSsteam not installed"}

    steam_sh = None
    for candidate in _STEAM_PATHS:
        path = os.path.join(candidate, "steam.sh")
        if os.path.isfile(path):
            steam_sh = path
            break

    if not steam_sh:
        return {"patched": False, "already_ok": False, "error": "steam.sh not found"}

    try:
        with open(steam_sh, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as exc:
        return {"patched": False, "already_ok": False, "error": f"read failed: {exc}"}

    if "LD_AUDIT" in content and "SLSsteam" in content:
        return {"patched": False, "already_ok": True, "error": None}

    try:
        ld_audit_line = _get_ld_audit_line()
        lines = content.splitlines(keepends=True)
        insert_pos = min(9, len(lines))
        lines.insert(insert_pos, ld_audit_line + "\n")
        with open(steam_sh, "w", encoding="utf-8") as f:
            f.writelines(lines)
        return {"patched": True, "already_ok": False, "error": None}
    except Exception as exc:
        return {"patched": False, "already_ok": False, "error": f"write failed: {exc}"}


def get_platform_summary() -> dict:
    summary = {
        "steam_root": find_steam_root(),
        "slssteam_installed": check_slssteam_installed(),
        "slssteam_root": find_slssteam_root(),
        "accela_installed": check_accela_installed(),
        "accela_dir": find_accela_root(),
    }
    if summary["slssteam_installed"]:
        summary["slssteam_injection"] = verify_slssteam_injected()
    return summary
