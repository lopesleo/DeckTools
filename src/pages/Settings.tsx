import { useEffect, useState } from "react";
import {
  PanelSection,
  PanelSectionRow,
  TextField,
  ButtonItem,
  ToggleField,
  Navigation,
} from "@decky/ui";
import {
  saveRyuCookie,
  loadRyuCookie,
  updateMorrenusKey,
  fetchFreeApisNow,
  checkDependencies,
  installDependencies,
  getPlatformSummary,
  verifySlssteamInjected,
  getSlsPlayStatus,
  setSlsPlayStatus,
} from "../api";

export function Settings() {
  const [ryuCookie, setRyuCookie] = useState("");
  const [morrenusKey, setMorrenusKey] = useState("");
  const [message, setMessage] = useState("");
  const [deps, setDeps] = useState<any>(null);
  const [platform, setPlatform] = useState<any>(null);
  const [playNotOwned, setPlayNotOwned] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const load = async () => {
      const cookieResult = await loadRyuCookie();
      if (cookieResult.success && cookieResult.cookie) {
        setRyuCookie(cookieResult.cookie);
      }

      const depsResult = await checkDependencies();
      if (depsResult.success) setDeps(depsResult);

      const platformResult = await getPlatformSummary();
      setPlatform(platformResult);

      const playResult = await getSlsPlayStatus();
      if (playResult.success) setPlayNotOwned(playResult.enabled);
    };
    load();
  }, []);

  const handleSaveCookie = async () => {
    const result = await saveRyuCookie(ryuCookie);
    setMessage(result.message || result.error || "");
  };

  const handleSaveMorrenusKey = async () => {
    const result = await updateMorrenusKey(morrenusKey);
    setMessage(result.message || result.error || "");
  };

  const handleUpdateApis = async () => {
    setMessage("Updating APIs...");
    const result = await fetchFreeApisNow();
    if (result.success) {
      setMessage(`Updated: ${result.count} APIs loaded`);
    } else {
      setMessage(result.error || "Update failed");
    }
  };

  const handleInstallDeps = async () => {
    setInstalling(true);
    setMessage("Installing dependencies...");
    await installDependencies();
    const result = await checkDependencies();
    if (result.success) setDeps(result);
    setInstalling(false);
    setMessage("Installation complete. Check status below.");
  };

  const handleVerifyInjection = async () => {
    const result = await verifySlssteamInjected();
    if (result.already_ok) {
      setMessage("SLSsteam injection: OK");
    } else if (result.patched) {
      setMessage("SLSsteam injection: Patched steam.sh");
    } else {
      setMessage(`SLSsteam injection: ${result.error || "Failed"}`);
    }
  };

  const handleTogglePlayNotOwned = async (value: boolean) => {
    setPlayNotOwned(value);
    await setSlsPlayStatus(value);
  };

  return (
    <>
      <PanelSection title="API Credentials">
        <PanelSectionRow>
          <TextField
            label="Ryuu Cookie"
            value={ryuCookie}
            onChange={(e: any) => setRyuCookie(e?.target?.value ?? "")}
            bIsPassword
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={handleSaveCookie}>
            Save Cookie
          </ButtonItem>
        </PanelSectionRow>

        <PanelSectionRow>
          <TextField
            label="Morrenus API Key"
            value={morrenusKey}
            onChange={(e: any) => setMorrenusKey(e?.target?.value ?? "")}
            bIsPassword
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={handleSaveMorrenusKey}>
            Save Morrenus Key
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="APIs">
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={handleUpdateApis}>
            Update Free APIs
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="SLSsteam">
        <PanelSectionRow>
          <ToggleField
            label="Play Not Owned Games"
            checked={playNotOwned}
            onChange={handleTogglePlayNotOwned}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={handleVerifyInjection}>
            Verify SLSsteam Injection
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Dependencies">
        {deps && (
          <>
            <PanelSectionRow>
              <div
                style={{
                  fontSize: "12px",
                  color: deps.accela ? "#00cc00" : "#ff4444",
                }}
              >
                ACCELA:{" "}
                {deps.accela ? `Installed (${deps.accelaPath})` : "Not found"}
              </div>
            </PanelSectionRow>
            <PanelSectionRow>
              <div
                style={{
                  fontSize: "12px",
                  color: deps.slssteam ? "#00cc00" : "#ff4444",
                }}
              >
                SLSsteam:{" "}
                {deps.slssteam
                  ? `Installed (${deps.slssteamPath})`
                  : "Not found"}
              </div>
            </PanelSectionRow>
            <PanelSectionRow>
              <div
                style={{
                  fontSize: "12px",
                  color: deps.dotnet ? "#00cc00" : "#ff4444",
                }}
              >
                .NET Runtime: {deps.dotnet ? "Available" : "Not found"}
              </div>
            </PanelSectionRow>
          </>
        )}
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={handleInstallDeps}
            disabled={installing}
          >
            {installing ? "Installing..." : "Install / Reinstall Dependencies"}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      {platform && (
        <PanelSection title="Platform">
          <PanelSectionRow>
            <div style={{ fontSize: "11px", color: "#8b929a" }}>
              Steam: {platform.steam_root || "Not found"}
            </div>
          </PanelSectionRow>
        </PanelSection>
      )}

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
