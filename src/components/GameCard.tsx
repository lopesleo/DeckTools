import { ButtonItem } from "@decky/ui";
import { CSSProperties } from "react";
import { ProgressBar } from "./ProgressBar";

export interface GameInfo {
  appid: number;
  name: string;
  hasLua?: boolean;
  isDisabled?: boolean;
  downloadStatus?: string;
  downloadProgress?: number;
  downloadTotal?: number;
}

interface GameCardProps {
  game: GameInfo;
  onClick: (appid: number) => void;
}

export function GameCard({ game, onClick }: GameCardProps) {
  const statusColor = game.hasLua
    ? game.isDisabled
      ? "#ffaa00"
      : "#00cc00"
    : "#666";

  const statusText = game.hasLua
    ? game.isDisabled
      ? "Disabled"
      : "Installed"
    : "Pending";

  const isDownloading = game.downloadStatus === "downloading" || game.downloadStatus === "checking" || game.downloadStatus === "processing";

  const badgeStyle: CSSProperties = {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: isDownloading ? "#1a9fff" : statusColor,
    marginRight: "8px",
    flexShrink: 0,
  };

  return (
    <ButtonItem
      layout="below"
      onClick={() => onClick(game.appid)}
      description={
        isDownloading && game.downloadTotal ? (
          <ProgressBar value={game.downloadProgress ?? 0} max={game.downloadTotal} />
        ) : (
          <span style={{ color: statusColor, fontSize: "12px" }}>
            {isDownloading ? game.downloadStatus : statusText} — {game.appid}
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
