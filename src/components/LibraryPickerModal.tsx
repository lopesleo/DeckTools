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
  onSelect: (libraryPath: string) => void;
  closeModal?: () => void;
}

function LibraryPickerModal({
  libraries,
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
        <h3 style={{ margin: 0, color: "#dcdedf" }}>{t("selectLibrary")}</h3>
        {libraries.map((lib, idx) => {
          const freeGB = (lib.freeBytes / (1024 * 1024 * 1024)).toFixed(1);
          const totalGB = (lib.totalBytes / (1024 * 1024 * 1024)).toFixed(1);
          const shortPath = lib.path.split("/").slice(-2).join("/");
          return (
            <DialogButton
              key={lib.path}
              onClick={() => {
                onSelect(lib.path);
                closeModal?.();
              }}
              style={{
                border: "1px solid #3d4450",
                borderRadius: "4px",
                padding: "10px 12px",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: "13px", color: "#dcdedf" }}>
                {shortPath} {idx === 0 ? `(${t("defaultLibrary")})` : ""}
              </div>
              <div style={{ fontSize: "11px", color: "#8b929a", marginTop: "2px" }}>
                {t("freeSpace", `${freeGB} / ${totalGB} GB`)} — {t("libraryGames", lib.gameCount)}
              </div>
            </DialogButton>
          );
        })}
        <DialogButton
          onClick={() => closeModal?.()}
          style={{ marginTop: "8px" }}
        >
          {t("cancel")}
        </DialogButton>
      </Focusable>
    </ModalRoot>
  );
}

export function showLibraryPicker(
  libraries: LibraryInfo[],
  onSelect: (libraryPath: string) => void,
) {
  showModal(
    <LibraryPickerModal libraries={libraries} onSelect={onSelect} />,
  );
}
