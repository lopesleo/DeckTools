"""SLSsteam config operations: FakeAppId, GameToken, DLCs, PlayStatus, Uninstall."""

from __future__ import annotations

import os
import shutil
from typing import Any

import json

from downloads import delete_luatools_for_app
from http_client import ensure_http_client
from steam_utils import get_game_install_path_response
from paths import get_slssteam_config_path, backend_path

try:
    import decky  # type: ignore
    logger = decky.logger
except ImportError:
    import logging
    logger = logging.getLogger("quickaccela")


def _config_path() -> str:
    return get_slssteam_config_path()


# ==========================================
#  FAKE APP ID MANAGEMENT
# ==========================================

def add_fake_app_id(appid: int, fake_id: int = 480) -> dict:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            os.makedirs(os.path.dirname(config_path), exist_ok=True)
            tmp = config_path + ".tmp"
            with open(tmp, "w") as f:
                f.write("FakeAppIds:\n")
            os.replace(tmp, config_path)

        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        entry_line = f"  {appid}: {fake_id}\n"
        target = str(appid)
        for line in lines:
            stripped = line.strip()
            if stripped.startswith(f"{target}:") or stripped.startswith(f"'{target}':") or stripped.startswith(f'"{target}":'):
                return {"success": True, "message": "FakeAppId already configured"}

        new_lines = []
        inserted = False
        has_tag = False
        for line in lines:
            new_lines.append(line)
            if line.strip().lower().startswith("fakeappids:"):
                has_tag = True
                new_lines.append(entry_line)
                inserted = True

        if not has_tag:
            new_lines.append("\nFakeAppIds:\n")
            new_lines.append(entry_line)

        tmp = config_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        os.replace(tmp, config_path)
        return {"success": True, "message": f"FakeAppId ({appid} -> {fake_id}) added!"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def remove_fake_app_id(appid: int) -> dict:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return {"success": True, "message": "Config not found"}

        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        new_lines = []
        modified = False
        target = str(appid)
        for line in lines:
            stripped = line.strip()
            if (stripped.startswith(f"{target}:") or stripped.startswith(f"'{target}':") or stripped.startswith(f'"{target}":')):
                modified = True
                continue
            new_lines.append(line)

        if modified:
            tmp = config_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
            os.replace(tmp, config_path)

        return {"success": True, "message": "FakeAppId removed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def check_fake_app_id_status(appid: int) -> dict:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return {"success": True, "exists": False}
        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        target = str(appid)
        in_fakeappids = False
        for line in lines:
            stripped = line.strip()
            if stripped.lower().startswith("fakeappids:"):
                in_fakeappids = True
                continue
            if in_fakeappids:
                indent = len(line) - len(line.lstrip())
                if indent <= 0 and stripped and not stripped.startswith("#"):
                    in_fakeappids = False
                elif stripped.startswith(f"{target}:"):
                    return {"success": True, "exists": True}
        return {"success": True, "exists": False}
    except Exception:
        return {"success": True, "exists": False}


# ==========================================
#  ADDITIONAL APPS MANAGEMENT
# ==========================================

def add_to_additional_apps(appid: int) -> dict:
    """Add appid to AdditionalApps list in SLSsteam config.
    This is required for unowned games to appear in the Steam library."""
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return {"success": False, "error": "SLSsteam config not found"}

        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        entry = f"  - {appid}\n"
        # Check if already present
        for line in lines:
            stripped = line.strip()
            if stripped == f"- {appid}":
                return {"success": True, "message": "Already in AdditionalApps"}

        new_lines = []
        inserted = False
        for line in lines:
            new_lines.append(line)
            if line.strip().lower().startswith("additionalapps:"):
                new_lines.append(entry)
                inserted = True

        if not inserted:
            new_lines.append("\nAdditionalApps:\n")
            new_lines.append(entry)

        tmp = config_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        os.replace(tmp, config_path)
        return {"success": True, "message": f"AppID {appid} added to AdditionalApps"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ==========================================
#  GAME TOKEN MANAGEMENT
# ==========================================

def add_game_token(appid: int) -> dict:
    try:
        # Find appaccesstokens.json in backend dir
        json_path = backend_path("appaccesstokens.json")
        config_path = _config_path()

        if not os.path.exists(json_path):
            return {"success": False, "error": "appaccesstokens.json not found"}

        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        if not os.path.exists(config_path):
            tmp = config_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write("AppTokens:\n")
            os.replace(tmp, config_path)

        with open(json_path, "r", encoding="utf-8") as f:
            tokens_db = json.load(f)

        token = tokens_db.get(str(appid))
        if not token:
            return {"success": False, "error": f"Token not found for AppID {appid}"}

        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        entry = f"{appid}: {token}"
        for line in lines:
            if str(appid) in line and token in line:
                return {"success": True, "message": "Token already in config"}

        new_lines = []
        inserted = False
        has_tag = False
        for line in lines:
            new_lines.append(line)
            if line.strip().startswith("AppTokens:"):
                has_tag = True
                new_lines.append(f"  {entry}\n")
                inserted = True

        if not has_tag:
            new_lines.append("\nAppTokens:\n")
            new_lines.append(f"  {entry}\n")

        tmp = config_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        os.replace(tmp, config_path)
        return {"success": True, "message": "Token added!"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def remove_game_token(appid: int) -> dict:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return {"success": True, "message": "Config not found"}

        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        new_lines = []
        modified = False
        target = str(appid)
        in_tokens = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("AppTokens:"):
                in_tokens = True
                new_lines.append(line)
                continue
            if in_tokens:
                indent = len(line) - len(line.lstrip())
                if indent <= 0 and stripped and not stripped.startswith("#"):
                    in_tokens = False
                elif (stripped.startswith(f"{target}:") or
                      stripped.startswith(f"'{target}':") or
                      stripped.startswith(f'"{target}":')):
                    modified = True
                    continue
            new_lines.append(line)

        if modified:
            tmp = config_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
            os.replace(tmp, config_path)

        return {"success": True, "message": "Token removed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def check_game_token_status(appid: int) -> dict:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return {"success": True, "exists": False}

        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        in_tokens = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("AppTokens:"):
                in_tokens = True
                continue
            if in_tokens:
                indent = len(line) - len(line.lstrip())
                if indent <= 2 and stripped and not stripped.startswith("#"):
                    in_tokens = False
                elif stripped.startswith(f"{appid}:"):
                    return {"success": True, "exists": True}

        return {"success": True, "exists": False}
    except Exception:
        return {"success": True, "exists": False}


# ==========================================
#  DLC MANAGEMENT
# ==========================================

async def _fetch_dlc_list(appid: int) -> list:
    try:
        client = await ensure_http_client("DLC Fetcher")
        resp = await client.get(f"https://store.steampowered.com/api/appdetails?appids={appid}&filters=basic,dlc", timeout=10)
        data = resp.json()
        if not data or str(appid) not in data or not data[str(appid)]["success"]:
            return []
        dlc_ids = data[str(appid)]["data"].get("dlc", [])
        if not dlc_ids:
            return []

        dlc_info = []
        chunk_size = 10
        for i in range(0, len(dlc_ids), chunk_size):
            chunk = dlc_ids[i:i + chunk_size]
            ids_str = ",".join(map(str, chunk))
            try:
                resp = await client.get(f"https://store.steampowered.com/api/appdetails?appids={ids_str}&filters=basic", timeout=10)
                names_data = resp.json()
                for d_id in chunk:
                    name = f"DLC {d_id}"
                    d_str = str(d_id)
                    if names_data and d_str in names_data and names_data[d_str]["success"]:
                        name = names_data[d_str]["data"]["name"]
                    name = name.replace('"', "").replace("'", "")
                    dlc_info.append((d_id, name))
            except Exception:
                for d_id in chunk:
                    dlc_info.append((d_id, f"DLC {d_id}"))
        return dlc_info
    except Exception:
        return []


async def add_game_dlcs(appid: int) -> dict:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return {"success": False, "error": "Config not found. Install SLSsteam first."}

        dlcs = await _fetch_dlc_list(appid)
        if not dlcs:
            return {"success": False, "error": "No DLCs found for this game"}

        # Steam/SLSsteam handles up to 64 DLCs natively; only write to config if >64
        if len(dlcs) <= 64:
            return {"success": True, "message": f"{len(dlcs)} DLCs found — Steam handles ≤64 natively, no config needed", "count": len(dlcs), "skipped": True}

        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        # Check if already configured
        in_dlc = False
        for line in lines:
            if line.strip().startswith("DlcData:"):
                in_dlc = True
            if in_dlc and line.strip().startswith(f"{appid}:"):
                return {"success": True, "message": "DLCs already configured"}

        new_block = [f"  {appid}:\n"]
        for d_id, d_name in dlcs:
            new_block.append(f'    {d_id}: "{d_name}"\n')

        new_lines = []
        inserted = False
        has_tag = False
        for line in lines:
            new_lines.append(line)
            if line.strip().startswith("DlcData:"):
                has_tag = True
                new_lines.extend(new_block)
                inserted = True

        if not has_tag:
            new_lines.append("\nDlcData:\n")
            new_lines.extend(new_block)

        tmp = config_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        os.replace(tmp, config_path)

        return {"success": True, "message": f"{len(dlcs)} DLCs added!", "count": len(dlcs)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def remove_game_dlcs(appid: int) -> dict:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return {"success": True}

        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        new_lines = []
        in_target = False
        target = f"{appid}:"
        for line in lines:
            stripped = line.strip()
            if stripped.startswith(target):
                in_target = True
                continue
            if in_target:
                indent = len(line) - len(line.lstrip())
                if indent <= 2 and stripped:
                    in_target = False
                    new_lines.append(line)
                else:
                    continue
            else:
                new_lines.append(line)

        tmp = config_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        os.replace(tmp, config_path)
        return {"success": True, "message": "DLCs removed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def check_game_dlcs_status(appid: int) -> dict:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return {"success": True, "exists": False, "count": 0}
        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        # Find appid block under DlcData and count entries
        in_dlcdata = False
        in_app_block = False
        count = 0
        target = f"{appid}:"
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("DlcData:"):
                in_dlcdata = True
                continue
            if in_dlcdata:
                indent = len(line) - len(line.lstrip())
                if indent <= 0 and stripped and not stripped.startswith("#"):
                    in_dlcdata = False
                    continue
                if indent == 2 and stripped.startswith(target):
                    in_app_block = True
                    continue
                elif indent == 2 and stripped and in_app_block:
                    in_app_block = False
                elif in_app_block and indent >= 4 and stripped:
                    count += 1
        exists = count > 0
        return {"success": True, "exists": exists, "count": count}
    except Exception:
        return {"success": True, "exists": False, "count": 0}


# ==========================================
#  PlayNotOwnedGames
# ==========================================

def get_sls_play_status() -> dict:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return {"success": True, "enabled": False}
        with open(config_path, "r", encoding="utf-8") as f:
            content = f.read().lower()
        return {"success": True, "enabled": "playnotownedgames: yes" in content}
    except Exception as e:
        return {"success": False, "error": str(e)}


def set_sls_play_status(enabled: bool) -> dict:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return {"success": False, "error": "Config not found"}

        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        new_val = "yes" if enabled else "no"
        new_lines = []
        found = False
        for line in lines:
            if line.strip().lower().startswith("playnotownedgames:"):
                new_lines.append(f"PlayNotOwnedGames: {new_val}\n")
                found = True
            elif line.strip().lower().startswith("notifications:"):
                new_lines.append("Notifications: no\n")
            else:
                new_lines.append(line)

        if not found:
            new_lines.append(f"PlayNotOwnedGames: {new_val}\n")

        tmp = config_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        os.replace(tmp, config_path)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ==========================================
#  FULL UNINSTALL
# ==========================================

def _remove_from_additional_apps(appid: int) -> None:
    try:
        config_path = _config_path()
        if not os.path.exists(config_path):
            return
        with open(config_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        new_lines = []
        modified = False
        target = f"- {appid}"
        for line in lines:
            stripped = line.strip()
            if stripped.startswith(target):
                remainder = stripped[len(target):]
                if not remainder or remainder[0] in " \t#":
                    modified = True
                    continue
            new_lines.append(line)
        if modified:
            tmp = config_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
            os.replace(tmp, config_path)
    except Exception:
        pass


def uninstall_game_full(appid: int, remove_compatdata: bool = False) -> dict:
    """Full uninstall: game files, appmanifest, depotcache manifests, lua, and all SLSsteam config entries."""
    removed = []
    errors = []

    try:
        # 1. Find and remove game files + appmanifest
        path_info = get_game_install_path_response(appid)
        install_path = path_info.get("installPath") if isinstance(path_info, dict) else None
        library_path = path_info.get("libraryPath") if isinstance(path_info, dict) else None

        if install_path and os.path.exists(install_path):
            shutil.rmtree(install_path, ignore_errors=True)
            if not os.path.exists(install_path):
                removed.append("game_files")
                logger.info(f"QuickAccela: Removed game directory: {install_path}")
            else:
                errors.append("Failed to fully remove game directory")

            steamapps_dir = os.path.dirname(os.path.dirname(install_path))
            acf_file = os.path.join(steamapps_dir, f"appmanifest_{appid}.acf")
            if os.path.exists(acf_file):
                try:
                    os.remove(acf_file)
                    removed.append("appmanifest")
                except Exception as e:
                    errors.append(f"Failed to remove appmanifest: {e}")
        else:
            logger.info(f"QuickAccela: No game directory found for {appid}, skipping file removal")

        # 1b. Remove compatdata/proton prefix if requested
        if remove_compatdata:
            try:
                from steam_utils import detect_steam_install_path
                steam_path = detect_steam_install_path()
                if steam_path:
                    compatdata_path = os.path.join(steam_path, "steamapps", "compatdata", str(appid))
                    if os.path.exists(compatdata_path):
                        shutil.rmtree(compatdata_path, ignore_errors=True)
                        if not os.path.exists(compatdata_path):
                            removed.append("compatdata")
                            logger.info(f"QuickAccela: Removed compatdata: {compatdata_path}")
                        else:
                            errors.append("Failed to fully remove compatdata")
                    # Also check other library paths
                    if library_path and library_path != steam_path:
                        alt_compatdata = os.path.join(library_path, "steamapps", "compatdata", str(appid))
                        if os.path.exists(alt_compatdata):
                            shutil.rmtree(alt_compatdata, ignore_errors=True)
                            if not os.path.exists(alt_compatdata):
                                if "compatdata" not in removed:
                                    removed.append("compatdata")
            except Exception as e:
                logger.warning(f"QuickAccela: Compatdata cleanup error: {e}")

        # 2. Remove depotcache manifests for this game's depots
        try:
            from steam_utils import detect_steam_install_path
            from downloads import _parse_lua_depots
            steam_path = detect_steam_install_path()
            if steam_path:
                lua_path = os.path.join(steam_path, "config", "stplug-in", f"{appid}.lua")
                lua_path_disabled = lua_path + ".disabled"
                actual_lua = lua_path if os.path.exists(lua_path) else (lua_path_disabled if os.path.exists(lua_path_disabled) else None)
                if actual_lua:
                    depots = _parse_lua_depots(actual_lua)
                    depotcache_dir = os.path.join(steam_path, "depotcache")
                    for depot_info in depots:
                        manifest_file = os.path.join(depotcache_dir, f"{depot_info['depot']}_{depot_info['manifest']}.manifest")
                        if os.path.exists(manifest_file):
                            try:
                                os.remove(manifest_file)
                                logger.info(f"QuickAccela: Removed manifest: {manifest_file}")
                            except Exception:
                                pass
                    if depots:
                        removed.append("depot_manifests")
        except Exception as e:
            logger.warning(f"QuickAccela: Depotcache cleanup error: {e}")

        # 3. Remove lua script
        try:
            delete_luatools_for_app(appid)
            removed.append("lua_script")
        except Exception as e:
            errors.append(f"Failed to remove lua: {e}")

        # 4. Remove all SLSsteam config entries
        try:
            _remove_from_additional_apps(appid)
            removed.append("additional_apps")
        except Exception:
            pass
        try:
            remove_fake_app_id(appid)
            removed.append("fake_app_id")
        except Exception:
            pass
        try:
            remove_game_token(appid)
            removed.append("game_token")
        except Exception:
            pass
        try:
            remove_game_dlcs(appid)
            removed.append("game_dlcs")
        except Exception:
            pass

        logger.info(f"QuickAccela: Uninstall {appid} complete. Removed: {removed}")
        return {"success": True, "removed": removed, "errors": errors}
    except Exception as e:
        return {"success": False, "error": str(e)}
