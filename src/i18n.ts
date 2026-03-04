/**
 * Simple i18n system for DeckTools.
 * Detects Steam/browser locale and provides translated strings.
 * Uses a React hook (useT) so components re-render on language change.
 */

import { useState, useEffect } from "react";

type Lang = "en" | "pt-BR";

const strings: Record<Lang, Record<string, string>> = {
  en: {
    // GameList
    addGame: "Add Game",
    steamAppId: "Steam AppID",
    searchByName: "Search by Name",
    searching: "Searching...",
    searchMorrenus: "Search Morrenus",
    downloadManifest: "Download Manifest",
    myGames: "My Games",
    sort: "Sort",
    noGamesYet: "No ACCELA games yet",
    noGamesMatch: "No games match your search",
    loadingGames: "Loading games...",
    activeDownloads: "Active Downloads",
    settings: "Settings",
    refresh: "Refresh",
    help: "Help",
    results: "results — tap to select",
    moreResults: "more results — refine your search",
    selected: "Selected",
    invalidAppId: "Invalid AppID",
    startingDownload: "Starting download...",
    error: "Error",
    gameName: "Game name",
    doneRestartSteam: "Done! Restart Steam to see the game.",
    downloadFailed: "Download failed",
    downloadCancelled: "Download cancelled",

    // GameDetail
    download: "Download",
    redownloadManifest: "Re-download Manifest",
    checkForUpdates: "Check for Updates",
    checking: "Checking...",
    updateNow: "Update Now",
    upToDate: "Up to Date",
    redownloadDesc: "Re-downloads manifest and game files",
    cancelDownload: "Cancel Download",
    downloadComplete: "Download complete!",
    gameManagement: "Game Management",
    removeFakeAppId: "Remove FakeAppId",
    addFakeAppId: "Add FakeAppId",
    removeToken: "Remove Token",
    addToken: "Add Token",
    removeDlcs: "Remove DLCs",
    addDlcs: "Add DLCs",
    found: "found",
    applyGoldberg: "Apply Goldberg",
    removeGoldberg: "Remove Goldberg",
    restoreOriginalDlls: "Restore original steam_api DLLs",
    replaceWithGoldberg: "Replace steam_api with Goldberg emulator",
    fixes: "Fixes",
    checkForFixes: "Check for Fixes",
    applyGenericFix: "Apply Generic Fix",
    applyOnlineFix: "Apply Online Fix (Unsteam)",
    noFixesAvailable: "No fixes available",
    applyLinuxNativeFix: "Apply Linux Native Fix (chmod)",
    installedFixes: "Installed Fixes",
    removeFix: "Remove Fix",
    removeAllFixes: "Remove All Fixes",
    fixApplied: "Applied: {0}",
    fixFiles: "{0} files",
    cancelFix: "Cancel Fix",
    extracting: "Extracting...",
    repairAppmanifest: "Repair Appmanifest (ACF)",
    regeneratesAcf: "Regenerates ACF and restarts Steam",
    dangerZone: "Danger Zone",
    removeLuaScript: "Remove Lua Script",
    removeProtonPrefix: "Remove Proton prefix",
    deleteCompatdata: "Delete compatdata (saves, config)",
    confirmFullUninstall: "CONFIRM Full Uninstall",
    fullUninstall: "Full Uninstall",
    confirmUninstallMsg: "Press again to confirm full uninstall",
    clickToConfirm: "Click to confirm — this cannot be undone",
    removesGameFiles: "Removes game files, manifests, and config entries",
    back: "Back",
    installed: "Installed",
    notInstalled: "Not installed",
    manifestOnly: "Manifest only",
    uninstalling: "Uninstalling...",
    fetchingDlcs: "Fetching DLCs...",
    checkingForFixes: "Checking for fixes...",
    installPathNotFound: "Install path not found",
    repairingAcf: "Repairing ACF...",
    removingGoldberg: "Removing Goldberg...",
    applyingGoldberg: "Applying Goldberg...",
    luaScriptRemoved: "Lua script removed",
    permissionsSet: "Permissions set on {0} files",
    acfRepaired: "ACF repaired. Steam will restart.",
    repairFailed: "Repair failed",
    gameFullyUninstalled: "Game fully uninstalled",
    configRemoved: "Config removed (no game files found to delete)",
    failedToStartDownload: "Failed to start download",
    failedToCheck: "Failed to check",

    // Downloads
    manualDownload: "Manual Download",
    workshopDownload: "Workshop Download",
    workshopItemId: "Workshop Item ID",
    downloadWorkshopItem: "Download Workshop Item",
    cancelWorkshopDownload: "Cancel Workshop Download",
    enterValidAppId: "Enter a valid AppID",
    enterValidIds: "Enter valid AppID and Workshop Item ID",
    cancel: "Cancel",

    // Download status
    statusDownloading: "Downloading...",
    statusChecking: "Checking",
    statusProcessing: "Processing manifest...",
    statusConfiguring: "Configuring SLSsteam...",
    statusDownloadingGame: "Downloading game",
    statusDownloadingGameFiles: "Downloading game files...",
    statusInstalling: "Installing...",
    statusQueued: "Starting download...",

    // Settings
    apiCredentials: "API Credentials",
    ryuCookie: "Ryuu Cookie",
    saveCookie: "Save Cookie",
    morrenusApiKey: "Morrenus API Key",
    saveMorrenusKey: "Save Morrenus Key",
    apis: "APIs",
    updateFreeApis: "Update Free APIs",
    updatingApis: "Updating APIs...",
    updatedApisLoaded: "Updated: {0} APIs loaded",
    updateFailed: "Update failed",
    slssteam: "SLSsteam",
    playNotOwnedGames: "Play Not Owned Games",
    verifySlssteamInjection: "Verify SLSsteam Injection",
    slssteamInjectionOk: "SLSsteam injection: OK",
    slssteamInjectionPatched: "SLSsteam injection: Patched steam.sh",
    slssteamInjection: "SLSsteam injection",
    dependencies: "Dependencies",
    installReinstallDeps: "Install / Reinstall Dependencies",
    installing: "Installing...",
    installingDeps: "Installing dependencies...",
    installComplete: "Installation complete. Check status below.",
    platform: "Platform",
    languageIdioma: "Language / Idioma",
    currentEnglish: "Current: English",
    currentPortuguese: "Atual: Português (BR)",
    notFound: "Not found",

    // GameCard
    disabled: "Disabled",
    pending: "Pending",
    progress: "Progress",

    // Toasts
    toastCheckingUpdates: "Checking for Updates",
    toastUpdateAvailable: "Update Available!",
    toastDepotsChanged: "{0} depot(s) changed — re-download to update",
    toastUpToDate: "Up to Date",
    toastIsUpToDate: "{0} is up to date",
    toastUpdateCheckFailed: "Update Check Failed",
    toastSuccess: "Success",
    toastError: "Error",
    toastFakeAppIdAdded: "FakeAppId added ({0})",
    toastFakeAppIdRemoved: "FakeAppId removed",
    toastTokenAdded: "Token added",
    toastTokenRemoved: "Token removed",
    toastDlcsAdded: "{0} DLCs added",
    toastDlcsRemoved: "DLCs removed",
    toastDlcsNoneFound: "No DLCs found for this game",
    toastGoldbergApplied: "Goldberg applied",
    toastGoldbergRemoved: "Goldberg removed",
    toastLuaRemoved: "Lua script removed",
    toastNativeFixApplied: "Permissions set on {0} files",
    toastAcfRepaired: "ACF repaired — Steam will restart",
    toastFixesFound: "Fixes found",
    toastNoFixes: "No fixes available",
    toastUninstalled: "Game uninstalled",
    toastFixRemoved: "Fix removed ({0} files deleted)",
    toastFixRemoving: "Removing fix...",
    toastCookieSaved: "Cookie saved",
    toastApiKeySaved: "API key saved",
    toastApisUpdated: "{0} APIs loaded",
    toastInjectionOk: "SLSsteam injection: OK",
    toastInjectionPatched: "SLSsteam: steam.sh patched",
    toastDepsInstalled: "Dependencies installed",
    toastDownloadStarted: "Download started",
    toastDownloadComplete: "Download complete!",
    toastDownloadFailed: "Download failed",
    uninstallWarnings: "Uninstalled (with warnings: {0})",

    // Search
    noGamesFound: "No games found",
    searchFailed: "Search failed",
    enterAtLeast2Chars: "Enter at least 2 characters",
  },

  "pt-BR": {
    // GameList
    addGame: "Adicionar Jogo",
    steamAppId: "Steam AppID",
    searchByName: "Buscar por Nome",
    searching: "Buscando...",
    searchMorrenus: "Buscar Morrenus",
    downloadManifest: "Baixar Manifesto",
    myGames: "Meus Jogos",
    sort: "Ordenar",
    noGamesYet: "Nenhum jogo ACCELA ainda",
    noGamesMatch: "Nenhum jogo corresponde à busca",
    loadingGames: "Carregando jogos...",
    activeDownloads: "Downloads Ativos",
    settings: "Configurações",
    refresh: "Atualizar",
    help: "Ajuda",
    results: "resultados — toque para selecionar",
    moreResults: "mais resultados — refine sua busca",
    selected: "Selecionado",
    invalidAppId: "AppID inválido",
    startingDownload: "Iniciando download...",
    error: "Erro",
    gameName: "Nome do jogo",
    doneRestartSteam: "Pronto! Reinicie o Steam para ver o jogo.",
    downloadFailed: "Download falhou",
    downloadCancelled: "Download cancelado",

    // GameDetail
    download: "Download",
    redownloadManifest: "Re-baixar Manifesto",
    checkForUpdates: "Verificar Atualizações",
    checking: "Verificando...",
    updateNow: "Atualizar Agora",
    upToDate: "Atualizado",
    redownloadDesc: "Re-baixa manifesto e arquivos do jogo",
    cancelDownload: "Cancelar Download",
    downloadComplete: "Download concluído!",
    gameManagement: "Gerenciamento",
    removeFakeAppId: "Remover FakeAppId",
    addFakeAppId: "Adicionar FakeAppId",
    removeToken: "Remover Token",
    addToken: "Adicionar Token",
    removeDlcs: "Remover DLCs",
    addDlcs: "Adicionar DLCs",
    found: "encontrados",
    applyGoldberg: "Aplicar Goldberg",
    removeGoldberg: "Remover Goldberg",
    restoreOriginalDlls: "Restaurar DLLs originais do steam_api",
    replaceWithGoldberg: "Substituir steam_api pelo emulador Goldberg",
    fixes: "Correções",
    checkForFixes: "Verificar Correções",
    applyGenericFix: "Aplicar Correção Genérica",
    applyOnlineFix: "Aplicar Online Fix (Unsteam)",
    noFixesAvailable: "Nenhuma correção disponível",
    applyLinuxNativeFix: "Aplicar Fix Nativo Linux (chmod)",
    installedFixes: "Correções Instaladas",
    removeFix: "Remover Correção",
    removeAllFixes: "Remover Todas as Correções",
    fixApplied: "Aplicado: {0}",
    fixFiles: "{0} arquivos",
    cancelFix: "Cancelar Correção",
    extracting: "Extraindo...",
    repairAppmanifest: "Reparar Appmanifest (ACF)",
    regeneratesAcf: "Regenera ACF e reinicia o Steam",
    dangerZone: "Zona de Perigo",
    removeLuaScript: "Remover Script Lua",
    removeProtonPrefix: "Remover prefixo Proton",
    deleteCompatdata: "Deletar compatdata (saves, config)",
    confirmFullUninstall: "CONFIRMAR Desinstalação",
    fullUninstall: "Desinstalação Completa",
    confirmUninstallMsg: "Pressione novamente para confirmar",
    clickToConfirm: "Clique para confirmar — isso não pode ser desfeito",
    removesGameFiles: "Remove arquivos do jogo, manifestos e config",
    back: "Voltar",
    installed: "Instalado",
    notInstalled: "Não instalado",
    manifestOnly: "Apenas manifesto",
    uninstalling: "Desinstalando...",
    fetchingDlcs: "Buscando DLCs...",
    checkingForFixes: "Verificando correções...",
    installPathNotFound: "Caminho de instalação não encontrado",
    repairingAcf: "Reparando ACF...",
    removingGoldberg: "Removendo Goldberg...",
    applyingGoldberg: "Aplicando Goldberg...",
    luaScriptRemoved: "Script Lua removido",
    permissionsSet: "Permissões definidas em {0} arquivos",
    acfRepaired: "ACF reparado. Steam vai reiniciar.",
    repairFailed: "Reparo falhou",
    gameFullyUninstalled: "Jogo desinstalado completamente",
    configRemoved: "Config removida (sem arquivos de jogo para deletar)",
    failedToStartDownload: "Falha ao iniciar download",
    failedToCheck: "Falha ao verificar",

    // Downloads
    manualDownload: "Download Manual",
    workshopDownload: "Download Workshop",
    workshopItemId: "ID do Item Workshop",
    downloadWorkshopItem: "Baixar Item Workshop",
    cancelWorkshopDownload: "Cancelar Download Workshop",
    enterValidAppId: "Insira um AppID válido",
    enterValidIds: "Insira AppID e ID do Item Workshop válidos",
    cancel: "Cancelar",

    // Download status
    statusDownloading: "Baixando...",
    statusChecking: "Verificando",
    statusProcessing: "Processando manifesto...",
    statusConfiguring: "Configurando SLSsteam...",
    statusDownloadingGame: "Baixando jogo",
    statusDownloadingGameFiles: "Baixando arquivos do jogo...",
    statusInstalling: "Instalando...",
    statusQueued: "Iniciando download...",

    // Settings
    apiCredentials: "Credenciais de API",
    ryuCookie: "Cookie Ryuu",
    saveCookie: "Salvar Cookie",
    morrenusApiKey: "Chave API Morrenus",
    saveMorrenusKey: "Salvar Chave Morrenus",
    apis: "APIs",
    updateFreeApis: "Atualizar APIs Gratuitas",
    updatingApis: "Atualizando APIs...",
    updatedApisLoaded: "Atualizado: {0} APIs carregadas",
    updateFailed: "Atualização falhou",
    slssteam: "SLSsteam",
    playNotOwnedGames: "Jogar Jogos Não Adquiridos",
    verifySlssteamInjection: "Verificar Injeção SLSsteam",
    slssteamInjectionOk: "Injeção SLSsteam: OK",
    slssteamInjectionPatched: "Injeção SLSsteam: steam.sh atualizado",
    slssteamInjection: "Injeção SLSsteam",
    dependencies: "Dependências",
    installReinstallDeps: "Instalar / Reinstalar Dependências",
    installing: "Instalando...",
    installingDeps: "Instalando dependências...",
    installComplete: "Instalação completa. Verifique o status abaixo.",
    platform: "Plataforma",
    languageIdioma: "Language / Idioma",
    currentEnglish: "Current: English",
    currentPortuguese: "Atual: Português (BR)",
    notFound: "Não encontrado",

    // GameCard
    disabled: "Desativado",
    pending: "Pendente",
    progress: "Progresso",

    // Toasts
    toastCheckingUpdates: "Verificando Atualizações",
    toastUpdateAvailable: "Atualização Disponível!",
    toastDepotsChanged: "{0} depot(s) alterados — re-baixe para atualizar",
    toastUpToDate: "Atualizado",
    toastIsUpToDate: "{0} está atualizado",
    toastUpdateCheckFailed: "Verificação de Atualização Falhou",
    toastSuccess: "Sucesso",
    toastError: "Erro",
    toastFakeAppIdAdded: "FakeAppId adicionado ({0})",
    toastFakeAppIdRemoved: "FakeAppId removido",
    toastTokenAdded: "Token adicionado",
    toastTokenRemoved: "Token removido",
    toastDlcsAdded: "{0} DLCs adicionados",
    toastDlcsRemoved: "DLCs removidos",
    toastDlcsNoneFound: "Nenhum DLC encontrado para este jogo",
    toastGoldbergApplied: "Goldberg aplicado",
    toastGoldbergRemoved: "Goldberg removido",
    toastLuaRemoved: "Script Lua removido",
    toastNativeFixApplied: "Permissões definidas em {0} arquivos",
    toastAcfRepaired: "ACF reparado — Steam vai reiniciar",
    toastFixesFound: "Correções encontradas",
    toastNoFixes: "Nenhuma correção disponível",
    toastUninstalled: "Jogo desinstalado",
    toastFixRemoved: "Correção removida ({0} arquivos deletados)",
    toastFixRemoving: "Removendo correção...",
    toastCookieSaved: "Cookie salvo",
    toastApiKeySaved: "Chave API salva",
    toastApisUpdated: "{0} APIs carregadas",
    toastInjectionOk: "Injeção SLSsteam: OK",
    toastInjectionPatched: "SLSsteam: steam.sh atualizado",
    toastDepsInstalled: "Dependências instaladas",
    toastDownloadStarted: "Download iniciado",
    toastDownloadComplete: "Download concluído!",
    toastDownloadFailed: "Download falhou",
    uninstallWarnings: "Desinstalado (com avisos: {0})",

    // Search
    noGamesFound: "Nenhum jogo encontrado",
    searchFailed: "Busca falhou",
    enterAtLeast2Chars: "Insira pelo menos 2 caracteres",
  },
};

// --- Reactive language system ---
let currentLang: Lang = "en";
const listeners: Set<() => void> = new Set();

function detectLanguage(): Lang {
  try {
    const nav = navigator?.language || navigator?.languages?.[0] || "";
    if (nav.startsWith("pt")) return "pt-BR";
  } catch {
    // ignore
  }
  return "en";
}

// Try to load saved preference, fallback to auto-detect
try {
  const saved = localStorage.getItem("decktools_lang") as Lang | null;
  currentLang =
    saved && (saved === "en" || saved === "pt-BR") ? saved : detectLanguage();
} catch {
  currentLang = detectLanguage();
}

export function setLanguage(lang: Lang) {
  currentLang = lang;
  try {
    localStorage.setItem("decktools_lang", lang);
  } catch {}
  listeners.forEach((fn) => fn());
}

export function getLanguage(): Lang {
  return currentLang;
}

function translate(key: string, ...args: (string | number)[]): string {
  let s = strings[currentLang]?.[key] || strings.en[key] || key;
  args.forEach((arg, i) => {
    s = s.replace(`{${i}}`, String(arg));
  });
  return s;
}

/** React hook — returns a t() function that re-renders the component on language change. */
export function useT(): (key: string, ...args: (string | number)[]) => string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return translate;
}
