import {
  showModal,
  ModalRoot,
  DialogButton,
  Focusable,
} from "@decky/ui";
import { useT } from "../i18n";

interface LibraryInfo {
  path: string;
  freeBytes: number;
  totalBytes: number;
  gameCount: number;
}

interface LibraryPickerModalProps {
  libraries: LibraryInfo[];
  gameSizeBytes?: number;
  onSelect: (libraryPath: string) => void;
  closeModal?: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

function LibraryPickerModal({
  libraries,
  gameSizeBytes = 0,
  onSelect,
  closeModal,
}: LibraryPickerModalProps) {
  const t = useT();

  return (
    <ModalRoot onCancel={closeModal} closeModal={closeModal}>
      <Focusable
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <h3 style={{ margin: 0, color: "#dcdedf" }}>{t("selectLibrary")}</h3>
          {gameSizeBytes > 0 && (
            <span style={{ fontSize: "12px", color: "#9aa4b2", background: "rgba(255,255,255,0.07)", borderRadius: "4px", padding: "2px 8px" }}>
              {t("gameSize")}: {formatBytes(gameSizeBytes)}
            </span>
          )}
        </div>
        {libraries.map((lib, idx) => {
          const freeGB = lib.freeBytes / (1024 * 1024 * 1024);
          const totalGB = lib.totalBytes / (1024 * 1024 * 1024);
          const shortPath = lib.path.split("/").slice(-2).join("/");
          const fits = !gameSizeBytes || lib.freeBytes >= gameSizeBytes;
          const tight = gameSizeBytes > 0 && lib.freeBytes >= gameSizeBytes && lib.freeBytes < gameSizeBytes * 1.2;
          const indicatorColor = !gameSizeBytes ? "#8b929a" : fits ? (tight ? "#c8a84b" : "#7ed36f") : "#e06060";
          const pct = lib.totalBytes > 0 ? ((lib.totalBytes - lib.freeBytes) / lib.totalBytes) : 0;

          return (
            <DialogButton
              key={lib.path}
              onClick={() => {
                onSelect(lib.path);
                closeModal?.();
              }}
              disabled={gameSizeBytes > 0 && !fits}
              style={{
                border: `1px solid ${fits ? "#3d4450" : "rgba(224,96,96,0.4)"}`,
                borderLeft: `3px solid ${indicatorColor}`,
                borderRadius: "4px",
                padding: "10px 12px",
                textAlign: "left",
                opacity: gameSizeBytes > 0 && !fits ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "#dcdedf" }}>
                  {shortPath} {idx === 0 ? `(${t("defaultLibrary")})` : ""}
                </span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: indicatorColor }}>
                  {formatBytes(lib.freeBytes)} {t("free")}
                </span>
              </div>
              <div style={{ marginTop: "5px", height: "3px", background: "rgba(255,255,255,0.1)", borderRadius: "2px" }}>
                <div style={{ height: "100%", width: `${Math.min(pct * 100, 100)}%`, background: pct > 0.9 ? "#e06060" : "#4a9eff", borderRadius: "2px" }} />
              </div>
              <div style={{ fontSize: "11px", color: "#8b929a", marginTop: "3px", display: "flex", justifyContent: "space-between" }}>
                <span>{t("libraryGames", lib.gameCount)}</span>
                <span>{freeGB.toFixed(1)} / {totalGB.toFixed(1)} GB</span>
              </div>
            </DialogButton>
          );
        })}
        <DialogButton onClick={() => closeModal?.()} style={{ marginTop: "8px" }}>
          {t("cancel")}
        </DialogButton>
      </Focusable>
    </ModalRoot>
  );
}

export function showLibraryPicker(
  libraries: LibraryInfo[],
  onSelect: (libraryPath: string) => void,
  gameSizeBytes?: number,
) {
  showModal(
    <LibraryPickerModal libraries={libraries} gameSizeBytes={gameSizeBytes} onSelect={onSelect} />,
  );
}
