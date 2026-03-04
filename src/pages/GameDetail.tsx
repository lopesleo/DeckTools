import { useEffect, useState } from "react";
import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  TextField,
  ToggleField,
  Navigation,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { ProgressBar } from "../components/ProgressBar";
import { ActionButton } from "../components/ActionButton";
import {
  startDownload,
  getDownloadStatus,
  cancelDownload,
  deleteLuatoolsForApp,
  hasLuatoolsForApp,
  getGameInstallPath,
  addFakeAppId,
  removeFakeAppId,
  checkFakeAppIdStatus,
  addGameToken,
  removeGameToken,
  checkGameTokenStatus,
  addGameDlcs,
  removeGameDlcs,
  checkGameDlcsStatus,
  checkForFixes,
  applyGameFix,
  getApplyFixStatus,
  applyLinuxNativeFix,
  uninstallGameFull,
  fetchAppName,
  repairAppmanifest,
  checkGameUpdate,
  checkGoldbergStatus,
  applyGoldberg,
  removeGoldberg,
} from "../api";
import { useT } from "../i18n";

interface GameDetailProps {
  appid: number;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024)
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function GameDetail({ appid }: GameDetailProps) {
  const t = useT();
  const [gameName, setGameName] = useState(`Game ${appid}`);
  const [hasLua, setHasLua] = useState(false);
  const [installPath, setInstallPath] = useState("");
  const [gameSize, setGameSize] = useState(0);
  const [downloadState, setDownloadState] = useState<any>(null);
  const [fakeAppId, setFakeAppId] = useState(false);
  const [fakeIdValue, setFakeIdValue] = useState("480");
  const [hasToken, setHasToken] = useState(false);
  const [hasDlcs, setHasDlcs] = useState(false);
  const [dlcCount, setDlcCount] = useState(0);
  const [fixes, setFixes] = useState<any>(null);
  const [fixStatus, setFixStatus] = useState<any>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [removeCompatdata, setRemoveCompatdata] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [goldbergApplied, setGoldbergApplied] = useState(false);
  const [busy, setBusy] = useState("");

  const toast = (title: string, body?: string, duration = 3000) =>
    toaster.toast({ title, body: body || gameName, duration });

  useEffect(() => {
    const load = async () => {
      const nameResult = await fetchAppName(appid);
      if (nameResult.success && nameResult.name) {
        setGameName(nameResult.name);
      }

      const luaResult = await hasLuatoolsForApp(appid);
      if (luaResult.success) setHasLua(luaResult.exists);

      const pathResult = await getGameInstallPath(appid);
      if (pathResult.success) {
        setInstallPath(pathResult.installPath || "");
        if (pathResult.sizeOnDisk) setGameSize(pathResult.sizeOnDisk);

        if (pathResult.installPath) {
          const gbResult = await checkGoldbergStatus(pathResult.installPath);
          if (gbResult.success) setGoldbergApplied(gbResult.applied);
        }
      }

      const fakeResult = await checkFakeAppIdStatus(appid);
      if (fakeResult.success) setFakeAppId(fakeResult.exists);

      const tokenResult = await checkGameTokenStatus(appid);
      if (tokenResult.success) setHasToken(tokenResult.exists);

      const dlcResult = await checkGameDlcsStatus(appid);
      if (dlcResult.success) {
        setHasDlcs(dlcResult.exists);
        if (dlcResult.count) setDlcCount(dlcResult.count);
      }

      const dlStatus = await getDownloadStatus(appid);
      if (
        dlStatus.success &&
        dlStatus.state &&
        Object.keys(dlStatus.state).length > 0
      ) {
        setDownloadState(dlStatus.state);
      }
    };
    load();
  }, [appid]);

  // Poll download status
  useEffect(() => {
    if (
      !downloadState ||
      ["done", "failed", "cancelled"].includes(downloadState.status)
    ) {
      return;
    }
    const interval = setInterval(async () => {
      const status = await getDownloadStatus(appid);
      if (status.success && status.state) {
        setDownloadState(status.state);
        if (status.state.status === "done") {
          setHasLua(true);
          toast(t("toastDownloadComplete"), gameName);
        } else if (status.state.status === "failed") {
          toast(t("toastDownloadFailed"), status.state.error || gameName, 5000);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [downloadState, appid, t]);

  // Poll fix status
  useEffect(() => {
    if (
      !fixStatus ||
      ["done", "failed", "cancelled"].includes(fixStatus.status)
    ) {
      return;
    }
    const interval = setInterval(async () => {
      const status = await getApplyFixStatus(appid);
      if (status.success && status.state) {
        setFixStatus(status.state);
        if (status.state.status === "done") {
          toast(t("toastSuccess"), gameName);
        } else if (status.state.status === "failed") {
          toast(t("toastError"), status.state.error || gameName, 5000);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [fixStatus, appid]);

  const handleDownload = async () => {
    const result = await startDownload(appid);
    if (result.success) {
      setDownloadState({ status: "queued", bytesRead: 0, totalBytes: 0 });
      toast(t("toastDownloadStarted"), gameName, 2000);
    } else {
      toast(t("toastError"), result.error || t("failedToStartDownload"), 4000);
    }
  };

  const handleCancel = async () => {
    await cancelDownload(appid);
    setDownloadState((prev: any) => ({ ...prev, status: "cancelled" }));
  };

  const handleDelete = async () => {
    const result = await deleteLuatoolsForApp(appid);
    if (result.success) {
      setHasLua(false);
      toast(t("toastLuaRemoved"), gameName);
    }
  };

  const handleToggleFakeAppId = async () => {
    if (fakeAppId) {
      await removeFakeAppId(appid);
      setFakeAppId(false);
      toast(t("toastFakeAppIdRemoved"), gameName);
    } else {
      const id = parseInt(fakeIdValue, 10) || 480;
      const result = await addFakeAppId(appid, id);
      if (result.success) {
        setFakeAppId(true);
        toast(t("toastFakeAppIdAdded", id), gameName);
      } else {
        toast(t("toastError"), result.message || result.error || "", 4000);
      }
    }
  };

  const handleToggleToken = async () => {
    if (hasToken) {
      await removeGameToken(appid);
      setHasToken(false);
      toast(t("toastTokenRemoved"), gameName);
    } else {
      const result = await addGameToken(appid);
      if (result.success) {
        setHasToken(true);
        toast(t("toastTokenAdded"), gameName);
      } else {
        toast(t("toastError"), result.message || result.error || "", 4000);
      }
    }
  };

  const handleToggleDlcs = async () => {
    if (hasDlcs) {
      await removeGameDlcs(appid);
      setHasDlcs(false);
      setDlcCount(0);
      toast(t("toastDlcsRemoved"), gameName);
    } else {
      setBusy("dlcs");
      toast(t("fetchingDlcs"), gameName, 2000);
      const result = await addGameDlcs(appid);
      setBusy("");
      if (result.success) {
        if (result.skipped) {
          setHasDlcs(false);
          toast(t("toastDlcsNoneFound"), gameName, 4000);
        } else {
          setHasDlcs(true);
          if (result.count) setDlcCount(result.count);
          toast(t("toastDlcsAdded", result.count || 0), gameName);
        }
      } else {
        toast(t("toastError"), result.message || result.error || "", 4000);
      }
    }
  };

  const handleCheckFixes = async () => {
    setBusy("fixes");
    const result = await checkForFixes(appid);
    setBusy("");
    if (result.success) {
      setFixes(result);
      const hasAny = result.genericFix?.available || result.onlineFix?.available;
      toast(
        hasAny ? t("toastFixesFound") : t("toastNoFixes"),
        gameName,
      );
    } else {
      toast(t("toastError"), result.error || t("failedToCheck"), 4000);
    }
  };

  const handleApplyFix = async (url: string, fixType: string) => {
    if (!installPath) {
      toast(t("toastError"), t("installPathNotFound"), 4000);
      return;
    }
    const result = await applyGameFix(
      appid,
      url,
      installPath,
      fixType,
      gameName,
    );
    if (result.success) {
      setFixStatus({ status: "queued" });
    }
  };

  const handleNativeFix = async () => {
    if (!installPath) {
      toast(t("toastError"), t("installPathNotFound"), 4000);
      return;
    }
    const result = await applyLinuxNativeFix(installPath);
    if (result.success) {
      toast(t("toastNativeFixApplied", result.count || 0), gameName);
    } else {
      toast(t("toastError"), result.error || "", 4000);
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    toast(t("toastCheckingUpdates"), gameName, 2000);
    const result = await checkGameUpdate(appid);
    if (result.success) {
      if (result.updateAvailable) {
        setUpdateStatus("available");
        const changeCount = (result.changes || []).length;
        toast(t("toastUpdateAvailable"), t("toastDepotsChanged", changeCount), 5000);
      } else {
        setUpdateStatus("uptodate");
        toast(t("toastUpToDate"), t("toastIsUpToDate", gameName));
      }
    } else {
      setUpdateStatus(null);
      toast(t("toastUpdateCheckFailed"), result.error || "", 4000);
    }
  };

  const handleToggleGoldberg = async () => {
    if (!installPath) {
      toast(t("toastError"), t("installPathNotFound"), 4000);
      return;
    }
    if (goldbergApplied) {
      setBusy("goldberg");
      const result = await removeGoldberg(installPath, appid);
      setBusy("");
      if (result.success) {
        setGoldbergApplied(false);
        toast(t("toastGoldbergRemoved"), gameName);
      } else {
        toast(t("toastError"), result.message || result.error || "", 4000);
      }
    } else {
      setBusy("goldberg");
      const result = await applyGoldberg(installPath, appid);
      setBusy("");
      if (result.success) {
        setGoldbergApplied(true);
        toast(t("toastGoldbergApplied"), gameName);
      } else {
        toast(t("toastError"), result.message || result.error || "", 4000);
      }
    }
  };

  const handleRepairAcf = async () => {
    setBusy("acf");
    const result = await repairAppmanifest(appid);
    setBusy("");
    if (result.success) {
      toast(t("toastAcfRepaired"), gameName);
    } else {
      toast(t("toastError"), result.error || t("repairFailed"), 4000);
    }
  };

  const handleUninstall = async () => {
    if (!confirmUninstall) {
      setConfirmUninstall(true);
      setTimeout(() => setConfirmUninstall(false), 5000);
      return;
    }
    setConfirmUninstall(false);
    setBusy("uninstall");
    const result = await uninstallGameFull(appid, removeCompatdata);
    setBusy("");
    if (result.success) {
      setHasLua(false);
      setFakeAppId(false);
      setHasToken(false);
      setHasDlcs(false);
      const removed = result.removed || [];
      const hasFiles = removed.includes("game_files");
      const errors = result.errors || [];
      if (errors.length > 0) {
        toast(t("toastUninstalled"), t("uninstallWarnings", errors.join(", ")), 5000);
      } else if (!hasFiles) {
        toast(t("toastUninstalled"), t("configRemoved"));
      } else {
        toast(t("toastUninstalled"), t("gameFullyUninstalled"));
      }
      setTimeout(() => Navigation.NavigateBack(), 1500);
    } else {
      toast(t("toastError"), result.error || t("failedToCheck"), 5000);
    }
  };

  const isDownloading =
    downloadState &&
    !["done", "failed", "cancelled", undefined].includes(downloadState.status);

  const dlcLabel = hasDlcs
    ? `${t("removeDlcs")}${dlcCount > 0 ? ` (${dlcCount})` : ""}`
    : `${t("addDlcs")}${dlcCount > 0 ? ` (${dlcCount} ${t("found")})` : ""}`;

  return (
    <>
      <PanelSection title={gameName}>
        <PanelSectionRow>
          <div style={{ fontSize: "13px", color: "#8b929a" }}>
            AppID: {appid}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div
            style={{
              fontSize: "13px",
              color: hasLua ? (installPath ? "#00cc00" : "#ffaa00") : "#666",
            }}
          >
            Status:{" "}
            {hasLua
              ? installPath
                ? t("installed")
                : t("manifestOnly")
              : t("notInstalled")}
            {gameSize > 0 && ` — ${formatSize(gameSize)}`}
          </div>
        </PanelSectionRow>
        {installPath && (
          <PanelSectionRow>
            <div
              style={{
                fontSize: "11px",
                color: "#8b929a",
                wordBreak: "break-all",
              }}
            >
              {installPath}
            </div>
          </PanelSectionRow>
        )}
      </PanelSection>

      {/* Download section */}
      <PanelSection title={t("download")}>
        {isDownloading ? (
          <>
            <PanelSectionRow>
              <div style={{ fontSize: "12px", color: "#dcdedf" }}>
                {downloadState.status === "depot_download"
                  ? (downloadState.depotProgress || t("statusDownloadingGame"))
                  : (<>
                      {downloadState.currentApi && `API: ${downloadState.currentApi}`}
                      {" — "}
                      {downloadState.status === "downloading" ? t("statusDownloading")
                        : downloadState.status === "processing" ? t("statusProcessing")
                        : downloadState.status === "configuring" ? t("statusConfiguring")
                        : downloadState.status === "installing" ? t("statusInstalling")
                        : downloadState.status === "queued" ? t("statusQueued")
                        : downloadState.status === "checking" ? `${t("statusChecking")} ${downloadState.currentApi || ""}...`
                        : downloadState.status}
                      {downloadState.speed > 0 &&
                        ` — ${formatSpeed(downloadState.speed)}`}
                    </>)
                }
              </div>
            </PanelSectionRow>
            {downloadState.status === "depot_download" && downloadState.depotPercent > 0 ? (
              <PanelSectionRow>
                <ProgressBar
                  value={downloadState.depotPercent}
                  max={100}
                  label={t("statusDownloadingGame")}
                />
              </PanelSectionRow>
            ) : downloadState.status === "downloading" && downloadState.totalBytes > 0 ? (
              <PanelSectionRow>
                <ProgressBar
                  value={downloadState.bytesRead || 0}
                  max={downloadState.totalBytes}
                  label={t("progress")}
                />
              </PanelSectionRow>
            ) : null}
            <ActionButton
              label={t("cancelDownload")}
              onClick={handleCancel}
              variant="danger"
            />
          </>
        ) : (
          <>
            <ActionButton
              label={hasLua ? t("redownloadManifest") : t("downloadManifest")}
              onClick={handleDownload}
              variant="primary"
            />
            {hasLua && updateStatus === "available" ? (
              <ActionButton
                label={t("updateNow")}
                onClick={handleDownload}
                variant="primary"
                description={t("redownloadDesc")}
              />
            ) : hasLua ? (
              <ActionButton
                label={
                  updateStatus === "checking"
                    ? t("checking")
                    : updateStatus === "uptodate"
                      ? t("upToDate")
                      : t("checkForUpdates")
                }
                onClick={handleCheckUpdate}
                disabled={updateStatus === "checking"}
              />
            ) : null}
          </>
        )}
        {downloadState?.status === "done" && (
          <PanelSectionRow>
            <div style={{ color: "#00cc00", fontSize: "12px" }}>
              {t("downloadComplete")}
            </div>
          </PanelSectionRow>
        )}
        {downloadState?.status === "failed" && (
          <PanelSectionRow>
            <div style={{ color: "#ff4444", fontSize: "12px" }}>
              {downloadState.error || t("downloadFailed")}
            </div>
          </PanelSectionRow>
        )}
      </PanelSection>

      {/* Game Management */}
      <PanelSection title={t("gameManagement")}>
        <PanelSectionRow>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <TextField
                label="FakeAppId"
                value={fakeIdValue}
                onChange={(e: any) => setFakeIdValue(e?.target?.value ?? "480")}
                disabled={fakeAppId}
              />
            </div>
          </div>
        </PanelSectionRow>
        <ActionButton
          label={
            fakeAppId
              ? `${t("removeFakeAppId")} (${fakeIdValue})`
              : `${t("addFakeAppId")} (${fakeIdValue})`
          }
          onClick={handleToggleFakeAppId}
        />
        <ActionButton
          label={hasToken ? t("removeToken") : t("addToken")}
          onClick={handleToggleToken}
        />
        <ActionButton
          label={busy === "dlcs" ? t("fetchingDlcs") : dlcLabel}
          onClick={handleToggleDlcs}
          disabled={busy === "dlcs"}
        />
        {installPath && (
          <ActionButton
            label={
              busy === "goldberg"
                ? (goldbergApplied ? t("removingGoldberg") : t("applyingGoldberg"))
                : (goldbergApplied ? t("removeGoldberg") : t("applyGoldberg"))
            }
            onClick={handleToggleGoldberg}
            disabled={busy === "goldberg"}
            description={
              goldbergApplied
                ? t("restoreOriginalDlls")
                : t("replaceWithGoldberg")
            }
          />
        )}
      </PanelSection>

      {/* Fixes */}
      <PanelSection title={t("fixes")}>
        <ActionButton
          label={busy === "fixes" ? t("checkingForFixes") : t("checkForFixes")}
          onClick={handleCheckFixes}
          disabled={busy === "fixes"}
        />
        {fixes && (
          <>
            {fixes.genericFix?.available && (
              <ActionButton
                label={t("applyGenericFix")}
                onClick={() =>
                  handleApplyFix(fixes.genericFix.url, "Generic Fix")
                }
                variant="primary"
              />
            )}
            {fixes.onlineFix?.available && (
              <ActionButton
                label={t("applyOnlineFix")}
                onClick={() =>
                  handleApplyFix(fixes.onlineFix.url, "Online Fix (Unsteam)")
                }
                variant="primary"
              />
            )}
            {!fixes.genericFix?.available && !fixes.onlineFix?.available && (
              <PanelSectionRow>
                <div style={{ color: "#8b929a", fontSize: "12px" }}>
                  {t("noFixesAvailable")}
                </div>
              </PanelSectionRow>
            )}
          </>
        )}
        {fixStatus && !["done", "failed"].includes(fixStatus.status) && (
          <PanelSectionRow>
            <ProgressBar
              value={fixStatus.bytesRead || 0}
              max={fixStatus.totalBytes || 1}
              label={fixStatus.status}
            />
          </PanelSectionRow>
        )}
        <ActionButton
          label={t("applyLinuxNativeFix")}
          onClick={handleNativeFix}
        />
        <ActionButton
          label={busy === "acf" ? t("repairingAcf") : t("repairAppmanifest")}
          onClick={handleRepairAcf}
          disabled={busy === "acf"}
          description={t("regeneratesAcf")}
        />
      </PanelSection>

      {/* Danger zone */}
      <PanelSection title={t("dangerZone")}>
        {hasLua && (
          <ActionButton
            label={t("removeLuaScript")}
            onClick={handleDelete}
            variant="danger"
          />
        )}
        <PanelSectionRow>
          <ToggleField
            label={t("removeProtonPrefix")}
            description={t("deleteCompatdata")}
            checked={removeCompatdata}
            onChange={setRemoveCompatdata}
          />
        </PanelSectionRow>
        <ActionButton
          label={
            busy === "uninstall"
              ? t("uninstalling")
              : confirmUninstall
                ? t("confirmFullUninstall")
                : t("fullUninstall")
          }
          onClick={handleUninstall}
          variant="danger"
          disabled={busy === "uninstall"}
          description={
            confirmUninstall ? t("clickToConfirm") : t("removesGameFiles")
          }
        />
      </PanelSection>

      <PanelSection>
        <ButtonItem layout="below" onClick={() => Navigation.NavigateBack()}>
          {t("back")}
        </ButtonItem>
      </PanelSection>
    </>
  );
}
