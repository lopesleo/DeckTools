"""Management of the QuickAccela API manifest (free API list)."""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from config import (
    API_JSON_FILE,
    API_MANIFEST_PROXY_URL,
    API_MANIFEST_URL,
    HTTP_PROXY_TIMEOUT_SECONDS,
)
from http_client import ensure_http_client
from paths import backend_path
from utils import count_apis, normalize_manifest_text, read_text, write_text

try:
    import decky  # type: ignore
    logger = decky.logger
except ImportError:
    import logging
    logger = logging.getLogger("quickaccela")

_APIS_INIT_DONE = False
_INIT_APIS_LAST_MESSAGE = ""


async def init_apis() -> dict:
    """Initialise the free API manifest if it has not been loaded yet."""
    global _APIS_INIT_DONE, _INIT_APIS_LAST_MESSAGE
    logger.info("InitApis: invoked")
    if _APIS_INIT_DONE:
        return {"success": True, "message": _INIT_APIS_LAST_MESSAGE}

    client = await ensure_http_client("InitApis")
    api_json_path = backend_path(API_JSON_FILE)
    message = ""

    if os.path.exists(api_json_path):
        logger.info(f"InitApis: Local file exists -> {api_json_path}; skipping remote fetch")
    else:
        logger.info(f"InitApis: Local file not found -> {api_json_path}")
        manifest_text = ""
        try:
            try:
                resp = await client.get(API_MANIFEST_URL)
                resp.raise_for_status()
                manifest_text = resp.text
            except Exception as primary_err:
                logger.warning(f"InitApis: Primary URL failed ({primary_err}), trying proxy...")
                if API_MANIFEST_PROXY_URL:
                    try:
                        resp = await client.get(API_MANIFEST_PROXY_URL, timeout=HTTP_PROXY_TIMEOUT_SECONDS)
                        resp.raise_for_status()
                        manifest_text = resp.text
                    except Exception as proxy_err:
                        logger.warning(f"InitApis: Proxy also failed: {proxy_err}")
                        raise primary_err
                else:
                    raise
        except Exception as fetch_err:
            logger.warning(f"InitApis: Failed to fetch free API manifest: {fetch_err}")

        normalized = normalize_manifest_text(manifest_text) if manifest_text else ""
        if normalized:
            write_text(api_json_path, normalized)
            count = count_apis(normalized)
            message = f"Loaded {count} Free APIs"
        else:
            message = "Failed to load free APIs"

    _APIS_INIT_DONE = True
    _INIT_APIS_LAST_MESSAGE = message
    return {"success": True, "message": message}


def get_init_apis_message() -> dict:
    """Return and clear the last InitApis message."""
    global _INIT_APIS_LAST_MESSAGE
    msg = _INIT_APIS_LAST_MESSAGE or ""
    _INIT_APIS_LAST_MESSAGE = ""
    return {"success": True, "message": msg}


async def fetch_free_apis_now() -> dict:
    """Force refresh of the free API manifest."""
    client = await ensure_http_client("FetchFreeApisNow")
    try:
        manifest_text = ""
        try:
            resp = await client.get(API_MANIFEST_URL, follow_redirects=True)
            resp.raise_for_status()
            manifest_text = resp.text
        except Exception as primary_err:
            if API_MANIFEST_PROXY_URL:
                try:
                    resp = await client.get(API_MANIFEST_PROXY_URL, follow_redirects=True, timeout=HTTP_PROXY_TIMEOUT_SECONDS)
                    resp.raise_for_status()
                    manifest_text = resp.text
                except Exception as proxy_err:
                    return {"success": False, "error": f"Both URLs failed: {primary_err}, {proxy_err}"}
            else:
                return {"success": False, "error": str(primary_err)}

        normalized = normalize_manifest_text(manifest_text) if manifest_text else ""
        if not normalized:
            return {"success": False, "error": "Empty manifest"}

        write_text(backend_path(API_JSON_FILE), normalized)
        try:
            data = json.loads(normalized)
            count = len(data.get("api_list", []))
        except Exception:
            count = normalized.count('"name"')

        return {"success": True, "count": count}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def load_api_manifest() -> List[Dict[str, Any]]:
    """Return the list of enabled APIs from api.json."""
    path = backend_path(API_JSON_FILE)
    text = read_text(path)
    normalized = normalize_manifest_text(text)
    if normalized and normalized != text:
        try:
            write_text(path, normalized)
        except Exception:
            pass
        text = normalized

    try:
        data = json.loads(text or "{}")
        apis = data.get("api_list", [])
        return [api for api in apis if api.get("enabled", False)]
    except Exception as exc:
        logger.error(f"QuickAccela: Failed to parse api.json: {exc}")
        return []


def save_ryu_cookie(cookie_content: str) -> dict:
    """Save the Ryuu cookie to data/ryuu_cookie.txt."""
    try:
        from paths import data_path
        path = data_path("ryuu_cookie.txt")
        clean_cookie = cookie_content.strip()
        if clean_cookie and not clean_cookie.startswith("session="):
            clean_cookie = f"session={clean_cookie}"
        with open(path, "w", encoding="utf-8") as f:
            f.write(clean_cookie)
        return {"success": True, "message": "Cookie saved successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def load_ryu_cookie() -> str:
    """Read the Ryuu cookie from file."""
    try:
        from paths import data_path
        path = data_path("ryuu_cookie.txt")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read().strip()
    except Exception:
        pass
    return ""


def update_morrenus_key(key_content: str) -> dict:
    """Update the Morrenus API key in api.json."""
    try:
        path = backend_path(API_JSON_FILE)
        key_content = key_content.strip()
        if not key_content:
            return {"success": False, "error": "Key cannot be empty"}

        root_data = {"api_list": []}
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                try:
                    content = f.read()
                    if content.strip():
                        root_data = json.loads(content)
                except json.JSONDecodeError:
                    root_data = {"api_list": []}

        if "api_list" not in root_data:
            root_data["api_list"] = []

        api_list = root_data["api_list"]
        new_url = f"https://manifest.morrenus.xyz/api/v1/manifest/<appid>?api_key={key_content}"
        found = False

        for api in api_list:
            if "morrenus" in api.get("name", "").lower() or "morrenus.xyz" in api.get("url", ""):
                api["url"] = new_url
                api["enabled"] = True
                found = True
                break

        if not found:
            api_list.insert(0, {
                "name": "Morrenus (Official ACCELA)",
                "url": new_url,
                "success_code": 200,
                "unavailable_code": 404,
                "enabled": True,
            })

        with open(path, "w", encoding="utf-8") as f:
            json.dump(root_data, f, indent=4)

        return {"success": True, "message": "Morrenus key updated successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _get_morrenus_key() -> str:
    """Extract the Morrenus API key from api.json."""
    try:
        path = backend_path(API_JSON_FILE)
        if not os.path.exists(path):
            return ""
        with open(path, "r", encoding="utf-8") as f:
            data = json.loads(f.read())
        for api in data.get("api_list", []):
            url = api.get("url", "")
            if "morrenus.xyz" in url and "api_key=" in url:
                return url.split("api_key=")[-1].strip()
        return ""
    except Exception:
        return ""


def load_morrenus_key() -> str:
    """Return the current Morrenus API key."""
    return _get_morrenus_key()


async def search_morrenus(query: str) -> dict:
    """Search for games by name using the Morrenus API."""
    try:
        key = _get_morrenus_key()
        if not key:
            return {"success": False, "error": "Morrenus API key not configured. Set it in Settings."}

        if len(query.strip()) < 2:
            return {"success": False, "error": "Search query must be at least 2 characters"}

        client = await ensure_http_client("MorrenusSearch")
        resp = await client.get(
            "https://manifest.morrenus.xyz/api/v1/search",
            params={"q": query.strip(), "limit": 50},
            headers={"Authorization": f"Bearer {key}"},
            timeout=15,
        )

        if resp.status_code == 401:
            return {"success": False, "error": "Invalid API key. Check Settings."}
        elif resp.status_code == 429:
            return {"success": False, "error": "Daily API limit exceeded. Try again later."}
        elif resp.status_code != 200:
            try:
                detail = resp.json().get("detail", resp.text)
            except Exception:
                detail = resp.text
            return {"success": False, "error": f"API error ({resp.status_code}): {detail}"}

        data = resp.json()
        results = data.get("results", [])

        # Filter out non-game results (soundtracks, demos, tools, etc.)
        import re
        blacklist = [
            "soundtrack", "ost", "original soundtrack", "artbook",
            "graphic novel", "demo", "server", "dedicated server",
            "tool", "sdk", "3d print model",
        ]
        filtered = []
        for game in results:
            name = game.get("game_name", "")
            name_lower = name.lower()
            is_blacklisted = any(re.search(r'\b' + kw + r'\b', name_lower) for kw in blacklist)
            if not is_blacklisted:
                filtered.append({
                    "appid": game.get("game_id"),
                    "name": game.get("game_name", f"Unknown ({game.get('game_id', '?')})"),
                })

        return {"success": True, "results": filtered, "total": len(results), "filtered": len(filtered)}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def check_game_update(appid: int) -> dict:
    """Check if a game has an update available by comparing local manifest IDs with Morrenus."""
    import re
    import tempfile
    import zipfile

    try:
        appid = int(appid)
    except Exception:
        return {"success": False, "error": "Invalid appid"}

    try:
        # 1. Read local manifest IDs from installed lua
        from steam_utils import detect_steam_install_path
        from downloads import _parse_lua_depots
        steam_path = detect_steam_install_path()
        if not steam_path:
            return {"success": False, "error": "Steam not found"}

        lua_path = os.path.join(steam_path, "config", "stplug-in", f"{appid}.lua")
        if not os.path.exists(lua_path):
            lua_path = lua_path + ".disabled"
        if not os.path.exists(lua_path):
            return {"success": False, "error": "Game not installed (no lua file)"}

        local_depots = _parse_lua_depots(lua_path)
        if not local_depots:
            return {"success": False, "error": "Could not parse local depot info"}

        local_manifests = {str(d["depot"]): d["manifest"] for d in local_depots if "manifest" in d}
        if not local_manifests:
            return {"success": False, "error": "No manifest IDs found in lua file"}

        # 2. Download latest manifest ZIP from Morrenus
        key = _get_morrenus_key()
        if not key:
            return {"success": False, "error": "Morrenus API key not configured"}

        client = await ensure_http_client("UpdateCheck")
        resp = await client.get(
            f"https://manifest.morrenus.xyz/api/v1/manifest/{appid}",
            headers={"Authorization": f"Bearer {key}"},
            timeout=30,
        )

        if resp.status_code == 404:
            return {"success": False, "error": "Game not found on Morrenus"}
        elif resp.status_code == 429:
            return {"success": False, "error": "Daily API limit exceeded"}
        elif resp.status_code != 200:
            return {"success": False, "error": f"Morrenus API error ({resp.status_code})"}

        # 3. Extract lua from ZIP and parse manifest IDs
        zip_data = resp.content
        remote_manifests = {}
        try:
            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
                tmp.write(zip_data)
                tmp_path = tmp.name

            with zipfile.ZipFile(tmp_path, "r") as zf:
                for name in zf.namelist():
                    if name.endswith(".lua"):
                        lua_content = zf.read(name).decode("utf-8", errors="ignore")
                        for m in re.finditer(r'setManifestid\(\s*(\d+)\s*,\s*"(\d+)"', lua_content):
                            remote_manifests[m.group(1)] = m.group(2)
                        break

            os.unlink(tmp_path)
        except Exception as e:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
            return {"success": False, "error": f"Failed to parse remote manifest: {e}"}

        if not remote_manifests:
            return {"success": False, "error": "Could not extract manifest IDs from Morrenus"}

        # 4. Compare
        update_available = False
        changes = []
        for depot_id, local_mid in local_manifests.items():
            remote_mid = remote_manifests.get(depot_id)
            if remote_mid and remote_mid != local_mid:
                update_available = True
                changes.append({"depot": depot_id, "local": local_mid, "remote": remote_mid})

        # Check for new depots
        for depot_id in remote_manifests:
            if depot_id not in local_manifests:
                update_available = True
                changes.append({"depot": depot_id, "local": None, "remote": remote_manifests[depot_id]})

        return {
            "success": True,
            "updateAvailable": update_available,
            "localDepots": len(local_manifests),
            "remoteDepots": len(remote_manifests),
            "changes": changes,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
