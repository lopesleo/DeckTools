import { useEffect, useState, useCallback, useRef } from "react";
import {
  PanelSection,
  PanelSectionRow,
  TextField,
  ButtonItem,
  Navigation,
} from "@decky/ui";
import { GameCard, GameInfo } from "../components/GameCard";
import {
  getInstalledLuaScripts,
  getDownloadStatus,
  getActiveDownloads,
  startDownload,
  detectStoreAppid,
} from "../api";
import { ROUTE_GAME_DETAIL, ROUTE_SETTINGS, ROUTE_DOWNLOADS } from "../routes";

export function GameList() {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addAppId, setAddAppId] = useState("");
  const [addStatus, setAddStatus] = useState("");
  const [activeDownloadId, setActiveDownloadId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadGames = useCallback(async () => {
    try {
      // Only show games added via ACCELA (with lua scripts)
      const luaResult = await getInstalledLuaScripts();
      const gameList: GameInfo[] = [];

      if (luaResult.success && luaResult.scripts) {
        for (const s of luaResult.scripts) {
          gameList.push({
            appid: s.appid,
            name: s.gameName || `Unknown (${s.appid})`,
            hasLua: true,
            isDisabled: s.isDisabled,
          });
        }
      }

      gameList.sort((a, b) => a.name.localeCompare(b.name));

      setGames(gameList);
    } catch (err) {
      console.error("GameList: load error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Format download status from backend state
  const formatStatus = useCallback((st: any): string => {
    const phase = st.status || "unknown";
    if (phase === "downloading") {
      const total = st.totalBytes || 0;
      const read = st.bytesRead || 0;
      if (total > 0) {
        const pct = Math.round((read / total) * 100);
        return `Downloading... ${pct}%`;
      }
      const kb = Math.round(read / 1024);
      return `Downloading... ${kb} KB`;
    } else if (phase === "checking") {
      return `Checking ${st.currentApi || "APIs"}...`;
    } else if (phase === "processing") {
      return "Processing manifest...";
    } else if (phase === "configuring") {
      return "Configuring SLSsteam...";
    } else if (phase === "depot_download") {
      return `Downloading game: ${st.depotProgress || "Downloading game files..."}`;
    } else if (phase === "installing") {
      return "Installing...";
    } else if (phase === "queued") {
      return "Starting download...";
    }
    return `${phase}...`;
  }, []);

  // Start polling for a given appid
  const startPolling = useCallback((id: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setActiveDownloadId(id);

    pollRef.current = setInterval(async () => {
      try {
        const status = await getDownloadStatus(id);
        if (!status.success || !status.state) return;
        const st = status.state;
        const phase = st.status || "unknown";

        if (phase === "done") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setAddStatus("Done! Restart Steam to see the game.");
          setActiveDownloadId(null);
          setTimeout(() => {
            loadGames();
            setAddStatus("");
          }, 6000);
        } else if (phase === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setAddStatus(st.error || "Download failed");
          setActiveDownloadId(null);
        } else if (phase === "cancelled") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setAddStatus("Download cancelled");
          setActiveDownloadId(null);
        } else {
          setAddStatus(formatStatus(st));
        }
      } catch {
        // ignore poll errors
      }
    }, 500);

    // Safety timeout: stop polling after 60 minutes
    setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    }, 3600000);
  }, [formatStatus, loadGames]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // On mount: check for active downloads and resume polling + auto-detect appid
  useEffect(() => {
    loadGames();

    // Auto-detect AppID: prioritize Steam Store page (CEF), fallback to library route
    const detectAppId = async () => {
      // 1. Check CEF pages for store or library URLs (backend query)
      try {
        const result = await detectStoreAppid();
        if (result.success && result.appid) {
          setAddAppId(String(result.appid));
          return;
        }
      } catch {
        // ignore
      }
      // 2. Fallback: check window.location for library route
      try {
        const path = window.location.pathname || "";
        const match = path.match(/\/library\/app\/(\d+)/);
        if (match) {
          setAddAppId(match[1]);
        }
      } catch {
        // ignore
      }
    };
    detectAppId();

    // Re-detect when panel becomes visible (QAM reopen)
    const onVisibility = () => {
      if (document.visibilityState === "visible") detectAppId();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Also poll to catch QAM reopens that don't trigger visibilitychange
    const redetectInterval = setInterval(detectAppId, 10000);
    const cleanup1 = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(redetectInterval);
    };

    // Resume active downloads
    (async () => {
      try {
        const result = await getActiveDownloads();
        if (result.success && result.downloads) {
          const ids = Object.keys(result.downloads);
          if (ids.length > 0) {
            const id = parseInt(ids[0], 10);
            const st = result.downloads[ids[0]];
            setAddStatus(formatStatus(st));
            startPolling(id);
          }
        }
      } catch {
        // ignore
      }
    })();

    return () => cleanup1();
  }, [loadGames, formatStatus, startPolling]);

  const handleAddGame = async () => {
    const id = parseInt(addAppId.trim(), 10);
    if (!id || id <= 0) {
      setAddStatus("Invalid AppID");
      return;
    }
    setAddStatus("Starting download...");
    try {
      const result = await startDownload(id);
      if (!result.success) {
        setAddStatus(result.error || "Download failed");
        return;
      }
      setAddAppId("");
      startPolling(id);
    } catch (err: any) {
      setAddStatus("Error: " + (err?.message || String(err)));
    }
  };

  const filtered = search
    ? games.filter(
        (g: GameInfo) =>
          g.name.toLowerCase().includes(search.toLowerCase()) ||
          String(g.appid).includes(search),
      )
    : games;

  const navigateToDetail = (appid: number) => {
    Navigation.Navigate(ROUTE_GAME_DETAIL + "/" + appid);
  };

  return (
    <>
      <PanelSection title="Add Game">
        <PanelSectionRow>
          <TextField
            label="Steam AppID"
            value={addAppId}
            onChange={(e: any) => setAddAppId(e?.target?.value ?? "")}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={handleAddGame}>
            Download Manifest
          </ButtonItem>
        </PanelSectionRow>
        {addStatus && (
          <PanelSectionRow>
            <div
              style={{
                textAlign: "center",
                padding: "6px",
                color: addStatus.startsWith("Error") || addStatus === "Invalid AppID" || addStatus === "Download failed"
                  ? "#ff6b6b"
                  : "#8bca68",
                fontSize: "12px",
              }}
            >
              {addStatus}
            </div>
          </PanelSectionRow>
        )}
      </PanelSection>

      <PanelSection title="My Games">
        <PanelSectionRow>
          <TextField
            label="Search"
            value={search}
            onChange={(e: any) => setSearch(e?.target?.value ?? "")}
          />
        </PanelSectionRow>

        {loading ? (
          <PanelSectionRow>
            <div
              style={{ textAlign: "center", padding: "20px", color: "#8b929a" }}
            >
              Loading games...
            </div>
          </PanelSectionRow>
        ) : filtered.length === 0 ? (
          <PanelSectionRow>
            <div
              style={{ textAlign: "center", padding: "20px", color: "#8b929a" }}
            >
              {search ? "No games match your search" : "No ACCELA games yet"}
            </div>
          </PanelSectionRow>
        ) : (
          filtered.map((game: GameInfo) => (
            <GameCard key={game.appid} game={game} onClick={navigateToDetail} />
          ))
        )}
      </PanelSection>

      <PanelSection>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => Navigation.Navigate(ROUTE_DOWNLOADS)}
          >
            Active Downloads
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => Navigation.Navigate(ROUTE_SETTINGS)}
          >
            Settings
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => loadGames()}>
            Refresh
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}
