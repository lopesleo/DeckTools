"""Dependency installer — check and install ACCELA, SLSsteam, .NET runtime."""

from __future__ import annotations

import asyncio
import os
import tempfile
from typing import Optional

from paths import find_accela_root, find_slssteam_root, check_slssteam_installed, check_accela_installed

try:
    import decky  # type: ignore
    logger = decky.logger
except ImportError:
    import logging
    logger = logging.getLogger("quickaccela")

INSTALL_STATE = {
    "status": "idle",
    "progress": "",
    "error": None,
}


def check_dependencies() -> dict:
    """Check if ACCELA, SLSsteam, and .NET runtime are available."""
    accela_installed = check_accela_installed()
    slssteam_installed = check_slssteam_installed()
    accela_root = find_accela_root()

    # Check for .NET runtime - try multiple locations since Decky runs as root
    dotnet_available = False
    dotnet_path = None
    import subprocess

    # Candidate dotnet binary paths (SteamOS / Decky runs as root, so ~ is /root/)
    dotnet_candidates = [
        "dotnet",  # system PATH
        "/home/deck/.dotnet/dotnet",
        "/home/deck/.local/share/dotnet/dotnet",
        os.path.expanduser("~/.dotnet/dotnet"),
    ]
    # Also check inside ACCELA directory
    if accela_root:
        dotnet_candidates.append(os.path.join(accela_root, "dotnet", "dotnet"))
        dotnet_candidates.append(os.path.join(accela_root, "dotnet"))

    for candidate in dotnet_candidates:
        try:
            result = subprocess.run(
                [candidate, "--list-runtimes"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                dotnet_available = True
                dotnet_path = candidate
                break
        except Exception:
            continue

    return {
        "success": True,
        "accela": accela_installed,
        "accelaPath": accela_root,
        "slssteam": slssteam_installed,
        "slssteamPath": find_slssteam_root(),
        "dotnet": dotnet_available,
        "dotnetPath": dotnet_path,
    }


async def install_dependencies() -> dict:
    """Run the enter-the-wired installer script."""
    global INSTALL_STATE
    INSTALL_STATE = {"status": "installing", "progress": "Starting installer...", "error": None}

    try:
        # The enter-the-wired script is the standard installer
        script_url = "https://raw.githubusercontent.com/Star123451/enter-the-wired/main/install.sh"

        # Download script to temp file first (safer than piping curl to bash)
        tmp_script = os.path.join(tempfile.gettempdir(), "decktools_install.sh")
        dl_process = await asyncio.create_subprocess_exec(
            "curl", "-fsSL", "-o", tmp_script, script_url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        await dl_process.wait()
        if dl_process.returncode != 0:
            INSTALL_STATE["status"] = "failed"
            INSTALL_STATE["error"] = "Failed to download installer script"
            return {"success": False}

        # Verify it looks like a shell script (not a binary or HTML error page)
        try:
            with open(tmp_script, "r", encoding="utf-8", errors="replace") as f:
                first_line = f.readline(256)
            if not first_line.startswith("#"):
                logger.warning(f"Installer script does not start with '#': {first_line[:80]}")
                INSTALL_STATE["status"] = "failed"
                INSTALL_STATE["error"] = "Downloaded file does not look like a shell script"
                try:
                    os.remove(tmp_script)
                except Exception:
                    pass
                return {"success": False}
        except Exception as read_exc:
            INSTALL_STATE["status"] = "failed"
            INSTALL_STATE["error"] = f"Cannot read installer script: {read_exc}"
            return {"success": False}

        # Execute the verified script
        os.chmod(tmp_script, 0o700)
        process = await asyncio.create_subprocess_exec(
            "bash", tmp_script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        async def _read_output():
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                INSTALL_STATE["progress"] = line.decode("utf-8", errors="replace").strip()

        asyncio.create_task(_read_output())
        await process.wait()

        if process.returncode == 0:
            INSTALL_STATE["status"] = "done"
            INSTALL_STATE["progress"] = "Installation complete!"
        else:
            INSTALL_STATE["status"] = "failed"
            INSTALL_STATE["error"] = f"Installer exited with code {process.returncode}"

        # Clean up temp script
        try:
            os.remove(tmp_script)
        except Exception:
            pass

    except Exception as exc:
        INSTALL_STATE["status"] = "failed"
        INSTALL_STATE["error"] = str(exc)

    return {"success": INSTALL_STATE["status"] == "done"}


def get_install_status() -> dict:
    return INSTALL_STATE.copy()
