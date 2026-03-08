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
  searchMorrenus,
  checkSlscheevoInstalled,
  checkAllAchievementsStatus,
  generateAllAchievements,
  getSyncAllStatus,
} from "../api";
import { ROUTE_GAME_DETAIL, ROUTE_SETTINGS, ROUTE_DOWNLOADS } from "../routes";
import { useT } from "../i18n";
import { toaster } from "@decky/api";

interface SearchResult {
  appid: number;
  name: string;
}

export function GameList() {
  const t = useT();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addAppId, setAddAppId] = useState("");
  const [addStatus, setAddStatus] = useState("");
  const [activeDownloadId, setActiveDownloadId] = useState<number | null>(null);
  const [activeDownloadPhase, setActiveDownloadPhase] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sortMode, setSortMode] = useState<"name" | "appid" | "recent">("name");

  // Morrenus search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showMoreResults, setShowMoreResults] = useState(false);
  const [slscheevoReady, setSlscheevoReady] = useState(false);
  const [syncState, setSyncState] = useState<any>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadGames = useCallback(async () => {
    try {
      const luaResult = await getInstalledLuaScripts();
      const gameList: GameInfo[] = [];

      if (luaResult.success && luaResult.scripts) {
        for (const s of luaResult.scripts) {
          gameList.push({
            appid: s.appid,
            name: s.gameName || `Unknown (${s.appid})`,
            hasLua: true,
            isDisabled: s.isDisabled,
            hasGameFiles: s.hasGameFiles,
          });
        }
      }

      // Check achievement status for all games
      const appids = gameList.map((g) => g.appid);
      if (appids.length > 0) {
        try {
          const achResult = await checkAllAchievementsStatus(appids);
          if (achResult.success && achResult.map) {
            for (const g of gameList) {
              g.hasAchievements = !!achResult.map[g.appid];
            }
          }
        } catch { }
      }

      gameList.sort((a, b) => a.name.localeCompare(b.name));
      setGames(gameList);
    } catch (err) {
      console.error("GameList: load error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const formatStatus = useCallback(
    (st: any): string => {
      const phase = st.status || "unknown";
      if (phase === "downloading") {
        const total = st.totalBytes || 0;
        const read = st.bytesRead || 0;
        if (total > 0) {
          const pct = Math.round((read / total) * 100);
          return `${t("statusDownloading")} ${pct}%`;
        }
        const kb = Math.round(read / 1024);
        return `${t("statusDownloading")} ${kb} KB`;
      } else if (phase === "checking") {
        return `${t("statusChecking")} ${st.currentApi || "APIs"}...`;
      } else if (phase === "processing") {
        return t("statusProcessing");
      } else if (phase === "configuring") {
        return t("statusConfiguring");
      } else if (phase === "depot_download") {
        return `${t("statusDownloadingGame")}: ${st.depotProgress || t("statusDownloadingGameFiles")}`;
      } else if (phase === "installing") {
        return t("statusInstalling");
      } else if (phase === "queued") {
        return t("statusQueued");
      }
      return `${phase}...`;
    },
    [t],
  );

  const startPolling = useCallback(
    (id: number) => {
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
            setAddStatus(t("doneRestartSteam"));
            setActiveDownloadId(null);
            setActiveDownloadPhase("");
            loadGames();
            setTimeout(() => setAddStatus(""), 6000);
          } else if (phase === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setAddStatus(st.error || t("downloadFailed"));
            setActiveDownloadId(null);
            setActiveDownloadPhase("");
          } else if (phase === "cancelled") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setAddStatus(t("downloadCancelled"));
            setActiveDownloadId(null);
            setActiveDownloadPhase("");
          } else {
            setAddStatus(formatStatus(st));
            setActiveDownloadPhase(phase);
          }
        } catch {
          // ignore poll errors
        }
      }, 500);

      setTimeout(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }, 3600000);
    },
    [formatStatus, loadGames, t],
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (syncPollRef.current) clearInterval(syncPollRef.current);
    };
  }, []);

  useEffect(() => {
    loadGames();

    // Check SLScheevo availability
    (async () => {
      try {
        const result = await checkSlscheevoInstalled();
        if (result.success && result.installed) {
          setSlscheevoReady(true);
        }
      } catch { }
    })();

    const detectAppId = async () => {
      try {
        const result = await detectStoreAppid();
        if (result.success && result.appid) {
          setAddAppId(String(result.appid));
          return;
        }
      } catch { }
      try {
        const path = window.location.pathname || "";
        const match = path.match(/\/library\/app\/(\d+)/);
        if (match) {
          setAddAppId(match[1]);
        }
      } catch { }
    };
    detectAppId();

    const onVisibility = () => {
      if (document.visibilityState === "visible") detectAppId();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const cleanup1 = () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };

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
      } catch { }
    })();

    return () => cleanup1();
  }, [loadGames, formatStatus, startPolling]);

  const handleAddGame = async () => {
    const id = parseInt(addAppId.trim(), 10);
    if (!id || id <= 0) {
      setAddStatus(t("invalidAppId"));
      return;
    }
    setAddStatus(t("startingDownload"));
    try {
      const result = await startDownload(id);
      if (!result.success) {
        setAddStatus(result.error || t("downloadFailed"));
        return;
      }
      setAddAppId("");
      startPolling(id);
    } catch (err: any) {
      setAddStatus(`${t("error")}: ${err?.message || String(err)}`);
    }
  };

  const handleSearchMorrenus = async () => {
    if (searchQuery.trim().length < 2) {
      setSearchError(t("enterAtLeast2Chars"));
      return;
    }
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    setShowMoreResults(false);
    try {
      const result = await searchMorrenus(searchQuery.trim());
      if (result.success) {
        setSearchResults(result.results || []);
        if ((result.results || []).length === 0) {
          setSearchError(t("noGamesFound"));
        }
      } else {
        setSearchError(result.error || t("searchFailed"));
      }
    } catch (err: any) {
      setSearchError(`${t("error")}: ${err?.message || String(err)}`);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSearchResult = (result: SearchResult) => {
    setAddAppId(String(result.appid));
    setSearchResults([]);
    setSearchQuery("");
    setAddStatus(`${t("selected")}: ${result.name} (${result.appid})`);
  };

  const toast = (title: string, body?: string, duration = 3000) =>
    toaster.toast({ title, body: body || "", duration });

  const handleSyncAllAchievements = async () => {
    const appids = games.filter((g) => g.hasLua && g.hasGameFiles).map((g) => g.appid);
    if (appids.length === 0) return;

    const result = await generateAllAchievements(appids);
    if (!result.success) {
      toast(t("toastSyncFailed"), result.error || "");
      return;
    }

    setSyncState({ status: "running", done: 0, total: appids.length });

    syncPollRef.current = setInterval(async () => {
      try {
        const status = await getSyncAllStatus();
        if (status.success && status.state) {
          setSyncState(status.state);
          if (status.state.status === "done") {
            if (syncPollRef.current) clearInterval(syncPollRef.current);
            syncPollRef.current = null;
            toast(t("toastSyncComplete"));
            loadGames();
            setTimeout(() => setSyncState(null), 3000);
          }
        }
      } catch { }
    }, 2000);
  };

  const sortLabels: Record<string, string> = {
    name: "A-Z",
    appid: "AppID",
    recent: "Recent",
  };

  const cycleSortMode = () => {
    setSortMode((prev) => {
      if (prev === "name") return "appid";
      if (prev === "appid") return "recent";
      return "name";
    });
  };

  const filtered = (
    search
      ? games.filter(
        (g: GameInfo) =>
          g.name.toLowerCase().includes(search.toLowerCase()) ||
          String(g.appid).includes(search),
      )
      : games
  )
    .slice()
    .sort((a, b) => {
      if (sortMode === "appid") return a.appid - b.appid;
      if (sortMode === "recent") return b.appid - a.appid;
      return a.name.localeCompare(b.name);
    });

  const navigateToDetail = (appid: number) => {
    Navigation.Navigate(ROUTE_GAME_DETAIL + "/" + appid);
  };

  return (
    <>
      <PanelSection title={t("addGame")}>
        <PanelSectionRow>
          <TextField
            label={t("steamAppId")}
            value={addAppId}
            onChange={(e: any) => setAddAppId(e?.target?.value ?? "")}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={handleAddGame}>
            {t("downloadManifest")}
          </ButtonItem>
        </PanelSectionRow>
        {addStatus && (
          <PanelSectionRow>
            <div
              style={{
                textAlign: "center",
                padding: "6px",
                color:
                  addStatus.startsWith(t("error")) ||
                    addStatus === t("invalidAppId") ||
                    addStatus === t("downloadFailed")
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

      {/* Morrenus Search */}
      <PanelSection title={t("searchByName")}>
        <PanelSectionRow>
          <TextField
            label={t("gameName")}
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e?.target?.value ?? "")}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={handleSearchMorrenus}
            disabled={searching}
          >
            {searching ? t("searching") : t("searchMorrenus")}
          </ButtonItem>
        </PanelSectionRow>
        {searchError && (
          <PanelSectionRow>
            <div
              style={{
                textAlign: "center",
                padding: "4px",
                color: "#ff6b6b",
                fontSize: "12px",
              }}
            >
              {searchError}
            </div>
          </PanelSectionRow>
        )}
        {searchResults.length > 0 && (
          <>
            <PanelSectionRow>
              <div
                style={{
                  fontSize: "11px",
                  color: "#8b929a",
                  textAlign: "center",
                }}
              >
                {searchResults.length} {t("results")}
              </div>
            </PanelSectionRow>
            {searchResults.slice(0, showMoreResults ? 15 : 5).map((r: SearchResult) => (
              <PanelSectionRow key={r.appid}>
                <ButtonItem
                  layout="below"
                  onClick={() => handleSelectSearchResult(r)}
                  description={`AppID: ${r.appid}`}
                >
                  {r.name}
                </ButtonItem>
              </PanelSectionRow>
            ))}
            {searchResults.length > 5 && !showMoreResults && (
              <PanelSectionRow>
                <ButtonItem layout="below" onClick={() => setShowMoreResults(true)}>
                  {t("showMoreResults") || "Show More Results"} (+{searchResults.length - 5})
                </ButtonItem>
              </PanelSectionRow>
            )}
            {searchResults.length > 15 && showMoreResults && (
              <PanelSectionRow>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#8b929a",
                    textAlign: "center",
                  }}
                >
                  +{searchResults.length - 15} {t("moreResults")}
                </div>
              </PanelSectionRow>
            )}
          </>
        )}
      </PanelSection>

      <PanelSection title={t("myGames")}>
        <PanelSectionRow>
          <TextField
            label={t("searchByName")}
            value={search}
            onChange={(e: any) => setSearch(e?.target?.value ?? "")}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={cycleSortMode}>
            {t("sort")}: {sortLabels[sortMode]}
          </ButtonItem>
        </PanelSectionRow>

        {loading ? (
          <PanelSectionRow>
            <div
              style={{ textAlign: "center", padding: "20px", color: "#8b929a" }}
            >
              {t("loadingGames")}
            </div>
          </PanelSectionRow>
        ) : filtered.length === 0 ? (
          <PanelSectionRow>
            <div
              style={{ textAlign: "center", padding: "20px", color: "#8b929a" }}
            >
              {search ? t("noGamesMatch") : t("noGamesYet")}
            </div>
          </PanelSectionRow>
        ) : (
          filtered.map((game: GameInfo) => (
            <GameCard
              key={game.appid}
              game={
                activeDownloadId === game.appid
                  ? { ...game, downloadStatus: activeDownloadPhase }
                  : game
              }
              onClick={navigateToDetail}
            />
          ))
        )}
      </PanelSection>

      <PanelSection>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => Navigation.Navigate(ROUTE_DOWNLOADS)}
          >
            {t("activeDownloads")}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => Navigation.Navigate(ROUTE_SETTINGS)}
          >
            {t("settings")}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => loadGames()}>
            {t("refresh")}
          </ButtonItem>
        </PanelSectionRow>
        {slscheevoReady && (
          <>
            <PanelSectionRow>
              <ButtonItem
                layout="below"
                onClick={handleSyncAllAchievements}
                disabled={syncState?.status === "running"}
              >
                {syncState?.status === "running"
                  ? t("syncingAchievements", syncState.done || 0, syncState.total || 0)
                  : t("syncAllAchievements")}
              </ButtonItem>
            </PanelSectionRow>
          </>
        )}
      </PanelSection>
    </>
  );
}
