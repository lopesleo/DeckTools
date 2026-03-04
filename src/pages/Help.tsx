import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  Navigation,
} from "@decky/ui";
import { useT } from "../i18n";

export function Help() {
  const t = useT();
  return (
    <>
      <PanelSection title={t("helpWhatIs")}>
        <PanelSectionRow>
          <div
            style={{ fontSize: "13px", color: "#dcdedf", lineHeight: "1.5" }}
          >
            {t("helpWhatIsDesc")}
          </div>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title={t("helpHowToAdd")}>
        <PanelSectionRow>
          <div
            style={{
              fontSize: "13px",
              color: "#dcdedf",
              lineHeight: "1.6",
              whiteSpace: "pre-line",
            }}
          >
            {t("helpHowToAddSteps")}
          </div>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title={t("helpFeatures")}>
        <PanelSectionRow>
          <div
            style={{ fontSize: "12px", color: "#dcdedf", lineHeight: "1.6" }}
          >
            {t("helpFakeAppId")}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div
            style={{ fontSize: "12px", color: "#dcdedf", lineHeight: "1.6" }}
          >
            {t("helpToken")}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div
            style={{ fontSize: "12px", color: "#dcdedf", lineHeight: "1.6" }}
          >
            {t("helpDlcs")}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div
            style={{ fontSize: "12px", color: "#dcdedf", lineHeight: "1.6" }}
          >
            {t("helpGoldberg")}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div
            style={{ fontSize: "12px", color: "#dcdedf", lineHeight: "1.6" }}
          >
            {t("helpFixes")}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div
            style={{ fontSize: "12px", color: "#dcdedf", lineHeight: "1.6" }}
          >
            {t("helpLinuxNative")}
          </div>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title={t("helpTroubleshooting")}>
        <PanelSectionRow>
          <div
            style={{
              fontSize: "12px",
              color: "#dcdedf",
              lineHeight: "1.6",
              whiteSpace: "pre-line",
            }}
          >
            {t("helpTroubleshootingTips")}
          </div>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection>
        <ButtonItem layout="below" onClick={() => Navigation.NavigateBack()}>
          {t("back")}
        </ButtonItem>
      </PanelSection>
    </>
  );
}
