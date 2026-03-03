import { useState, useEffect, FC } from "react";
import { ButtonItem } from "@decky/ui";
import { startDownload, getInstalledLuaScripts } from "../api";

function useAppIdFromPath(): number {
  const match = window.location.pathname.match(/\/library\/app\/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export const AppPageButton: FC = () => {
  const appid = useAppIdFromPath();
  const [status, setStatus] = useState<
    "idle" | "downloading" | "done" | "error" | "installed"
  >("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!appid) return;
    (async () => {
      try {
        const result = await getInstalledLuaScripts();
        if (!cancelled && result.success && result.scripts) {
          const found = result.scripts.find((s: any) => s.appid === appid);
          if (found) setStatus("installed");
        }
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [appid]);

  if (!appid || appid <= 0) return null;

  const handleClick = async () => {
    setStatus("downloading");
    setMsg("Downloading manifest...");
    try {
      const result = await startDownload(appid);
      if (result.success) {
        setStatus("done");
        setMsg("Download started!");
      } else {
        setStatus("error");
        setMsg(result.error || "Failed");
      }
    } catch (err: any) {
      setStatus("error");
      setMsg(err?.message || "Error");
    }
  };

  const label =
    status === "installed"
      ? "Added via QuickAccela"
      : status === "downloading"
        ? "Downloading..."
        : status === "done"
          ? "Download started!"
          : status === "error"
            ? msg
            : "Add via QuickAccela";

  const isError =
    status === "error" ||
    label === "Invalid AppID" ||
    label === "Download failed";
  const isSuccess = status === "installed" || status === "done";

  return (
    <div
      style={{
        padding: "8px 16px",
        margin: "4px 0",
      }}
    >
      <ButtonItem
        layout="below"
        disabled={status === "downloading" || status === "installed"}
        onClick={handleClick}
      >
        <span
          style={{
            color: isError ? "#ff6b6b" : isSuccess ? "#8bca68" : "#1a9fff",
          }}
        >
          {label}
        </span>
      </ButtonItem>
    </div>
  );
};
