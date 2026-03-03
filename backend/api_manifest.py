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
