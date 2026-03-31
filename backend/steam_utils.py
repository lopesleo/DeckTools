"""Steam-related utilities used across DeckTools backend modules."""

from __future__ import annotations

import os
import re
import subprocess
from typing import Dict, Optional

from paths import find_steam_root

try:
    import decky  # type: ignore
    logger = decky.logger
except ImportError:
    import logging
    logger = logging.getLogger("decktools")

_STEAM_INSTALL_PATH: Optional[str] = None

# Well-known Linux Steam paths (same priority as paths.py)
_LINUX_STEAM_PATHS = [
    "/home/deck/.local/share/Steam",
    "/home/deck/.steam/steam",
    os.path.expanduser("~/.steam/steam"),
    os.path.expanduser("~/.local/share/Steam"),
    "/opt/steam/steam",
    "/usr/local/steam",
]


def detect_steam_install_path() -> str:
    global _STEAM_INSTALL_PATH
    if _STEAM_INSTALL_PATH:
        return _STEAM_INSTALL_PATH
    # Use find_steam_root which already handles Deck paths
    path = find_steam_root()
    if not path:
        for candidate in _LINUX_STEAM_PATHS:
            if os.path.isdir(candidate):
                path = candidate
                break
    _STEAM_INSTALL_PATH = path
    logger.info(f"DeckTools: Steam install path set to {_STEAM_INSTALL_PATH}")
    return _STEAM_INSTALL_PATH or ""


def _parse_vdf_simple(content: str) -> Dict[str, any]:
    """Simple VDF parser for libraryfolders.vdf and appmanifest files."""
    result: Dict[str, any] = {}
    stack = [result]
    current_key = None

    lines = content.split("\n")
    tokens = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        parts = re.findall(r'"[^"]*"|\{|\}', line)
        tokens.extend(parts)

    i = 0
    while i < len(tokens):
        token = tokens[i].strip('"')

        if tokens[i] == "{":
            if current_key:
                new_dict = {}
                stack[-1][current_key] = new_dict
                stack.append(new_dict)
                current_key = None
        elif tokens[i] == "}":
            if len(stack) > 1:
                stack.pop()
        elif current_key is None:
            current_key = token
        else:
            stack[-1][current_key] = token
            current_key = None
        i += 1

    return result


def has_lua_for_app(appid: int) -> bool:
    try:
        base_path = detect_steam_install_path()
        if not base_path:
            return False
        stplug_path = os.path.join(base_path, "config", "stplug-in")
        lua_file = os.path.join(stplug_path, f"{appid}.lua")
        disabled_file = os.path.join(stplug_path, f"{appid}.lua.disabled")
        return os.path.exists(lua_file) or os.path.exists(disabled_file)
    except Exception as exc:
        logger.error(f"DeckTools: Error checking Lua scripts for app {appid}: {exc}")
        return False


def get_game_install_path_response(appid: int) -> Dict[str, any]:
    """Find the game installation path. Returns dict with success/error."""
    try:
        appid = int(appid)
    except Exception:
        return {"success": False, "error": "Invalid appid"}

    steam_path = detect_steam_install_path()
    if not steam_path:
        return {"success": False, "error": "Could not find Steam installation path"}

    library_vdf_path = os.path.join(steam_path, "config", "libraryfolders.vdf")
    if not os.path.exists(library_vdf_path):
        return {"success": False, "error": "Could not find libraryfolders.vdf"}

    try:
        with open(library_vdf_path, "r", encoding="utf-8") as handle:
            vdf_content = handle.read()
        library_data = _parse_vdf_simple(vdf_content)
    except Exception as exc:
        return {"success": False, "error": "Failed to parse libraryfolders.vdf"}

    library_folders = library_data.get("libraryfolders", {})
    library_path = None
    appid_str = str(appid)
    all_library_paths = []

    for folder_data in library_folders.values():
        if isinstance(folder_data, dict):
            folder_path = folder_data.get("path", "")
            if folder_path:
                folder_path = folder_path.replace("\\\\", "\\")
                all_library_paths.append(folder_path)
            apps = folder_data.get("apps", {})
            if isinstance(apps, dict) and appid_str in apps:
                library_path = folder_path
                break

    appmanifest_path = None
    if not library_path:
        for lib_path in all_library_paths:
            candidate_path = os.path.join(lib_path, "steamapps", f"appmanifest_{appid}.acf")
            if os.path.exists(candidate_path):
                library_path = lib_path
                appmanifest_path = candidate_path
                break
    else:
        appmanifest_path = os.path.join(library_path, "steamapps", f"appmanifest_{appid}.acf")

    if not library_path or not appmanifest_path or not os.path.exists(appmanifest_path):
        return {"success": False, "error": "Game not installed"}

    try:
        with open(appmanifest_path, "r", encoding="utf-8") as handle:
            manifest_content = handle.read()
        manifest_data = _parse_vdf_simple(manifest_content)
    except Exception:
        return {"success": False, "error": "Failed to parse appmanifest"}

    app_state = manifest_data.get("AppState", {})
    install_dir = app_state.get("installdir", "")
    if not install_dir:
        return {"success": False, "error": "Install directory not found"}

    full_install_path = os.path.join(library_path, "steamapps", "common", install_dir)
    if not os.path.exists(full_install_path):
        return {"success": False, "error": "Game directory not found"}

    return {
        "success": True,
        "installPath": full_install_path,
        "installDir": install_dir,
        "libraryPath": library_path,
        "path": full_install_path,
        "sizeOnDisk": int(app_state.get("SizeOnDisk", 0)),
    }


def get_installed_games() -> list:
    """Scan all Steam library folders for installed games (appmanifest_*.acf files)."""
    steam_path = detect_steam_install_path()
    if not steam_path:
        return []

    library_vdf_path = os.path.join(steam_path, "config", "libraryfolders.vdf")
    if not os.path.exists(library_vdf_path):
        return []

    try:
        with open(library_vdf_path, "r", encoding="utf-8") as handle:
            vdf_content = handle.read()
        library_data = _parse_vdf_simple(vdf_content)
    except Exception:
        return []

    library_folders = library_data.get("libraryfolders", {})
    all_library_paths = []
    for folder_data in library_folders.values():
        if isinstance(folder_data, dict):
            folder_path = folder_data.get("path", "")
            if folder_path:
                all_library_paths.append(folder_path.replace("\\\\", "\\"))

    games = []
    seen_appids = set()
    for lib_path in all_library_paths:
        steamapps = os.path.join(lib_path, "steamapps")
        if not os.path.isdir(steamapps):
            continue
        try:
            for filename in os.listdir(steamapps):
                if not filename.startswith("appmanifest_") or not filename.endswith(".acf"):
                    continue
                try:
                    appid_str = filename.replace("appmanifest_", "").replace(".acf", "")
                    appid = int(appid_str)
                    if appid in seen_appids:
                        continue
                    seen_appids.add(appid)

                    acf_path = os.path.join(steamapps, filename)
                    with open(acf_path, "r", encoding="utf-8") as f:
                        acf_data = _parse_vdf_simple(f.read())
                    app_state = acf_data.get("AppState", {})
                    name = app_state.get("name", f"Unknown ({appid})")
                    install_dir = app_state.get("installdir", "")

                    games.append({
                        "appid": appid,
                        "name": name,
                        "installDir": install_dir,
                        "libraryPath": lib_path,
                    })
                except (ValueError, Exception):
                    continue
        except Exception:
            continue

    games.sort(key=lambda g: g["name"].lower())
    return games


def get_steam_libraries() -> list:
    """Return all Steam library folders with free space info.

    Each entry: {"path": str, "freeBytes": int, "totalBytes": int, "gameCount": int}
    """
    steam_path = detect_steam_install_path()
    if not steam_path:
        return []

    library_vdf_path = os.path.join(steam_path, "config", "libraryfolders.vdf")
    if not os.path.exists(library_vdf_path):
        return []

    try:
        with open(library_vdf_path, "r", encoding="utf-8") as handle:
            vdf_content = handle.read()
        library_data = _parse_vdf_simple(vdf_content)
    except Exception:
        return []

    library_folders = library_data.get("libraryfolders", {})
    libraries = []

    for folder_data in library_folders.values():
        if not isinstance(folder_data, dict):
            continue
        folder_path = folder_data.get("path", "")
        if not folder_path:
            continue
        folder_path = folder_path.replace("\\\\", "\\")

        apps = folder_data.get("apps", {})
        game_count = len(apps) if isinstance(apps, dict) else 0

        free_bytes = 0
        total_bytes = 0
        try:
            st = os.statvfs(folder_path)
            free_bytes = st.f_bavail * st.f_frsize
            total_bytes = st.f_blocks * st.f_frsize
        except Exception:
            pass

        libraries.append({
            "path": folder_path,
            "freeBytes": free_bytes,
            "totalBytes": total_bytes,
            "gameCount": game_count,
        })

    return libraries


def open_game_folder(path: str) -> bool:
    try:
        if not path or not os.path.exists(path):
            return False
        subprocess.Popen(["xdg-open", path])
        return True
    except Exception:
        return False
