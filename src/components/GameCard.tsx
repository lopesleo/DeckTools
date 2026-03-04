import { ButtonItem } from "@decky/ui";
import { CSSProperties } from "react";
import { ProgressBar } from "./ProgressBar";
import { useT } from "../i18n";

export interface GameInfo {
  appid: number;
  name: string;
  hasLua?: boolean;
  isDisabled?: boolean;
  hasGameFiles?: boolean;
  downloadStatus?: string;
  downloadProgress?: number;
  downloadTotal?: number;
}

interface GameCardProps {
  game: GameInfo;
  onClick: (appid: number) => void;
}

export function GameCard({ game, onClick }: GameCardProps) {
  const t = useT();

  const statusColor = game.hasLua
    ? game.isDisabled
      ? "#ffaa00"
      : game.hasGameFiles
        ? "#00cc00"
        : "#ffaa00"
    : "#666";

  const statusText = game.hasLua
    ? game.isDisabled
      ? t("disabled")
      : game.hasGameFiles
        ? t("installed")
        : t("manifestOnly")
    : t("pending");

  const activePhases = [
    "downloading",
    "checking",
    "processing",
    "configuring",
    "depot_download",
    "queued",
    "installing",
  ];
  const isDownloading = !!game.downloadStatus && activePhases.includes(game.downloadStatus);

  const badgeStyle: CSSProperties = {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: isDownloading ? "#1a9fff" : statusColor,
    marginRight: "8px",
    flexShrink: 0,
  };

  const downloadLabel = (() => {
    switch (game.downloadStatus) {
      case "downloading": return t("statusDownloading");
      case "checking": return t("statusChecking");
      case "processing": return t("statusProcessing");
      case "configuring": return t("statusConfiguring");
      case "depot_download": return t("statusDownloadingGame");
      case "queued": return t("statusQueued");
      case "installing": return t("statusInstalling");
      default: return game.downloadStatus || "";
    }
  })();

  return (
    <ButtonItem
      layout="below"
      onClick={() => onClick(game.appid)}
      description={
        isDownloading && game.downloadTotal ? (
          <ProgressBar
            value={game.downloadProgress ?? 0}
            max={game.downloadTotal}
          />
        ) : (
          <span style={{ color: isDownloading ? "#1a9fff" : statusColor, fontSize: "12px" }}>
            {isDownloading ? downloadLabel : statusText} — {game.appid}
          </span>
        )
      }
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={badgeStyle} />
        <span>{game.name}</span>
      </div>
    </ButtonItem>
  );
}
