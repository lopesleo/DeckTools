import { useEffect, useState, useCallback } from "react";
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
  startDownload,
} from "../api";
import { ROUTE_GAME_DETAIL, ROUTE_SETTINGS, ROUTE_DOWNLOADS } from "../routes";

export function GameList() {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addAppId, setAddAppId] = useState("");
  const [addStatus, setAddStatus] = useState("");

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

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  // Poll download status for active downloads
  useEffect(() => {
    const interval = setInterval(async () => {
      let updated = false;
      const newGames = [...games];
      for (let i = 0; i < newGames.length; i++) {
        const g = newGames[i];
        if (
          g.downloadStatus &&
          !["done", "failed", "cancelled"].includes(g.downloadStatus)
        ) {
          const status = await getDownloadStatus(g.appid);
          if (status.success && status.state) {
            newGames[i] = {
              ...g,
              downloadStatus: status.state.status,
              downloadProgress: status.state.bytesRead,
              downloadTotal: status.state.totalBytes,
            };
            updated = true;
          }
        }
      }
      if (updated) setGames(newGames);
    }, 2000);
    return () => clearInterval(interval);
  }, [games]);

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

      // Poll download status until done
      const pollInterval = setInterval(async () => {
        try {
          const status = await getDownloadStatus(id);
          if (!status.success || !status.state) return;
          const st = status.state;
          const phase = st.status || "unknown";

          if (phase === "downloading") {
            const total = st.totalBytes || 0;
            const read = st.bytesRead || 0;
            if (total > 0) {
              const pct = Math.round((read / total) * 100);
              setAddStatus(`Downloading... ${pct}%`);
            } else {
              const kb = Math.round(read / 1024);
              setAddStatus(`Downloading... ${kb} KB`);
            }
          } else if (phase === "checking") {
            setAddStatus(`Checking ${st.currentApi || "APIs"}...`);
          } else if (phase === "processing") {
            setAddStatus("Processing manifest...");
          } else if (phase === "configuring") {
            setAddStatus("Configuring SLSsteam...");
          } else if (phase === "depot_download") {
            const depotPct = st.depotPercent || 0;
            const depotProg = st.depotProgress || "Downloading game files...";
            if (depotPct > 0) {
              setAddStatus(`Downloading game: ${depotProg}`);
            } else {
              setAddStatus(`Downloading game: ${depotProg}`);
            }
          } else if (phase === "installing") {
            setAddStatus("Installing...");
          } else if (phase === "done") {
            clearInterval(pollInterval);
            setAddStatus("Done! Restarting Steam...");
            setTimeout(() => {
              loadGames();
              setAddStatus("");
            }, 6000);
          } else if (phase === "failed") {
            clearInterval(pollInterval);
            setAddStatus(st.error || "Download failed");
          } else {
            setAddStatus(`${phase}...`);
          }
        } catch {
          // ignore poll errors
        }
      }, 500);

      // Safety timeout: stop polling after 60 minutes (game downloads can be large)
      setTimeout(() => clearInterval(pollInterval), 3600000);
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
