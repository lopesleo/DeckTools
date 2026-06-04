# DeckTools — Decky Loader Plugin

## Overview

Plugin Decky Loader que replica a funcionalidade do LuaToolsLinux (plugin Millennium) para o Game Mode do Steam Deck. Permite gerenciar jogos via SLSsteam + ACCELA/DepotDownloaderMod sem sair do Game Mode.

## Understanding Summary

- **O que**: Plugin Decky Loader com feature parity do LuaToolsLinux
- **Por que**: LuaToolsLinux só funciona no Desktop Mode (via Millennium). Não existe equivalente para Game Mode
- **Para quem**: Usuários Steam Deck/SteamOS que usam SLSsteam + ACCELA
- **Fluxo principal**: "Comprar" na loja Steam (via SLSsteam) → jogo aparece no plugin → busca manifest automática via APIs → download via DepotDownloaderMod CLI
- **Escopo**: Game Mode exclusivo (Desktop já tem LuaToolsLinux)

## Architecture

### Stack

- **Backend**: Python (nativo do Decky Loader) — port do backend LuaToolsLinux
- **Frontend**: TypeScript + React (decky-frontend-lib)
- **Download engine**: DepotDownloaderMod CLI (padrão) + ACCELA GUI (fallback)

### Project Structure

```
decky-luatools/
├── plugin.json
├── main.py
├── backend/
│   ├── api_manifest.py
│   ├── downloads.py
│   ├── steam_utils.py
│   ├── slssteam_config.py
│   ├── fixes.py
│   ├── workshop.py
│   ├── paths.py
│   ├── installer.py
│   ├── http_client.py
│   └── config.py
├── src/
│   ├── index.tsx
│   ├── pages/
│   │   ├── GameList.tsx
│   │   ├── GameDetail.tsx
│   │   ├── Downloads.tsx
│   │   └── Settings.tsx
│   └── components/
│       ├── GameCard.tsx
│       ├── ProgressBar.tsx
│       └── ActionButton.tsx
├── package.json
└── tsconfig.json
```

### Communication

Frontend ↔ Backend via `serverAPI.callPluginMethod("function_name", {args})`.

## Data Flow

### 1. Game Detection

Scans:

- `{steam_root}/steamapps/appmanifest_*.acf` — jogos reconhecidos pelo Steam (via SLSsteam)
- `{steam_root}/depotcache/*.manifest` — manifests já baixados
- `loadedappids.txt` do LuaToolsLinux — histórico

Status por jogo: `instalado`, `manifest disponível`, `pendente`.

### 2. Manifest Auto-Discovery

```
AppID → itera APIs habilitadas (api.json)
  → Hubcap: GET https://hubcapmanifest.com/api/v1/manifest/{appid} (Authorization: Bearer {key})
  → Ryuu: GET com cookie session= no header
  → Resposta: ZIP (.manifest + .lua)
  → Extrai .manifest → {steam_root}/depotcache/
  → Processa .lua → config/stplug-in/{appid}.lua
```

Fallback entre APIs. Dual-URL com proxy para resiliência.

### 3. Game Download

**Modo CLI (padrão):**

```bash
dotnet DepotDownloader.dll \
  -app {appid} -depot {depotid} -manifest {manifestid} \
  -depotkeys steam.keys -manifestfile {arquivo.manifest} \
  -dir {steam_root}/steamapps/common/{installdir} -os linux
```

**Fallback ACCELA GUI:**

```bash
~/.local/share/ACCELA/run.sh [zip_path]
```

### 4. Progress Tracking

Dict `DOWNLOAD_STATE` com: `status`, `bytesRead`, `totalBytes`, `currentApi`, `error`.
Frontend faz polling via `callPluginMethod("get_download_status", {appid})`.

## Features

### Core

- Listagem de jogos "comprados" via SLSsteam
- Busca automática de manifest (Morrenus + Ryuu APIs)
- Download via DepotDownloaderMod CLI
- Progresso de download em tempo real
- Fallback para ACCELA GUI

### Game Management

- FakeAppId management (AppID 480 Spacewar)
- Access token management (config.yaml do SLSsteam)
- DLC management
- Game fixes (online-fix, etc.)
- Workshop downloader (via -pubfile)
- Achievements (SLScheevo integration)
- Game removal with manifest cleanup

### Configuration

- Ryuu cookie storage (`data/ryuu_cookie.txt`)
- Morrenus key in `api.json`
- Reaproveitamento de configs LuaToolsLinux existentes
- ACCELA/SLSsteam path detection
- Dependency check and auto-install via enter-the-wired

## Key Paths (Linux/SteamOS)

| Component       | Path                                        |
| --------------- | ------------------------------------------- |
| Steam root      | `~/.steam/steam` ou `~/.local/share/Steam`  |
| Manifests       | `{steam_root}/depotcache/*.manifest`        |
| SLSsteam config | `~/.config/SLSsteam/config.yaml`            |
| ACCELA          | `~/.local/share/ACCELA/` ou `~/accela/`     |
| SLSsteam        | `~/.local/share/SLSsteam/` ou `~/SLSsteam/` |
| Ryuu cookie     | `{plugin_dir}/data/ryuu_cookie.txt`         |
| API manifest    | `{plugin_dir}/api.json`                     |

## UI Design

### Game List (Main Screen)

- Search bar
- Game cards with status indicator (installed/downloading %/pending)
- Settings button

### Game Detail (Per Game)

- AppID, status, depot, manifest info
- Actions: Download/Update, Manage DLCs, Apply Fix, Workshop, FakeAppId/Token, Achievements, Remove

### Settings

- API credentials (Ryuu cookie, Morrenus key) — masked input
- Dependency status (SLSsteam, ACCELA, .NET)
- Reinstall dependencies button
- Update APIs button
- Open ACCELA GUI button

## Assumptions

- Steam Deck terá .NET runtime disponível (via ACCELA ou separado)
- Plugin Decky tem permissão para executar processos em background
- APIs de manifest (Morrenus, Ryuu) mantêm formato estável
- SLSsteam já injetado no Steam para "comprar" jogos
- config.yaml do SLSsteam mantém formato atual

## Decision Log

| #   | Decision                                             | Alternatives                  | Rationale                              |
| --- | ---------------------------------------------------- | ----------------------------- | -------------------------------------- |
| 1   | Flow: buy in store → list in plugin → download       | Manual AppID; external list   | Natural UX, integrates with SLSsteam   |
| 2   | Advanced options (depot, manifest, fixes)            | Simple install-only button    | Feature parity with LuaToolsLinux      |
| 3   | Same APIs as LuaToolsLinux (Morrenus + Ryuu)         | Morrenus only; custom API     | Proven behavior                        |
| 4   | Auto-install deps via enter-the-wired                | Require pre-install           | Better UX, self-contained              |
| 5   | Hierarchical menu (list → detail)                    | Single screen; tabs           | Best use of QAM space                  |
| 6   | DepotDownloaderMod CLI default + ACCELA GUI fallback | CLI only; GUI only            | Hybrid covers simple + advanced        |
| 7   | Port LuaToolsLinux Python backend                    | Rewrite; shell wrapper        | Tested logic, same formats, low risk   |
| 8   | Reuse LuaToolsLinux configs if present               | Always configure from scratch | Avoids rework for existing users       |
| 9   | Game Mode only                                       | Game Mode + Desktop           | Clear scope, Desktop has LuaToolsLinux |
