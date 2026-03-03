import { useEffect, useState } from "react";
import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  TextField,
  Navigation,
} from "@decky/ui";
import { ProgressBar } from "../components/ProgressBar";
import {
  getDownloadStatus,
  cancelDownload,
  startWorkshopDownload,
  getWorkshopDownloadStatus,
  cancelWorkshopDownload,
  startDownload,
} from "../api";

interface ActiveDownload {
  appid: number;
  status: string;
  bytesRead: number;
  totalBytes: number;
  currentApi?: string;
  error?: string;
}

export function Downloads() {
  const [downloads, setDownloads] = useState<ActiveDownload[]>([]);
  const [workshopState, setWorkshopState] = useState<any>(null);
  const [manualAppId, setManualAppId] = useState("");
  const [workshopAppId, setWorkshopAppId] = useState("");
  const [workshopPubfileId, setWorkshopPubfileId] = useState("");
  const [message, setMessage] = useState("");

  // Poll active downloads
  useEffect(() => {
    const interval = setInterval(async () => {
      // Poll workshop status
      const ws = await getWorkshopDownloadStatus();
      if (ws && ws.status !== "idle") {
        setWorkshopState(ws);
      } else {
        setWorkshopState(null);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleManualDownload = async () => {
    const appid = parseInt(manualAppId, 10);
    if (!appid || isNaN(appid)) {
      setMessage("Enter a valid AppID");
      return;
    }
    setMessage("");
    const result = await startDownload(appid);
    if (result.success) {
      setDownloads((prev: ActiveDownload[]) => [
        ...prev.filter((d: ActiveDownload) => d.appid !== appid),
        { appid, status: "queued", bytesRead: 0, totalBytes: 0 },
      ]);
      setManualAppId("");
    } else {
      setMessage(result.error || "Failed");
    }
  };

  const handleWorkshopDownload = async () => {
    const appid = parseInt(workshopAppId, 10);
    const pubfileId = parseInt(workshopPubfileId, 10);
    if (!appid || !pubfileId || isNaN(appid) || isNaN(pubfileId)) {
      setMessage("Enter valid AppID and Workshop Item ID");
      return;
    }
    setMessage("");
    const result = await startWorkshopDownload(appid, pubfileId);
    if (result.success) {
      setWorkshopState({
        status: "downloading",
        progress: 0,
        message: "Starting...",
      });
    } else {
      setMessage(result.error || "Failed");
    }
  };

  const handleCancelWorkshop = async () => {
    await cancelWorkshopDownload();
  };

  // Poll individual download states
  useEffect(() => {
    if (downloads.length === 0) return;
    const interval = setInterval(async () => {
      const updated = await Promise.all(
        downloads.map(async (d: ActiveDownload) => {
          if (["done", "failed", "cancelled"].includes(d.status)) return d;
          const status = await getDownloadStatus(d.appid);
          if (status.success && status.state) {
            return { ...d, ...status.state };
          }
          return d;
        }),
      );
      setDownloads(updated);
    }, 1500);
    return () => clearInterval(interval);
  }, [downloads]);

  return (
    <>
      <PanelSection title="Manual Download">
        <PanelSectionRow>
          <TextField
            label="AppID"
            value={manualAppId}
            onChange={(e: any) => setManualAppId(e?.target?.value ?? "")}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={handleManualDownload}>
            Download Manifest
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      {/* Active Downloads */}
      {downloads.length > 0 && (
        <PanelSection title="Active Downloads">
          {downloads.map((d: ActiveDownload) => (
            <PanelSectionRow key={d.appid}>
              <div>
                <div style={{ fontSize: "13px", color: "#dcdedf" }}>
                  AppID: {d.appid} — {d.status}
                </div>
                {d.currentApi && (
                  <div style={{ fontSize: "11px", color: "#8b929a" }}>
                    API: {d.currentApi}
                  </div>
                )}
                {d.totalBytes > 0 && (
                  <ProgressBar value={d.bytesRead} max={d.totalBytes} />
                )}
                {d.error && (
                  <div style={{ fontSize: "11px", color: "#ff4444" }}>
                    {d.error}
                  </div>
                )}
                {!["done", "failed", "cancelled"].includes(d.status) && (
                  <ButtonItem
                    layout="below"
                    onClick={async () => {
                      await cancelDownload(d.appid);
                      setDownloads((prev: ActiveDownload[]) =>
                        prev.map((x: ActiveDownload) =>
                          x.appid === d.appid
                            ? { ...x, status: "cancelled" }
                            : x,
                        ),
                      );
                    }}
                  >
                    Cancel
                  </ButtonItem>
                )}
              </div>
            </PanelSectionRow>
          ))}
        </PanelSection>
      )}

      {/* Workshop Download */}
      <PanelSection title="Workshop Download">
        <PanelSectionRow>
          <TextField
            label="AppID"
            value={workshopAppId}
            onChange={(e: any) => setWorkshopAppId(e?.target?.value ?? "")}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <TextField
            label="Workshop Item ID"
            value={workshopPubfileId}
            onChange={(e: any) => setWorkshopPubfileId(e?.target?.value ?? "")}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={handleWorkshopDownload}>
            Download Workshop Item
          </ButtonItem>
        </PanelSectionRow>
        {workshopState && (
          <>
            <PanelSectionRow>
              <div style={{ fontSize: "12px", color: "#dcdedf" }}>
                {workshopState.message || workshopState.status}
              </div>
            </PanelSectionRow>
            {workshopState.progress > 0 &&
              workshopState.status === "downloading" && (
                <PanelSectionRow>
                  <ProgressBar
                    value={workshopState.progress}
                    max={100}
                    label="Workshop"
                  />
                </PanelSectionRow>
              )}
            {workshopState.status === "downloading" && (
              <PanelSectionRow>
                <ButtonItem layout="below" onClick={handleCancelWorkshop}>
                  Cancel Workshop Download
                </ButtonItem>
              </PanelSectionRow>
            )}
          </>
        )}
      </PanelSection>

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
