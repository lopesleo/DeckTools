"""Handling of game manifest download flows and related utilities (async port).

All public functions return native Python types (dict/list/str/bool).
Decky Loader auto-serializes return values to JSON.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from typing import Any, Dict

from api_manifest import load_api_manifest, load_ryu_cookie
from config import (
    APPID_LOG_FILE,
    LOADED_APPS_FILE,
    USER_AGENT,
    APPLIST_URL,
    APPLIST_FILE_NAME,
    APPLIST_DOWNLOAD_TIMEOUT,
    GAMES_DB_FILE_NAME,
    GAMES_DB_URL,
)
from http_client import ensure_http_client
from paths import backend_path, data_path, get_plugin_dir
from steam_utils import detect_steam_install_path, has_lua_for_app
from utils import ensure_temp_download_dir

try:
    import decky  # type: ignore
    logger = decky.logger
except ImportError:
    import logging
    logger = logging.getLogger("quickaccela")

DOWNLOAD_STATE: Dict[int, Dict[str, Any]] = {}
DOWNLOAD_TASKS: Dict[int, asyncio.Task] = {}

# Cache for app names
APP_NAME_CACHE: Dict[int, str] = {}

# Rate limiting for Steam API calls
_LAST_API_CALL_TIME = 0.0
_API_CALL_MIN_INTERVAL = 0.3  # 300ms between calls

# In-memory applist for fallback app name lookup
APPLIST_DATA: Dict[int, str] = {}
APPLIST_LOADED = False

# In-memory games database
GAMES_DB_DATA: Dict[str, Any] = {}
GAMES_DB_LOADED = False


def _set_download_state(appid: int, update: dict) -> None:
    state = DOWNLOAD_STATE.get(appid) or {}
    state.update(update)
    DOWNLOAD_STATE[appid] = state


def _get_download_state(appid: int) -> dict:
    return DOWNLOAD_STATE.get(appid, {}).copy()


def _is_download_cancelled(appid: int) -> bool:
    try:
        return _get_download_state(appid).get("status") == "cancelled"
    except Exception:
        return False


def _loaded_apps_path() -> str:
    return backend_path(LOADED_APPS_FILE)


def _appid_log_path() -> str:
    return backend_path(APPID_LOG_FILE)


# ---------------------------------------------------------------------------
# App name resolution
# ---------------------------------------------------------------------------

def _load_applist_into_memory() -> None:
    global APPLIST_DATA, APPLIST_LOADED
    if APPLIST_LOADED:
        return
    file_path = os.path.join(ensure_temp_download_dir(), APPLIST_FILE_NAME)
    if not os.path.exists(file_path):
        APPLIST_LOADED = True
        return
    try:
        with open(file_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, list):
            for entry in data:
                if isinstance(entry, dict):
                    appid = entry.get("appid")
                    name = entry.get("name")
                    if appid and name and isinstance(name, str) and name.strip():
                        APPLIST_DATA[int(appid)] = name.strip()
        APPLIST_LOADED = True
    except Exception:
        APPLIST_LOADED = True


def _get_app_name_from_applist(appid: int) -> str:
    if not APPLIST_LOADED:
        _load_applist_into_memory()
    return APPLIST_DATA.get(int(appid), "")


def _get_loaded_app_name(appid: int) -> str:
    try:
        path = _loaded_apps_path()
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as handle:
                for line in handle.read().splitlines():
                    if line.startswith(f"{appid}:"):
                        name = line.split(":", 1)[1].strip()
                        if name:
                            return name
    except Exception:
        pass
    return _get_app_name_from_applist(appid)


def _preload_app_names_cache() -> None:
    # From appid log
    try:
        log_path = _appid_log_path()
        if os.path.exists(log_path):
            with open(log_path, "r", encoding="utf-8") as handle:
                for line in handle.read().splitlines():
                    if "]" in line and " - " in line:
                        try:
                            parts = line.split("]", 1)
                            if len(parts) < 2:
                                continue
                            content_parts = parts[1].strip().split(" - ", 2)
                            if len(content_parts) >= 2:
                                appid = int(content_parts[0].strip())
                                name = content_parts[1].strip()
                                if name and not name.startswith("Unknown"):
                                    APP_NAME_CACHE[appid] = name
                        except (ValueError, IndexError):
                            continue
    except Exception:
        pass
    # From loaded apps
    try:
        path = _loaded_apps_path()
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as handle:
                for line in handle.read().splitlines():
                    if ":" in line:
                        parts = line.split(":", 1)
                        try:
                            appid = int(parts[0].strip())
                            name = parts[1].strip()
                            if name:
                                APP_NAME_CACHE[appid] = name
                        except (ValueError, IndexError):
                            continue
    except Exception:
        pass
    try:
        _load_applist_into_memory()
    except Exception:
        pass


async def fetch_app_name(appid: int) -> str:
    """Fetch app name with caching and rate limiting."""
    global _LAST_API_CALL_TIME

    if appid in APP_NAME_CACHE and APP_NAME_CACHE[appid]:
        return APP_NAME_CACHE[appid]

    # Check applist
    applist_name = _get_app_name_from_applist(appid)
    if applist_name:
        APP_NAME_CACHE[appid] = applist_name
        return applist_name

    # Rate limit Steam API calls
    now = time.time()
    elapsed = now - _LAST_API_CALL_TIME
    if elapsed < _API_CALL_MIN_INTERVAL:
        await asyncio.sleep(_API_CALL_MIN_INTERVAL - elapsed)
    _LAST_API_CALL_TIME = time.time()

    # Steam API as fallback
    try:
        client = await ensure_http_client("fetch_app_name")
        url = f"https://store.steampowered.com/api/appdetails?appids={appid}"
        resp = await client.get(url, follow_redirects=True, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        entry = data.get(str(appid)) or {}
        if isinstance(entry, dict):
            inner = entry.get("data") or {}
            name = inner.get("name")
            if isinstance(name, str) and name.strip():
                APP_NAME_CACHE[appid] = name.strip()
                return name.strip()
    except Exception:
        pass

    APP_NAME_CACHE[appid] = ""
    return ""


def _append_loaded_app(appid: int, name: str) -> None:
    try:
        path = _loaded_apps_path()
        lines = []
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as handle:
                lines = handle.read().splitlines()
        prefix = f"{appid}:"
        lines = [line for line in lines if not line.startswith(prefix)]
        lines.append(f"{appid}:{name}")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
    except Exception as exc:
        logger.warning(f"QuickAccela: _append_loaded_app failed for {appid}: {exc}")


def _remove_loaded_app(appid: int) -> None:
    try:
        path = _loaded_apps_path()
        if not os.path.exists(path):
            return
        with open(path, "r", encoding="utf-8") as handle:
            lines = handle.read().splitlines()
        prefix = f"{appid}:"
        new_lines = [line for line in lines if not line.startswith(prefix)]
        if len(new_lines) != len(lines):
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("\n".join(new_lines) + ("\n" if new_lines else ""))
    except Exception:
        pass


def _log_appid_event(action: str, appid: int, name: str) -> None:
    try:
        stamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
        line = f"[{action}] {appid} - {name} - {stamp}\n"
        with open(_appid_log_path(), "a", encoding="utf-8") as handle:
            handle.write(line)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Applist & Games DB initialization
# ---------------------------------------------------------------------------

async def init_applist() -> None:
    file_path = os.path.join(ensure_temp_download_dir(), APPLIST_FILE_NAME)
    if not os.path.exists(file_path):
        try:
            client = await ensure_http_client("DownloadApplist")
            resp = await client.get(APPLIST_URL, follow_redirects=True, timeout=APPLIST_DOWNLOAD_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                with open(file_path, "w", encoding="utf-8") as handle:
                    json.dump(data, handle)
        except Exception as exc:
            logger.warning(f"QuickAccela: Failed to download applist: {exc}")
    _load_applist_into_memory()


async def init_games_db() -> None:
    global GAMES_DB_DATA, GAMES_DB_LOADED
    file_path = os.path.join(ensure_temp_download_dir(), GAMES_DB_FILE_NAME)
    try:
        client = await ensure_http_client("DownloadGamesDB")
        resp = await client.get(GAMES_DB_URL, follow_redirects=True, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        with open(file_path, "w", encoding="utf-8") as handle:
            json.dump(data, handle)
        GAMES_DB_DATA = data
        GAMES_DB_LOADED = True
    except Exception as exc:
        logger.warning(f"QuickAccela: Failed to download Games DB: {exc}")
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as handle:
                    GAMES_DB_DATA = json.load(handle)
                GAMES_DB_LOADED = True
            except Exception:
                pass


def get_games_database() -> dict:
    return {"success": True, "data": GAMES_DB_DATA, "loaded": GAMES_DB_LOADED}


# ---------------------------------------------------------------------------
# Process & install
# ---------------------------------------------------------------------------

def _zip_basename(name: str) -> str:
    """Get the basename of a zip entry, handling both / and \\ separators."""
    return name.replace("\\", "/").split("/")[-1]


def _process_and_install_lua(appid: int, zip_path: str) -> None:
    """Process downloaded zip: extract manifests and lua files."""
    import zipfile

    if _is_download_cancelled(appid):
        raise RuntimeError("cancelled")

    base_path = detect_steam_install_path()
    target_dir = os.path.join(base_path or "", "config", "stplug-in")
    os.makedirs(target_dir, exist_ok=True)

    # ACCELA/Bifrost launcher integration (skip AppImage - it's a GUI app)
    launcher_bin = _load_launcher_path()
    if os.path.exists(launcher_bin) and not launcher_bin.endswith(".AppImage"):
        logger.info(f"QuickAccela: Sending {zip_path} to launcher at {launcher_bin}")
        try:
            if not os.access(launcher_bin, os.X_OK):
                os.chmod(launcher_bin, 0o755)
            clean_env = os.environ.copy()
            clean_env.pop("LD_LIBRARY_PATH", None)
            clean_env.pop("LD_PRELOAD", None)
            clean_env.pop("STEAM_RUNTIME", None)

            import subprocess
            proc = subprocess.Popen(
                [launcher_bin, zip_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=clean_env,
            )
            stdout, stderr = proc.communicate()
            if proc.returncode != 0:
                logger.warning(f"Launcher exited with code {proc.returncode}")
            if stderr:
                logger.warning(f"Launcher stderr: {stderr[:200]}")
        except Exception as e:
            logger.error(f"QuickAccela: Failed to run launcher: {e}")

    # Extract manifests and lua from zip
    with zipfile.ZipFile(zip_path, "r") as archive:
        names = archive.namelist()
        logger.info(f"QuickAccela: Zip contains {len(names)} entries: {names}")

        # Extract .manifest files to depotcache
        depotcache_dir = os.path.join(base_path or "", "depotcache")
        os.makedirs(depotcache_dir, exist_ok=True)
        for name in names:
            if _is_download_cancelled(appid):
                raise RuntimeError("cancelled")
            if name.lower().endswith(".manifest"):
                pure = _zip_basename(name)
                data = archive.read(name)
                out_path = os.path.join(depotcache_dir, pure)
                with open(out_path, "wb") as mf:
                    mf.write(data)
                logger.info(f"QuickAccela: Extracted manifest -> {out_path}")

        # Find and process .lua file
        candidates = [n for n in names if re.fullmatch(r"\d+\.lua", _zip_basename(n))]

        if _is_download_cancelled(appid):
            raise RuntimeError("cancelled")

        chosen = None
        preferred = f"{appid}.lua"
        for name in candidates:
            if _zip_basename(name) == preferred:
                chosen = name
                break
        if chosen is None and candidates:
            chosen = candidates[0]
        if not chosen:
            raise RuntimeError("No numeric .lua file found in zip")

        data = archive.read(chosen)
        try:
            text = data.decode("utf-8")
        except Exception:
            text = data.decode("utf-8", errors="replace")

        _set_download_state(appid, {"status": "installing"})
        dest_file = os.path.join(target_dir, f"{appid}.lua")
        if _is_download_cancelled(appid):
            raise RuntimeError("cancelled")
        with open(dest_file, "w", encoding="utf-8") as output:
            output.write(text)
        logger.info(f"QuickAccela: Installed lua -> {dest_file}")
        _set_download_state(appid, {"installedPath": dest_file})

    try:
        os.remove(zip_path)
    except Exception:
        pass


def _load_launcher_path() -> str:
    default_path = os.path.expanduser("~/.local/share/Bifrost/bin/Bifrost")
    # Also check /home/deck path for Steam Deck root context
    deck_default = "/home/deck/.local/share/Bifrost/bin/Bifrost"
    accela_appimage = "/home/deck/.local/share/ACCELA/ACCELA.AppImage"
    try:
        path_file = data_path("launcher_path.txt")
        if os.path.exists(path_file):
            with open(path_file, "r", encoding="utf-8") as f:
                saved = f.read().strip()
                if saved:
                    return saved
    except Exception:
        pass
    if os.path.exists(deck_default):
        return deck_default
    if os.path.exists(accela_appimage):
        return accela_appimage
    return default_path


# ---------------------------------------------------------------------------
# Game install directory resolution
# ---------------------------------------------------------------------------

async def _fetch_installdir_from_api(appid: int) -> str:
    """Fetch the official installdir from Steam's store API (like ACCELA does)."""
    try:
        client = await ensure_http_client("steam_api")
        url = f"https://store.steampowered.com/api/appdetails?appids={appid}"
        resp = await client.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            app_data = data.get(str(appid), {})
            if app_data.get("success"):
                install_dir = app_data.get("data", {}).get("install_dir")
                if install_dir:
                    logger.info(f"QuickAccela: installdir from Steam API: {install_dir}")
                    return install_dir
    except Exception as e:
        logger.debug(f"QuickAccela: Failed to fetch installdir from API: {e}")
    return ""


async def _determine_install_dir(appid: int, game_name: str) -> str:
    """Determine the directory to download game files into (like ACCELA).

    Priority: Steam API installdir > existing directory on disk > ACF > game name.
    """
    steam_path = detect_steam_install_path()
    if not steam_path:
        steam_path = "/home/deck/.local/share/Steam"
    common_path = os.path.join(steam_path, "steamapps", "common")

    # 1. Try Steam API for official installdir (like ACCELA's steam_api.py)
    api_installdir = await _fetch_installdir_from_api(appid)
    if api_installdir:
        full_path = os.path.join(common_path, api_installdir)
        logger.info(f"QuickAccela: Install dir from Steam API: {full_path}")
        return full_path

    # 2. Check if a directory already exists on disk matching the game
    if os.path.isdir(common_path):
        # Check ACF installdir first
        acf_path = os.path.join(steam_path, "steamapps", f"appmanifest_{appid}.acf")
        if os.path.exists(acf_path):
            try:
                with open(acf_path, "r", encoding="utf-8") as f:
                    content = f.read()
                m = re.search(r'"installdir"\s+"([^"]+)"', content)
                if m:
                    acf_dir = m.group(1)
                    full_path = os.path.join(common_path, acf_dir)
                    if os.path.isdir(full_path):
                        logger.info(f"QuickAccela: Install dir from ACF (verified on disk): {full_path}")
                        return full_path
                    # ACF dir doesn't exist — scan for similar directories
                    logger.info(f"QuickAccela: ACF installdir '{acf_dir}' not found on disk, scanning...")
            except Exception:
                pass

        # Scan common/ for directories matching game name
        game_lower = game_name.lower()
        for d in os.listdir(common_path):
            if d.lower().startswith(game_lower[:20]) or game_lower.startswith(d.lower()[:20]):
                candidate = os.path.join(common_path, d)
                if os.path.isdir(candidate):
                    logger.info(f"QuickAccela: Install dir matched on disk: {candidate}")
                    return candidate

    # 3. Fallback: use game name as directory name
    safe_name = re.sub(r'[<>:"/\\|?*]', '', game_name).strip()
    if not safe_name:
        safe_name = f"app_{appid}"
    full_path = os.path.join(common_path, safe_name)
    logger.info(f"QuickAccela: Install dir from game name: {full_path}")
    return full_path


# ---------------------------------------------------------------------------
# DepotDownloader integration — download actual game files
# ---------------------------------------------------------------------------

# DepotDownloaderMod executable search paths (self-contained build)
_DDM_EXE_SEARCH_PATHS = [
    "/home/deck/.local/share/QuickAccela/deps/DepotDownloaderMod",
    "/home/deck/.local/share/ACCELA/deps/DepotDownloaderMod",
]

# DepotDownloaderMod DLL search paths (framework-dependent build)
_DDM_DLL_SEARCH_PATHS = [
    "/home/deck/.local/share/QuickAccela/deps/DepotDownloaderMod.dll",
    "/home/deck/.local/share/ACCELA/deps/DepotDownloaderMod.dll",
]

# dotnet binary search paths
_DOTNET_SEARCH_PATHS = [
    "/home/deck/.dotnet/dotnet",
    "/home/deck/.local/share/dotnet/dotnet",
    os.path.expanduser("~/.dotnet/dotnet"),
]


def _find_dotnet() -> str:
    """Find the dotnet runtime binary."""
    for path in _DOTNET_SEARCH_PATHS:
        if os.path.exists(path):
            return path
    # Try PATH
    import shutil
    found = shutil.which("dotnet")
    if found:
        return found
    return ""


def _find_ddm_executable() -> tuple[list[str], str]:
    """Find DepotDownloaderMod and return (cmd_prefix, description).

    Tries self-contained executable first (like workshop.py), then dotnet + DLL.
    Returns ([], "") if not found.
    """
    import stat as stat_mod
    from workshop import load_workshop_tool_path

    # 1. Check custom workshop tool path for executable
    custom = load_workshop_tool_path()
    if custom and os.path.exists(custom):
        if os.path.isdir(custom):
            exe = os.path.join(custom, "DepotDownloaderMod")
            if os.path.exists(exe):
                try:
                    st = os.stat(exe)
                    os.chmod(exe, st.st_mode | stat_mod.S_IEXEC)
                except Exception:
                    pass
                return [exe], f"executable: {exe}"
            dll = os.path.join(custom, "DepotDownloaderMod.dll")
            if os.path.exists(dll):
                dotnet = _find_dotnet()
                if dotnet:
                    return [dotnet, dll], f"dotnet+dll: {dll}"
        elif os.path.isfile(custom):
            if custom.endswith(".dll"):
                dotnet = _find_dotnet()
                if dotnet:
                    return [dotnet, custom], f"dotnet+dll: {custom}"
            else:
                try:
                    st = os.stat(custom)
                    os.chmod(custom, st.st_mode | stat_mod.S_IEXEC)
                except Exception:
                    pass
                return [custom], f"executable: {custom}"

    # 2. Check known executable paths (self-contained)
    for path in _DDM_EXE_SEARCH_PATHS:
        if os.path.exists(path):
            try:
                st = os.stat(path)
                os.chmod(path, st.st_mode | stat_mod.S_IEXEC)
            except Exception:
                pass
            return [path], f"executable: {path}"

    # 3. Plugin backend dir executable
    base = os.path.join(get_plugin_dir(), "backend")
    bundled_exe = os.path.join(base, "DepotDownloaderMod")
    if os.path.exists(bundled_exe):
        try:
            st = os.stat(bundled_exe)
            os.chmod(bundled_exe, st.st_mode | stat_mod.S_IEXEC)
        except Exception:
            pass
        return [bundled_exe], f"executable: {bundled_exe}"

    # 4. Check known DLL paths (framework-dependent, needs dotnet)
    dotnet = _find_dotnet()
    if dotnet:
        for path in _DDM_DLL_SEARCH_PATHS:
            if os.path.exists(path):
                return [dotnet, path], f"dotnet+dll: {path}"

        bundled_dll = os.path.join(base, "deps", "DepotDownloaderMod.dll")
        if os.path.exists(bundled_dll):
            return [dotnet, bundled_dll], f"dotnet+dll: {bundled_dll}"

    return [], ""


def _parse_lua_depots(lua_path: str) -> list[dict]:
    """Parse a stplug-in lua file to extract depot/manifest info.

    Returns list of dicts: [{"depot": int, "manifest": str, "token": str}, ...]
    """
    depots = []
    manifest_map: Dict[int, dict] = {}

    try:
        with open(lua_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return depots

    # Parse addappid(depotid, type, "token") calls
    for m in re.finditer(r'addappid\(\s*(\d+)\s*,\s*\d+\s*,\s*"([^"]+)"\s*\)', content):
        depot_id = int(m.group(1))
        token = m.group(2)
        manifest_map.setdefault(depot_id, {})["depot"] = depot_id
        manifest_map[depot_id]["token"] = token

    # Parse setManifestid(depotid, "manifestid", ...) calls
    for m in re.finditer(r'setManifestid\(\s*(\d+)\s*,\s*"(\d+)"', content):
        depot_id = int(m.group(1))
        manifest_id = m.group(2)
        manifest_map.setdefault(depot_id, {})["depot"] = depot_id
        manifest_map[depot_id]["manifest"] = manifest_id

    depots = [v for v in manifest_map.values() if "depot" in v and "manifest" in v]
    return depots


async def _run_depot_download(appid: int, depots: list[dict], install_dir: str) -> None:
    """Run DepotDownloaderMod to download actual game files."""
    import tempfile

    cmd_prefix, ddm_desc = _find_ddm_executable()
    if not cmd_prefix:
        logger.error("QuickAccela: DepotDownloaderMod not found (no executable or dotnet+dll)")
        _set_download_state(appid, {
            "status": "failed",
            "error": "DepotDownloaderMod not found. Install ACCELA deps or set workshop tool path.",
        })
        return

    logger.info(f"QuickAccela: Using DDM: {ddm_desc}")

    os.makedirs(install_dir, exist_ok=True)
    total_depots = len(depots)
    logger.info(f"QuickAccela: Starting depot download for {appid}: {total_depots} depot(s) -> {install_dir}")

    # Generate depot keys file (mistwalker_keys.vdf format: "depot_id;key\n")
    temp_dir = tempfile.gettempdir()
    keys_path = os.path.join(temp_dir, "mistwalker_keys.vdf")
    try:
        with open(keys_path, "w", encoding="utf-8") as kf:
            for depot_info in depots:
                token = depot_info.get("token", "")
                if token:
                    kf.write(f"{depot_info['depot']};{token}\n")
        logger.info(f"QuickAccela: Wrote depot keys to {keys_path}")
    except Exception as e:
        logger.error(f"QuickAccela: Failed to write depot keys: {e}")
        _set_download_state(appid, {"status": "failed", "error": f"Failed to write depot keys: {e}"})
        return

    # Find manifest files in depotcache
    steam_path = detect_steam_install_path() or "/home/deck/.local/share/Steam"
    depotcache_dir = os.path.join(steam_path, "depotcache")

    # Set up clean environment (remove Steam runtime vars that break dotnet)
    clean_env = os.environ.copy()
    clean_env.pop("LD_LIBRARY_PATH", None)
    clean_env.pop("LD_PRELOAD", None)
    clean_env.pop("STEAM_RUNTIME", None)
    dotnet_path = _find_dotnet()
    if dotnet_path:
        clean_env["DOTNET_ROOT"] = os.path.dirname(dotnet_path)

    output_log = []

    for idx, depot_info in enumerate(depots):
        depot_id = depot_info["depot"]
        manifest_id = depot_info["manifest"]

        if _is_download_cancelled(appid):
            return

        _set_download_state(appid, {
            "status": "depot_download",
            "depotProgress": f"Depot {idx+1}/{total_depots}",
            "currentDepot": depot_id,
            "depotPercent": 0,
        })

        # Find the manifest file in depotcache
        manifest_file = os.path.join(depotcache_dir, f"{depot_id}_{manifest_id}.manifest")

        cmd = cmd_prefix + [
            "-app", str(appid),
            "-depot", str(depot_id),
            "-manifest", str(manifest_id),
            "-dir", install_dir,
            "-max-downloads", "8",
            "-os", "linux",
        ]

        # Add manifest file if it exists in depotcache
        if os.path.exists(manifest_file):
            cmd.extend(["-manifestfile", manifest_file])
            logger.info(f"QuickAccela: Using manifest file: {manifest_file}")

        # Add depot keys file if it has content
        try:
            if os.path.getsize(keys_path) > 0:
                cmd.extend(["-depotkeys", keys_path])
        except Exception:
            pass

        cmd.append("-validate")

        logger.info(f"QuickAccela: DepotDownloader cmd: {' '.join(cmd)}")

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=clean_env,
            )

            percent_re = re.compile(r"(\d{1,3}(?:\.\d{1,2})?)%")
            last_line = ""

            while True:
                line = await process.stdout.readline()
                if not line:
                    break  # EOF — stdout closed, process finishing

                if _is_download_cancelled(appid):
                    process.kill()
                    return

                clean_line = line.decode("utf-8", errors="replace").strip()
                if clean_line:
                    last_line = clean_line
                    output_log.append(clean_line.lower())
                    logger.info(f"QuickAccela: DDM[{depot_id}]: {clean_line}")
                    m = percent_re.search(clean_line)
                    if m:
                        pct = float(m.group(1))
                        _set_download_state(appid, {
                            "depotPercent": pct,
                            "depotProgress": f"Depot {idx+1}/{total_depots}: {pct:.0f}%",
                        })
                    elif "%" not in clean_line:
                        _set_download_state(appid, {
                            "depotProgress": f"Depot {idx+1}/{total_depots}: {clean_line[:60]}",
                        })

            await process.wait()
            rc = process.returncode
            logger.info(f"QuickAccela: DepotDownloader depot {depot_id} exit code: {rc}, last output: {last_line}")

            # Check for auth/access errors in output
            full_log = "\n".join(output_log)
            auth_error = any(x in full_log for x in ("access denied", "manifest not available", "no subscription", "purchase"))

            if rc != 0 or auth_error:
                error_msg = last_line if last_line else f"exit code {rc}"
                if auth_error:
                    error_msg = f"Access denied for depot {depot_id} (auth required)"
                logger.warning(f"QuickAccela: DepotDownloader failed for depot {depot_id}: {error_msg}")
                _set_download_state(appid, {
                    "status": "failed",
                    "error": f"Depot {depot_id} failed: {error_msg}",
                })
                return

        except Exception as e:
            logger.error(f"QuickAccela: DepotDownloader error for depot {depot_id}: {e}")
            _set_download_state(appid, {
                "status": "failed",
                "error": f"Depot {depot_id} error: {e}",
            })
            return

    # Clean up temp keys file
    try:
        if os.path.exists(keys_path):
            os.remove(keys_path)
    except Exception:
        pass

    logger.info(f"QuickAccela: All depots downloaded for {appid} -> {install_dir}")

    # Fix file ownership: Decky runs as root but Steam runs as deck user
    try:
        import subprocess
        subprocess.run(
            ["chown", "-R", "deck:deck", install_dir],
            timeout=120, capture_output=True,
        )
        logger.info(f"QuickAccela: Fixed ownership of {install_dir} to deck:deck")
    except Exception as chown_exc:
        logger.warning(f"QuickAccela: chown failed for {install_dir}: {chown_exc}")


async def _restart_steam_delayed(delay: int = 5) -> None:
    """Restart Steam after a delay. On Steam Deck Game Mode, Steam auto-restarts."""
    await asyncio.sleep(delay)
    try:
        import subprocess
        logger.info("QuickAccela: Restarting Steam...")
        subprocess.Popen(
            ["steam", "-shutdown"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        logger.warning(f"QuickAccela: Failed to restart Steam: {e}")


def _get_dir_size(path: str) -> int:
    """Calculate total size of all files in a directory tree."""
    total = 0
    for dirpath, _dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total


def _chmod_linux_binaries(install_dir: str) -> None:
    """Set executable permissions on Linux binaries (like ACCELA's _run_chmod_recursive)."""
    import stat
    if not os.path.isdir(install_dir):
        return
    chmod_count = 0
    # Known Linux binary extensions and ELF magic
    binary_exts = {".sh", ".x86", ".x86_64", ".so", ""}
    for dirpath, _dirnames, filenames in os.walk(install_dir):
        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            try:
                _, ext = os.path.splitext(fname)
                should_chmod = False
                if ext.lower() in (".sh", ".x86", ".x86_64"):
                    should_chmod = True
                elif ext == "":
                    # Check if ELF binary
                    try:
                        with open(fpath, "rb") as bf:
                            magic = bf.read(4)
                        if magic == b"\x7fELF":
                            should_chmod = True
                    except Exception:
                        pass
                if should_chmod:
                    st = os.stat(fpath)
                    new_mode = st.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
                    if new_mode != st.st_mode:
                        os.chmod(fpath, new_mode)
                        chmod_count += 1
            except Exception:
                pass
    if chmod_count > 0:
        logger.info(f"QuickAccela: Set executable permissions on {chmod_count} files in {install_dir}")


def _create_or_update_appmanifest(appid: int, install_dir: str, depots: list[dict], game_name: str = "") -> None:
    """Create or overwrite the appmanifest ACF (matching ACCELA's _create_acf_file exactly).

    Key differences from previous version:
    - InstalledDepots is EMPTY on Linux (ACCELA line 770)
    - Adds platform_override for Windows depots on Linux
    - Calls chmod on Linux binaries
    - Triggers Steam restart
    """
    steam_path = detect_steam_install_path() or "/home/deck/.local/share/Steam"
    acf_path = os.path.join(steam_path, "steamapps", f"appmanifest_{appid}.acf")

    # Derive installdir from actual download directory basename
    install_folder_name = os.path.basename(install_dir.rstrip("/\\"))
    if not install_folder_name:
        install_folder_name = f"app_{appid}"

    # Resolve game name: param > existing ACF > fallback
    if not game_name and os.path.exists(acf_path):
        try:
            with open(acf_path, "r", encoding="utf-8") as f:
                old = f.read()
            m = re.search(r'"name"\s+"([^"]+)"', old)
            if m:
                game_name = m.group(1)
        except Exception:
            pass
    if not game_name:
        game_name = install_folder_name

    size_on_disk = _get_dir_size(install_dir)

    # InstalledDepots — ACCELA leaves it empty on Linux (line 770 in task_manager.py)
    installed_depots_str = '\t"InstalledDepots"\n\t{\n\t}'

    # Platform config — detect if game has Windows .exe files (needs Proton override)
    # Like ACCELA: Windows depots on Linux get platform_override; native Linux gets empty config
    has_exe = False
    has_linux_binary = False
    if os.path.isdir(install_dir):
        for fname in os.listdir(install_dir):
            fl = fname.lower()
            if fl.endswith(".exe"):
                has_exe = True
            if fl.endswith(".sh") or fl.endswith(".x86_64") or fl.endswith(".x86"):
                has_linux_binary = True

    if has_exe and not has_linux_binary:
        # Windows game on Linux — needs Proton (like ACCELA line 719-730)
        platform_config = (
            '\t"UserConfig"\n'
            '\t{\n'
            '\t\t"platform_override_dest"\t\t"linux"\n'
            '\t\t"platform_override_source"\t\t"windows"\n'
            '\t}\n'
            '\t"MountedConfig"\n'
            '\t{\n'
            '\t\t"platform_override_dest"\t\t"linux"\n'
            '\t\t"platform_override_source"\t\t"windows"\n'
            '\t}'
        )
    else:
        # Native Linux or unknown — empty config (ACCELA line 733/738)
        platform_config = '\t"UserConfig"\n\t{\n\t}\n\t"MountedConfig"\n\t{\n\t}'

    acf_content = (
        '"AppState"\n'
        "{\n"
        f'\t"appid"\t\t"{appid}"\n'
        f'\t"Universe"\t\t"1"\n'
        f'\t"name"\t\t"{game_name}"\n'
        f'\t"StateFlags"\t\t"4"\n'
        f'\t"installdir"\t\t"{install_folder_name}"\n'
        f'\t"SizeOnDisk"\t\t"{size_on_disk}"\n'
        f'\t"buildid"\t\t"0"\n'
        f"{installed_depots_str}\n"
        f"{platform_config}\n"
        "}"
    )

    try:
        os.makedirs(os.path.dirname(acf_path), exist_ok=True)
        tmp_path = acf_path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(acf_content)
        os.replace(tmp_path, acf_path)
        try:
            import subprocess
            subprocess.run(["chown", "deck:deck", acf_path], timeout=10, capture_output=True)
        except Exception:
            pass
        logger.info(
            f"QuickAccela: Created appmanifest {acf_path}: "
            f"installdir={install_folder_name}, StateFlags=4, "
            f"SizeOnDisk={size_on_disk}, platform={'windows_override' if has_exe and not has_linux_binary else 'native'}"
        )
    except Exception as e:
        logger.error(f"QuickAccela: Failed to write appmanifest: {e}")

    # Set executable permissions for Linux binaries (like ACCELA's _set_linux_binary_permissions)
    _chmod_linux_binaries(install_dir)


async def repair_appmanifest(appid: int) -> dict:
    """Repair a broken appmanifest ACF for an existing game (without re-downloading).

    This mirrors what ACCELA does: create a correct ACF from scratch,
    set Linux binary permissions, and restart Steam.
    """
    steam_path = detect_steam_install_path() or "/home/deck/.local/share/Steam"
    common_path = os.path.join(steam_path, "steamapps", "common")

    # Find the actual game directory
    install_dir = ""
    game_name = ""

    # Try Steam API first for official installdir
    api_installdir = await _fetch_installdir_from_api(appid)
    if api_installdir:
        candidate = os.path.join(common_path, api_installdir)
        if os.path.isdir(candidate):
            install_dir = candidate
            logger.info(f"QuickAccela: repair - found dir via API: {install_dir}")

    # Try reading existing ACF for installdir and name
    acf_path = os.path.join(steam_path, "steamapps", f"appmanifest_{appid}.acf")
    if os.path.exists(acf_path):
        try:
            with open(acf_path, "r", encoding="utf-8") as f:
                content = f.read()
            m_name = re.search(r'"name"\s+"([^"]+)"', content)
            if m_name:
                game_name = m_name.group(1)
            if not install_dir:
                m_dir = re.search(r'"installdir"\s+"([^"]+)"', content)
                if m_dir:
                    candidate = os.path.join(common_path, m_dir.group(1))
                    if os.path.isdir(candidate):
                        install_dir = candidate
        except Exception:
            pass

    # Scan common/ if still not found
    if not install_dir:
        try:
            fetched_name = await fetch_app_name(appid)
        except Exception:
            fetched_name = ""
        if fetched_name:
            game_name = game_name or fetched_name
            # Search by name match
            if os.path.isdir(common_path):
                name_lower = fetched_name.lower()
                for d in os.listdir(common_path):
                    if d.lower().startswith(name_lower[:15]) or name_lower.startswith(d.lower()[:15]):
                        candidate = os.path.join(common_path, d)
                        if os.path.isdir(candidate):
                            install_dir = candidate
                            break

    if not install_dir:
        return {"success": False, "error": f"Game directory not found for AppID {appid}"}

    if not game_name:
        game_name = os.path.basename(install_dir)

    # Parse lua for depot info (may be empty — that's OK, ACCELA uses empty InstalledDepots on Linux)
    lua_path = os.path.join(steam_path, "config", "stplug-in", f"{appid}.lua")
    depots = _parse_lua_depots(lua_path) if os.path.exists(lua_path) else []

    # Create the ACF (matching ACCELA)
    _create_or_update_appmanifest(appid, install_dir, depots, game_name)

    # Restart Steam so it reads the fresh ACF
    asyncio.ensure_future(_restart_steam_delayed(3))

    return {
        "success": True,
        "installdir": os.path.basename(install_dir),
        "game_name": game_name,
        "message": "Appmanifest repaired. Steam will restart.",
    }


# ---------------------------------------------------------------------------
# Main download flow (async)
# ---------------------------------------------------------------------------

async def _download_zip_for_app(appid: int) -> None:
    """Download manifest zip from enabled APIs and install."""
    client = await ensure_http_client("download")
    apis = load_api_manifest()
    if not apis:
        _set_download_state(appid, {"status": "failed", "error": "No APIs available"})
        return

    dest_root = ensure_temp_download_dir()
    dest_path = os.path.join(dest_root, f"{appid}.zip")
    _set_download_state(appid, {
        "status": "checking", "currentApi": None,
        "bytesRead": 0, "totalBytes": 0, "dest": dest_path,
    })

    for api in apis:
        name = api.get("name", "Unknown")
        template = api.get("url", "")
        success_code = int(api.get("success_code", 200))
        unavailable_code = int(api.get("unavailable_code", 404))
        url = template.replace("<appid>", str(appid))
        _set_download_state(appid, {
            "status": "checking", "currentApi": name,
            "bytesRead": 0, "totalBytes": 0,
        })
        logger.info(f"QuickAccela: Trying API '{name}' -> {url}")

        try:
            headers = {"User-Agent": USER_AGENT}

            # Ryuu cookie injection
            if "ryuu.lol" in url:
                cookie_content = load_ryu_cookie()
                if cookie_content:
                    headers["Cookie"] = cookie_content
                    headers["Referer"] = "https://generator.ryuu.lol/"
                    headers["Authority"] = "generator.ryuu.lol"
                    headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                    headers["Upgrade-Insecure-Requests"] = "1"
                    headers["Sec-Fetch-Dest"] = "document"
                    headers["Sec-Fetch-Mode"] = "navigate"
                    headers["Sec-Fetch-Site"] = "same-origin"
                else:
                    logger.warning("QuickAccela: Ryuu API detected but ryuu_cookie.txt not found or empty!")

            if _is_download_cancelled(appid):
                return

            async with client.stream("GET", url, headers=headers, follow_redirects=True, timeout=30) as resp:
                code = resp.status_code
                logger.info(f"QuickAccela: API '{name}' status={code}")
                if code == unavailable_code:
                    continue
                if code != success_code:
                    if "ryuu.lol" in url and code in (401, 403):
                        logger.warning(f"QuickAccela: Ryuu access denied ({code}). Check if cookie expired.")
                    continue

                total = int(resp.headers.get("Content-Length", "0") or "0")
                _set_download_state(appid, {"status": "downloading", "bytesRead": 0, "totalBytes": total, "downloadStartTime": time.time()})

                with open(dest_path, "wb") as output:
                    async for chunk in resp.aiter_bytes():
                        if not chunk:
                            continue
                        if _is_download_cancelled(appid):
                            raise RuntimeError("cancelled")
                        output.write(chunk)
                        read = int(_get_download_state(appid).get("bytesRead", 0)) + len(chunk)
                        elapsed = time.time() - _get_download_state(appid).get("downloadStartTime", time.time())
                        speed = int(read / elapsed) if elapsed > 0.5 else 0
                        _set_download_state(appid, {"bytesRead": read, "speed": speed})

                if _is_download_cancelled(appid):
                    raise RuntimeError("cancelled")

                # Validate ZIP magic + Ryuu login detection
                try:
                    with open(dest_path, "rb") as fh:
                        magic = fh.read(4)
                        if magic not in (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"):
                            file_size = os.path.getsize(dest_path)
                            with open(dest_path, "rb") as check_f:
                                preview = check_f.read(512)
                                content_preview = preview[:100].decode("utf-8", errors="ignore")
                            logger.warning(
                                f"QuickAccela: API '{name}' returned non-zip (magic={magic.hex()}, size={file_size}, preview={content_preview[:50]})"
                            )
                            if "Login required" in content_preview or "Sign in" in content_preview:
                                logger.error("QuickAccela: Ryuu site asked for login. Cookie is invalid or expired.")
                            try:
                                os.remove(dest_path)
                            except Exception:
                                pass
                            continue
                except FileNotFoundError:
                    continue

                # Process and install
                try:
                    if _is_download_cancelled(appid):
                        raise RuntimeError("cancelled")
                    _set_download_state(appid, {"status": "processing"})
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, _process_and_install_lua, appid, dest_path)

                    if _is_download_cancelled(appid):
                        raise RuntimeError("cancelled")

                    try:
                        fetched_name = await fetch_app_name(appid) or f"Unknown ({appid})"
                        _append_loaded_app(appid, fetched_name)
                        _log_appid_event(f"ADDED - {name}", appid, fetched_name)
                    except Exception:
                        pass

                    # Auto-configure SLSsteam so the game appears in Steam library
                    _set_download_state(appid, {"status": "configuring"})
                    try:
                        from slssteam_ops import add_game_token, add_game_dlcs, add_to_additional_apps
                        r0 = add_to_additional_apps(appid)
                        logger.info(f"QuickAccela: SLSsteam add_to_additional_apps({appid}): {r0}")
                        r2 = add_game_token(appid)
                        logger.info(f"QuickAccela: SLSsteam add_game_token({appid}): {r2}")
                        r3 = await add_game_dlcs(appid)
                        logger.info(f"QuickAccela: SLSsteam add_game_dlcs({appid}): {r3}")
                    except Exception as sls_exc:
                        logger.warning(f"QuickAccela: SLSsteam config partial: {sls_exc}")

                    # Download actual game files via DepotDownloader
                    if _is_download_cancelled(appid):
                        raise RuntimeError("cancelled")

                    _set_download_state(appid, {"status": "depot_download", "depotProgress": "Preparing..."})
                    try:
                        lua_path = _get_download_state(appid).get("installedPath", "")
                        if not lua_path:
                            steam_base = detect_steam_install_path()
                            lua_path = os.path.join(steam_base or "", "config", "stplug-in", f"{appid}.lua")

                        depots = _parse_lua_depots(lua_path) if os.path.exists(lua_path) else []
                        if depots:
                            install_dir = await _determine_install_dir(appid, fetched_name)
                            logger.info(f"QuickAccela: Starting depot download - {len(depots)} depot(s) -> {install_dir}")
                            await _run_depot_download(appid, depots, install_dir)

                            if _is_download_cancelled(appid):
                                raise RuntimeError("cancelled")

                            # Check if depot download failed
                            cur_state = _get_download_state(appid)
                            if cur_state.get("status") == "failed":
                                return

                            # Create/overwrite appmanifest so Steam recognizes the game as installed
                            try:
                                _create_or_update_appmanifest(appid, install_dir, depots, fetched_name)
                            except Exception as acf_exc:
                                logger.warning(f"QuickAccela: appmanifest update error: {acf_exc}")
                        else:
                            logger.info(f"QuickAccela: No depots found in lua for {appid}, skipping game file download")
                    except RuntimeError:
                        raise
                    except Exception as depot_exc:
                        logger.warning(f"QuickAccela: Depot download error: {depot_exc}")
                        _set_download_state(appid, {"status": "failed", "error": f"Game download failed: {depot_exc}"})
                        return

                    # Save depot snapshot for update checking
                    try:
                        from api_manifest import save_depot_snapshot
                        await save_depot_snapshot(appid)
                    except Exception as snap_exc:
                        logger.warning(f"QuickAccela: depot snapshot save error: {snap_exc}")

                    # Restart Steam so it reads the fresh ACF (like ACCELA)
                    asyncio.ensure_future(_restart_steam_delayed(5))

                    _set_download_state(appid, {"status": "done", "success": True, "api": name})
                    return
                except Exception as install_exc:
                    if isinstance(install_exc, RuntimeError) and str(install_exc) == "cancelled":
                        try:
                            if os.path.exists(dest_path):
                                os.remove(dest_path)
                        except Exception:
                            pass
                        return
                    logger.warning(f"QuickAccela: Processing failed -> {install_exc}")
                    _set_download_state(appid, {"status": "failed", "error": f"Processing failed: {install_exc}"})
                    try:
                        os.remove(dest_path)
                    except Exception:
                        pass
                    return

        except RuntimeError as cancel_exc:
            if str(cancel_exc) == "cancelled":
                try:
                    if os.path.exists(dest_path):
                        os.remove(dest_path)
                except Exception:
                    pass
                return
            _set_download_state(appid, {"status": "failed", "error": str(cancel_exc)})
            return
        except Exception as err:
            logger.warning(f"QuickAccela: API '{name}' failed: {err}")
            continue

    _set_download_state(appid, {"status": "failed", "error": "Not available on any API"})


async def start_download(appid: int) -> dict:
    try:
        appid = int(appid)
    except Exception:
        return {"success": False, "error": "Invalid appid"}

    logger.info(f"QuickAccela: start_download appid={appid}")
    _set_download_state(appid, {"status": "queued", "bytesRead": 0, "totalBytes": 0})
    task = asyncio.create_task(_download_zip_for_app(appid))
    DOWNLOAD_TASKS[appid] = task
    return {"success": True}


def get_download_status(appid: int) -> dict:
    try:
        appid = int(appid)
    except Exception:
        return {"success": False, "error": "Invalid appid"}
    return {"success": True, "state": _get_download_state(appid)}


def get_active_downloads() -> dict:
    """Return all downloads that are still in progress (not terminal)."""
    active = {}
    terminal = {"done", "failed", "cancelled"}
    for appid, state in DOWNLOAD_STATE.items():
        status = state.get("status")
        if status and status not in terminal:
            active[str(appid)] = state.copy()
    return {"success": True, "downloads": active}


def cancel_download(appid: int) -> dict:
    try:
        appid = int(appid)
    except Exception:
        return {"success": False, "error": "Invalid appid"}

    state = _get_download_state(appid)
    if not state or state.get("status") in {"done", "failed"}:
        return {"success": True, "message": "Nothing to cancel"}

    _set_download_state(appid, {"status": "cancelled", "error": "Cancelled by user"})
    task = DOWNLOAD_TASKS.get(appid)
    if task and not task.done():
        task.cancel()
    return {"success": True}


def has_luatools_for_app(appid: int) -> dict:
    try:
        appid = int(appid)
    except Exception:
        return {"success": False, "error": "Invalid appid"}
    return {"success": True, "exists": has_lua_for_app(appid)}


def delete_luatools_for_app(appid: int) -> dict:
    try:
        appid = int(appid)
    except Exception:
        return {"success": False, "error": "Invalid appid"}

    base = detect_steam_install_path()
    target_dir = os.path.join(base or "", "config", "stplug-in")
    paths_to_check = [
        os.path.join(target_dir, f"{appid}.lua"),
        os.path.join(target_dir, f"{appid}.lua.disabled"),
    ]
    deleted = []
    for path in paths_to_check:
        try:
            if os.path.exists(path):
                os.remove(path)
                deleted.append(path)
        except Exception as exc:
            logger.warning(f"QuickAccela: Failed to delete {path}: {exc}")
    try:
        name = _get_loaded_app_name(appid) or f"Unknown ({appid})"
        _remove_loaded_app(appid)
        if deleted:
            _log_appid_event("REMOVED", appid, name)
    except Exception:
        pass
    return {"success": True, "deleted": deleted, "count": len(deleted)}


def get_installed_lua_scripts() -> dict:
    """Get list of all installed Lua scripts from stplug-in directory."""
    try:
        _preload_app_names_cache()
        base_path = detect_steam_install_path()
        if not base_path:
            return {"success": False, "error": "Could not find Steam installation path"}

        target_dir = os.path.join(base_path, "config", "stplug-in")
        if not os.path.exists(target_dir):
            return {"success": True, "scripts": []}

        installed_scripts = []
        for filename in os.listdir(target_dir):
            if filename.endswith(".lua") or filename.endswith(".lua.disabled"):
                try:
                    appid_str = filename.replace(".lua.disabled", "").replace(".lua", "")
                    appid = int(appid_str)
                    is_disabled = filename.endswith(".lua.disabled")

                    game_name = APP_NAME_CACHE.get(appid, "")
                    if not game_name:
                        game_name = _get_loaded_app_name(appid)
                    if not game_name:
                        game_name = f"Unknown Game ({appid})"

                    file_path = os.path.join(target_dir, filename)
                    file_stat = os.stat(file_path)

                    import datetime
                    modified_time = datetime.datetime.fromtimestamp(file_stat.st_mtime)

                    installed_scripts.append({
                        "appid": appid,
                        "gameName": game_name,
                        "filename": filename,
                        "isDisabled": is_disabled,
                        "fileSize": file_stat.st_size,
                        "modifiedDate": modified_time.strftime("%Y-%m-%d %H:%M:%S"),
                        "path": file_path,
                        "hasGameFiles": os.path.exists(
                            os.path.join(base_path, "steamapps", f"appmanifest_{appid}.acf")
                        ),
                    })
                except ValueError:
                    continue
                except Exception:
                    continue

        installed_scripts.sort(key=lambda x: x["appid"])
        return {"success": True, "scripts": installed_scripts}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def read_loaded_apps() -> dict:
    try:
        path = _loaded_apps_path()
        entries = []
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as handle:
                for line in handle.read().splitlines():
                    if ":" in line:
                        appid_str, name = line.split(":", 1)
                        appid_str = appid_str.strip()
                        name = name.strip()
                        if appid_str.isdigit() and name:
                            entries.append({"appid": int(appid_str), "name": name})
        return {"success": True, "apps": entries}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def dismiss_loaded_apps() -> dict:
    """Delete the loadedappids.txt file."""
    try:
        path = _loaded_apps_path()
        if os.path.exists(path):
            os.remove(path)
        return {"success": True}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def save_launcher_path_config(path: str) -> dict:
    try:
        path_file = data_path("launcher_path.txt")
        clean_path = path.strip()
        with open(path_file, "w", encoding="utf-8") as f:
            f.write(clean_path)
        return {"success": True, "path": clean_path}
    except Exception as e:
        return {"success": False, "error": str(e)}


def load_launcher_path() -> str:
    """Public accessor for the launcher path."""
    return _load_launcher_path()
