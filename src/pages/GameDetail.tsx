import { useEffect, useState } from "react";
import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  TextField,
  ToggleField,
  Navigation,
} from "@decky/ui";
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

interface GameDetailProps {
  appid: number;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function GameDetail({ appid }: GameDetailProps) {
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
  const [message, setMessage] = useState("");
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [removeCompatdata, setRemoveCompatdata] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [goldbergApplied, setGoldbergApplied] = useState(false);

  useEffect(() => {
    const load = async () => {
      // Fetch game name
      const nameResult = await fetchAppName(appid);
      if (nameResult.success && nameResult.name) {
        setGameName(nameResult.name);
      }

      // Check lua status
      const luaResult = await hasLuatoolsForApp(appid);
      if (luaResult.success) setHasLua(luaResult.exists);

      // Get install path
      const pathResult = await getGameInstallPath(appid);
      if (pathResult.success) {
        setInstallPath(pathResult.installPath || "");
        if (pathResult.sizeOnDisk) setGameSize(pathResult.sizeOnDisk);

        // Check Goldberg status
        if (pathResult.installPath) {
          const gbResult = await checkGoldbergStatus(pathResult.installPath);
          if (gbResult.success) setGoldbergApplied(gbResult.applied);
        }
      }

      // Check FakeAppId, Token, DLC
      const fakeResult = await checkFakeAppIdStatus(appid);
      if (fakeResult.success) setFakeAppId(fakeResult.exists);

      const tokenResult = await checkGameTokenStatus(appid);
      if (tokenResult.success) setHasToken(tokenResult.exists);

      const dlcResult = await checkGameDlcsStatus(appid);
      if (dlcResult.success) {
        setHasDlcs(dlcResult.exists);
        if (dlcResult.count) setDlcCount(dlcResult.count);
      }

      // Check download status
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
          setMessage("Download complete!");
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [downloadState, appid]);

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
          setMessage("Fix applied!");
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [fixStatus, appid]);

  const handleDownload = async () => {
    setMessage("");
    const result = await startDownload(appid);
    if (result.success) {
      setDownloadState({ status: "queued", bytesRead: 0, totalBytes: 0 });
    } else {
      setMessage(result.error || "Failed to start download");
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
      setMessage("Lua script removed");
    }
  };

  const handleToggleFakeAppId = async () => {
    if (fakeAppId) {
      await removeFakeAppId(appid);
      setFakeAppId(false);
    } else {
      const id = parseInt(fakeIdValue, 10) || 480;
      const result = await addFakeAppId(appid, id);
      if (result.success) setFakeAppId(true);
      setMessage(result.message || "");
    }
  };

  const handleToggleToken = async () => {
    if (hasToken) {
      await removeGameToken(appid);
      setHasToken(false);
    } else {
      const result = await addGameToken(appid);
      if (result.success) setHasToken(true);
      setMessage(result.message || result.error || "");
    }
  };

  const handleToggleDlcs = async () => {
    if (hasDlcs) {
      await removeGameDlcs(appid);
      setHasDlcs(false);
      setDlcCount(0);
    } else {
      setMessage("Fetching DLCs...");
      const result = await addGameDlcs(appid);
      setMessage(result.message || result.error || "");
      if (result.success) {
        if (result.skipped) {
          // ≤64 DLCs — Steam handles natively, not written to config
          setHasDlcs(false);
        } else {
          setHasDlcs(true);
        }
        if (result.count) setDlcCount(result.count);
      }
    }
  };

  const handleCheckFixes = async () => {
    setMessage("Checking for fixes...");
    const result = await checkForFixes(appid);
    if (result.success) {
      setFixes(result);
      setMessage("");
    } else {
      setMessage(result.error || "Failed to check");
    }
  };

  const handleApplyFix = async (url: string, fixType: string) => {
    if (!installPath) {
      setMessage("Install path not found");
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
      setMessage("Install path not found");
      return;
    }
    const result = await applyLinuxNativeFix(installPath);
    setMessage(
      result.success
        ? `Permissions set on ${result.count} files`
        : result.error,
    );
  };

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    setMessage("Checking for updates...");
    const result = await checkGameUpdate(appid);
    if (result.success) {
      if (result.updateAvailable) {
        setUpdateStatus("available");
        const changeCount = (result.changes || []).length;
        setMessage(`Update available! ${changeCount} depot(s) changed`);
      } else {
        setUpdateStatus("uptodate");
        setMessage("Game is up to date");
      }
    } else {
      setUpdateStatus(null);
      setMessage(result.error || "Update check failed");
    }
  };

  const handleToggleGoldberg = async () => {
    if (!installPath) {
      setMessage("Install path not found");
      return;
    }
    if (goldbergApplied) {
      setMessage("Removing Goldberg...");
      const result = await removeGoldberg(installPath, appid);
      setMessage(result.message || result.error || "");
      if (result.success) setGoldbergApplied(false);
    } else {
      setMessage("Applying Goldberg...");
      const result = await applyGoldberg(installPath, appid);
      setMessage(result.message || result.error || "");
      if (result.success) setGoldbergApplied(true);
    }
  };

  const handleUninstall = async () => {
    if (!confirmUninstall) {
      setConfirmUninstall(true);
      setMessage("Press again to confirm full uninstall");
      // Auto-cancel confirmation after 5 seconds
      setTimeout(() => {
        setConfirmUninstall(false);
        setMessage((prev) => prev === "Press again to confirm full uninstall" ? "" : prev);
      }, 5000);
      return;
    }
    setConfirmUninstall(false);
    setMessage("Uninstalling...");
    const result = await uninstallGameFull(appid, removeCompatdata);
    if (result.success) {
      setHasLua(false);
      setFakeAppId(false);
      setHasToken(false);
      setHasDlcs(false);
      const removed = result.removed || [];
      const hasFiles = removed.includes("game_files");
      const errors = result.errors || [];
      if (errors.length > 0) {
        setMessage(`Uninstalled (with warnings: ${errors.join(", ")})`);
      } else if (!hasFiles) {
        setMessage("Config removed (no game files found to delete)");
      } else {
        setMessage("Game fully uninstalled");
      }
      setTimeout(() => Navigation.NavigateBack(), 2000);
    } else {
      setMessage(result.error || "Uninstall failed");
    }
  };

  const isDownloading =
    downloadState &&
    !["done", "failed", "cancelled", undefined].includes(downloadState.status);

  const dlcLabel = hasDlcs
    ? `Remove DLCs${dlcCount > 0 ? ` (${dlcCount})` : ""}`
    : `Add DLCs${dlcCount > 0 ? ` (${dlcCount} found)` : ""}`;

  return (
    <>
      <PanelSection title={gameName}>
        <PanelSectionRow>
          <div style={{ fontSize: "13px", color: "#8b929a" }}>
            AppID: {appid}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={{ fontSize: "13px", color: hasLua ? "#00cc00" : "#666" }}>
            Status: {hasLua ? "Installed" : "Not installed"}
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
      <PanelSection title="Download">
        {isDownloading ? (
          <>
            <PanelSectionRow>
              <div style={{ fontSize: "12px", color: "#dcdedf" }}>
                {downloadState.currentApi && `API: ${downloadState.currentApi}`}
                {" — "}
                {downloadState.status}
                {downloadState.speed > 0 && ` — ${formatSpeed(downloadState.speed)}`}
              </div>
            </PanelSectionRow>
            {downloadState.totalBytes > 0 && (
              <PanelSectionRow>
                <ProgressBar
                  value={downloadState.bytesRead || 0}
                  max={downloadState.totalBytes}
                  label="Progress"
                />
              </PanelSectionRow>
            )}
            <ActionButton
              label="Cancel Download"
              onClick={handleCancel}
              variant="danger"
            />
          </>
        ) : (
          <>
            <ActionButton
              label={hasLua ? "Re-download Manifest" : "Download Manifest"}
              onClick={handleDownload}
              variant="primary"
            />
            {hasLua && (
              <ActionButton
                label={updateStatus === "checking" ? "Checking..." : updateStatus === "available" ? "Update Available!" : updateStatus === "uptodate" ? "Up to Date" : "Check for Updates"}
                onClick={handleCheckUpdate}
                disabled={updateStatus === "checking"}
                description={updateStatus === "available" ? "Re-download to update" : undefined}
              />
            )}
          </>
        )}
        {downloadState?.status === "done" && (
          <PanelSectionRow>
            <div style={{ color: "#00cc00", fontSize: "12px" }}>
              Download complete!
            </div>
          </PanelSectionRow>
        )}
        {downloadState?.status === "failed" && (
          <PanelSectionRow>
            <div style={{ color: "#ff4444", fontSize: "12px" }}>
              {downloadState.error || "Download failed"}
            </div>
          </PanelSectionRow>
        )}
      </PanelSection>

      {/* Game Management */}
      <PanelSection title="Game Management">
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
          label={fakeAppId ? `Remove FakeAppId (${fakeIdValue})` : `Add FakeAppId (${fakeIdValue})`}
          onClick={handleToggleFakeAppId}
        />
        <ActionButton
          label={hasToken ? "Remove Token" : "Add Token"}
          onClick={handleToggleToken}
        />
        <ActionButton
          label={dlcLabel}
          onClick={handleToggleDlcs}
        />
        {installPath && (
          <ActionButton
            label={goldbergApplied ? "Remove Goldberg" : "Apply Goldberg"}
            onClick={handleToggleGoldberg}
            description={goldbergApplied ? "Restore original steam_api DLLs" : "Replace steam_api with Goldberg emulator"}
          />
        )}
      </PanelSection>

      {/* Fixes */}
      <PanelSection title="Fixes">
        <ActionButton label="Check for Fixes" onClick={handleCheckFixes} />
        {fixes && (
          <>
            {fixes.genericFix?.available && (
              <ActionButton
                label="Apply Generic Fix"
                onClick={() =>
                  handleApplyFix(fixes.genericFix.url, "Generic Fix")
                }
                variant="primary"
              />
            )}
            {fixes.onlineFix?.available && (
              <ActionButton
                label="Apply Online Fix (Unsteam)"
                onClick={() =>
                  handleApplyFix(fixes.onlineFix.url, "Online Fix (Unsteam)")
                }
                variant="primary"
              />
            )}
            {!fixes.genericFix?.available && !fixes.onlineFix?.available && (
              <PanelSectionRow>
                <div style={{ color: "#8b929a", fontSize: "12px" }}>
                  No fixes available
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
          label="Apply Linux Native Fix (chmod)"
          onClick={handleNativeFix}
        />
        <ActionButton
          label="Repair Appmanifest (ACF)"
          onClick={async () => {
            setMessage("Repairing ACF...");
            const result = await repairAppmanifest(appid);
            setMessage(
              result.success
                ? result.message || "ACF repaired. Steam will restart."
                : result.error || "Repair failed",
            );
          }}
          description="Regenerates ACF and restarts Steam"
        />
      </PanelSection>

      {/* Danger zone */}
      <PanelSection title="Danger Zone">
        {hasLua && (
          <ActionButton
            label="Remove Lua Script"
            onClick={handleDelete}
            variant="danger"
          />
        )}
        <PanelSectionRow>
          <ToggleField
            label="Remove Proton prefix"
            description="Delete compatdata (saves, config)"
            checked={removeCompatdata}
            onChange={setRemoveCompatdata}
          />
        </PanelSectionRow>
        <ActionButton
          label={confirmUninstall ? "CONFIRM Full Uninstall" : "Full Uninstall"}
          onClick={handleUninstall}
          variant="danger"
          description={confirmUninstall ? "Click to confirm — this cannot be undone" : "Removes game files, manifests, and config entries"}
        />
      </PanelSection>

      {/* Messages */}
      {message && (
        <PanelSection>
          <PanelSectionRow>
            <div
              style={{
                fontSize: "12px",
                color: "#dcdedf",
                textAlign: "center",
              }}
            >
              {message}
            </div>
          </PanelSectionRow>
        </PanelSection>
      )}

      <PanelSection>
        <ButtonItem layout="below" onClick={() => Navigation.NavigateBack()}>
          Back
        </ButtonItem>
      </PanelSection>
    </>
  );
}
