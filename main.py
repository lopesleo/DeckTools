"""QuickAccela — Decky Loader Plugin entry point.

Exposes all backend functions as async methods callable from the frontend
via serverAPI.callPluginMethod().

IMPORTANT: Every method must return a JSON **string** (via json.dumps),
because the frontend api.ts parseResult() calls JSON.parse(raw).
"""

import sys
import os
import json

# Add backend/ to module search path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.realpath(__file__)), "backend"))

try:
    import decky  # type: ignore
    logger = decky.logger
except ImportError:
    import logging
    logger = logging.getLogger("quickaccela")


def _j(obj) -> str:
    """Ensure we always return a JSON string to the frontend."""
    if isinstance(obj, str):
        # Already serialized — pass through only if it's valid JSON
        try:
            json.loads(obj)
            return obj
        except (json.JSONDecodeError, TypeError):
            pass
    return json.dumps(obj)


class Plugin:
    # ==========================================================================
    # Lifecycle
    # ==========================================================================

    async def _main(self):
        logger.info("QuickAccela: Plugin loaded")
        try:
            from api_manifest import init_apis
            from downloads import init_applist, init_games_db
            from paths import get_platform_summary

            summary = get_platform_summary()
            logger.info(f"QuickAccela: Platform summary: {json.dumps(summary)}")

            await init_apis()
            await init_applist()
            await init_games_db()
        except Exception as exc:
            logger.error(f"QuickAccela: _main init error: {exc}")

    async def _unload(self):
        logger.info("QuickAccela: Plugin unloading")
        try:
            from http_client import close_http_client
            from downloads import DOWNLOAD_TASKS
            # Cancel active downloads
            for task in DOWNLOAD_TASKS.values():
                if not task.done():
                    task.cancel()
            await close_http_client("unload")
        except Exception as exc:
            logger.error(f"QuickAccela: _unload error: {exc}")

    # ==========================================================================
    # Platform & Paths
    # ==========================================================================

    async def get_platform_summary(self) -> str:
        from paths import get_platform_summary
        return _j(get_platform_summary())

    async def verify_slssteam_injected(self) -> str:
        from paths import verify_slssteam_injected
        return _j(verify_slssteam_injected())

    # ==========================================================================
    # API Manifest
    # ==========================================================================

    async def init_apis(self) -> str:
        from api_manifest import init_apis
        return _j(await init_apis())

    async def fetch_free_apis_now(self) -> str:
        from api_manifest import fetch_free_apis_now
        return _j(await fetch_free_apis_now())

    async def get_init_apis_message(self) -> str:
        from api_manifest import get_init_apis_message
        return _j(get_init_apis_message())

    async def save_ryu_cookie(self, cookie_content: str) -> str:
        from api_manifest import save_ryu_cookie
        return _j(save_ryu_cookie(cookie_content))

    async def load_ryu_cookie(self) -> str:
        from api_manifest import load_ryu_cookie
        cookie = load_ryu_cookie()
        return _j({"success": True, "cookie": cookie})

    async def update_morrenus_key(self, key_content: str) -> str:
        from api_manifest import update_morrenus_key
        return _j(update_morrenus_key(key_content))

    # ==========================================================================
    # Downloads
    # ==========================================================================

    async def start_download(self, appid: int) -> str:
        logger.info(f"QuickAccela: start_download called, appid={appid}")
        try:
            from downloads import start_download
            result = await start_download(appid)
            logger.info(f"QuickAccela: start_download result={result}")
            return _j(result)
        except Exception as exc:
            logger.error(f"QuickAccela: start_download error: {exc}")
            return _j({"success": False, "error": str(exc)})

    async def get_download_status(self, appid: int) -> str:
        from downloads import get_download_status
        return _j(get_download_status(appid))

    async def get_active_downloads(self) -> str:
        from downloads import get_active_downloads
        return _j(get_active_downloads())

    async def cancel_download(self, appid: int) -> str:
        from downloads import cancel_download
        return _j(cancel_download(appid))

    async def has_luatools_for_app(self, appid: int) -> str:
        from downloads import has_luatools_for_app
        return _j(has_luatools_for_app(appid))

    async def delete_luatools_for_app(self, appid: int) -> str:
        from downloads import delete_luatools_for_app
        return _j(delete_luatools_for_app(appid))

    async def get_installed_lua_scripts(self) -> str:
        from downloads import get_installed_lua_scripts
        return _j(get_installed_lua_scripts())

    async def read_loaded_apps(self) -> str:
        from downloads import read_loaded_apps
        return _j(read_loaded_apps())

    async def dismiss_loaded_apps(self) -> str:
        from downloads import dismiss_loaded_apps
        return _j(dismiss_loaded_apps())

    async def fetch_app_name(self, appid: int) -> str:
        from downloads import fetch_app_name
        name = await fetch_app_name(appid)
        return _j({"success": True, "name": name})

    async def get_games_database(self) -> str:
        from downloads import get_games_database
        return _j(get_games_database())

    async def save_launcher_path_config(self, path: str) -> str:
        from downloads import save_launcher_path_config
        return _j(save_launcher_path_config(path))

    async def load_launcher_path(self) -> str:
        from downloads import load_launcher_path
        return _j({"success": True, "path": load_launcher_path()})

    # ==========================================================================
    # Steam Utils
    # ==========================================================================

    async def get_game_install_path(self, appid: int) -> str:
        from steam_utils import get_game_install_path_response
        return _j(get_game_install_path_response(appid))

    async def get_installed_games(self) -> str:
        from steam_utils import get_installed_games
        return _j({"success": True, "games": get_installed_games()})

    # ==========================================================================
    # SLSsteam Config (read/write)
    # ==========================================================================

    async def read_sls_config(self) -> str:
        from slssteam_config import read_config
        return _j({"success": True, "config": read_config()})

    async def get_sls_value(self, key: str) -> str:
        from slssteam_config import get_value
        return _j({"success": True, "value": get_value(key)})

    async def set_sls_value(self, key: str, value) -> str:
        from slssteam_config import set_value
        set_value(key, value)
        return _j({"success": True})

    # ==========================================================================
    # SLSsteam Operations (FakeAppId, Token, DLC, Play, Uninstall)
    # ==========================================================================

    async def add_fake_app_id(self, appid: int) -> str:
        from slssteam_ops import add_fake_app_id
        return _j(add_fake_app_id(appid))

    async def remove_fake_app_id(self, appid: int) -> str:
        from slssteam_ops import remove_fake_app_id
        return _j(remove_fake_app_id(appid))

    async def check_fake_app_id_status(self, appid: int) -> str:
        from slssteam_ops import check_fake_app_id_status
        return _j(check_fake_app_id_status(appid))

    async def add_game_token(self, appid: int) -> str:
        from slssteam_ops import add_game_token
        return _j(add_game_token(appid))

    async def remove_game_token(self, appid: int) -> str:
        from slssteam_ops import remove_game_token
        return _j(remove_game_token(appid))

    async def check_game_token_status(self, appid: int) -> str:
        from slssteam_ops import check_game_token_status
        return _j(check_game_token_status(appid))

    async def add_game_dlcs(self, appid: int) -> str:
        from slssteam_ops import add_game_dlcs
        return _j(await add_game_dlcs(appid))

    async def remove_game_dlcs(self, appid: int) -> str:
        from slssteam_ops import remove_game_dlcs
        return _j(remove_game_dlcs(appid))

    async def check_game_dlcs_status(self, appid: int) -> str:
        from slssteam_ops import check_game_dlcs_status
        return _j(check_game_dlcs_status(appid))

    async def get_sls_play_status(self) -> str:
        from slssteam_ops import get_sls_play_status
        return _j(get_sls_play_status())

    async def set_sls_play_status(self, enabled: bool) -> str:
        from slssteam_ops import set_sls_play_status
        return _j(set_sls_play_status(enabled))

    async def uninstall_game_full(self, appid: int) -> str:
        from slssteam_ops import uninstall_game_full
        return _j(uninstall_game_full(appid))

    # ==========================================================================
    # Fixes
    # ==========================================================================

    async def check_for_fixes(self, appid: int) -> str:
        from fixes import check_for_fixes
        return _j(await check_for_fixes(appid))

    async def apply_game_fix(self, appid: int, download_url: str, install_path: str, fix_type: str = "", game_name: str = "") -> str:
        from fixes import apply_game_fix
        return _j(await apply_game_fix(appid, download_url, install_path, fix_type, game_name))

    async def get_apply_fix_status(self, appid: int) -> str:
        from fixes import get_apply_fix_status
        return _j(get_apply_fix_status(appid))

    async def cancel_apply_fix(self, appid: int) -> str:
        from fixes import cancel_apply_fix
        return _j(cancel_apply_fix(appid))

    async def unfix_game(self, appid: int, install_path: str = "", fix_date: str = "") -> str:
        from fixes import unfix_game
        return _j(await unfix_game(appid, install_path, fix_date))

    async def get_unfix_status(self, appid: int) -> str:
        from fixes import get_unfix_status
        return _j(get_unfix_status(appid))

    async def get_installed_fixes(self) -> str:
        from fixes import get_installed_fixes
        return _j(get_installed_fixes())

    async def apply_linux_native_fix(self, install_path: str) -> str:
        from fixes import apply_linux_native_fix
        return _j(apply_linux_native_fix(install_path))

    # ==========================================================================
    # Workshop
    # ==========================================================================

    async def start_workshop_download(self, appid: int, pubfile_id: int) -> str:
        from workshop import start_workshop_download
        return _j(await start_workshop_download(appid, pubfile_id))

    async def get_workshop_download_status(self) -> str:
        from workshop import get_workshop_download_status
        return _j(get_workshop_download_status())

    async def cancel_workshop_download(self) -> str:
        from workshop import cancel_workshop_download
        return _j(await cancel_workshop_download())

    async def save_workshop_tool_path(self, path: str) -> str:
        from workshop import save_workshop_tool_path
        return _j(save_workshop_tool_path(path))

    # ==========================================================================
    # Repair / Maintenance
    # ==========================================================================

    async def repair_appmanifest(self, appid: int) -> str:
        from downloads import repair_appmanifest
        return _j(await repair_appmanifest(appid))

    # ==========================================================================
    # Store AppID Detection
    # ==========================================================================

    async def detect_store_appid(self) -> str:
        """Query CEF debug endpoint to detect AppID from open Steam Store or library pages."""
        import re
        try:
            from http_client import get_http_client
            client = await get_http_client()
            resp = await client.get("http://localhost:8080/json", timeout=3)
            if resp.status_code == 200:
                pages = resp.json()
                # Prioritize store pages, then library pages
                patterns = [
                    (r"store\.steampowered\.com/app/(\d+)", "store"),
                    (r"steamloopback\.host/routes/library/app/(\d+)", "library"),
                    (r"/library/app/(\d+)", "library"),
                ]
                for pattern, source in patterns:
                    for page in pages:
                        url = page.get("url", "")
                        m = re.search(pattern, url)
                        if m:
                            appid = int(m.group(1))
                            title = page.get("title", "")
                            return _j({"success": True, "appid": appid, "title": title, "source": source})
            return _j({"success": False, "error": "No store page found"})
        except Exception as exc:
            logger.debug(f"QuickAccela: detect_store_appid error: {exc}")
            return _j({"success": False, "error": str(exc)})

    # ==========================================================================
    # Installer (Dependencies)
    # ==========================================================================

    async def check_dependencies(self) -> str:
        from installer import check_dependencies
        return _j(check_dependencies())

    async def install_dependencies(self) -> str:
        from installer import install_dependencies
        return _j(await install_dependencies())

    async def get_install_status(self) -> str:
        from installer import get_install_status
        return _j(get_install_status())
