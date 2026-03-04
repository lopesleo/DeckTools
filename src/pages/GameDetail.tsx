import { useEffect, useState } from "react";
import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
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
} from "../api";

interface GameDetailProps {
  appid: number;
}

export function GameDetail({ appid }: GameDetailProps) {
  const [gameName, setGameName] = useState(`Game ${appid}`);
  const [hasLua, setHasLua] = useState(false);
  const [installPath, setInstallPath] = useState("");
  const [downloadState, setDownloadState] = useState<any>(null);
  const [fakeAppId, setFakeAppId] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [hasDlcs, setHasDlcs] = useState(false);
  const [fixes, setFixes] = useState<any>(null);
  const [fixStatus, setFixStatus] = useState<any>(null);
  const [message, setMessage] = useState("");

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
      if (pathResult.success) setInstallPath(pathResult.installPath || "");

      // Check FakeAppId, Token, DLC
      const fakeResult = await checkFakeAppIdStatus(appid);
      if (fakeResult.success) setFakeAppId(fakeResult.exists);

      const tokenResult = await checkGameTokenStatus(appid);
      if (tokenResult.success) setHasToken(tokenResult.exists);

      const dlcResult = await checkGameDlcsStatus(appid);
      if (dlcResult.success) setHasDlcs(dlcResult.exists);

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
      const result = await addFakeAppId(appid);
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
    } else {
      setMessage("Fetching DLCs...");
      const result = await addGameDlcs(appid);
      setMessage(result.message || result.error || "");
      if (result.success) setHasDlcs(true);
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

  const handleUninstall = async () => {
    setMessage("Uninstalling...");
    const result = await uninstallGameFull(appid);
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
          <ActionButton
            label={hasLua ? "Re-download Manifest" : "Download Manifest"}
            onClick={handleDownload}
            variant="primary"
          />
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
        <ActionButton
          label={fakeAppId ? "Remove FakeAppId (480)" : "Add FakeAppId (480)"}
          onClick={handleToggleFakeAppId}
        />
        <ActionButton
          label={hasToken ? "Remove Token" : "Add Token"}
          onClick={handleToggleToken}
        />
        <ActionButton
          label={hasDlcs ? "Remove DLCs" : "Add DLCs"}
          onClick={handleToggleDlcs}
        />
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
        <ActionButton
          label="Full Uninstall"
          onClick={handleUninstall}
          variant="danger"
          description="Removes game files, manifests, and config entries"
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
