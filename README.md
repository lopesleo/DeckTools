# DeckTools

Decky Loader plugin for Steam Deck that helps manage game libraries and configurations in Game Mode.

## Features

- **Game library management** with multiple API sources
- **SLSsteam configuration** manager (FakeAppId, Token, DLC entries)
- **Depot management** via DepotDownloaderMod
- **Steam emulator profiles** (Goldberg integration)
- **Achievement generation** via SLScheevo (per-game and batch sync)
- **Community fixes** — apply game-specific patches
- **Workshop content** downloads
- **Auto-detect AppID** from Steam Store or library pages
- **Game search** by name
- **Update checking** for managed games
- **PT-BR / English** interface

## Installation

### From Release (recommended)

1. Install [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) on your Steam Deck
2. Download the latest `DeckTools.zip` from [Releases](https://github.com/lopesleo/DeckTools/releases)
3. Extract — you'll get a `DeckTools/` folder
4. Copy to your Steam Deck:
   ```
   /home/deck/homebrew/plugins/DeckTools/
   ```
   Example via SCP:
   ```bash
   scp -r DeckTools/ deck@<DECK_IP>:/home/deck/homebrew/plugins/
   ```
5. Set permissions and restart Decky:
   ```bash
   sudo chown -R root:root /home/deck/homebrew/plugins/DeckTools
   sudo chmod -R 755 /home/deck/homebrew/plugins/DeckTools
   sudo systemctl restart plugin_loader
   ```
6. Open the **Quick Access Menu** (QAM) — DeckTools appears with a download icon

### From Source

```bash
git clone https://github.com/lopesleo/DeckTools.git
cd DeckTools
pnpm install
pnpm run build
```

Copy `plugin.json`, `main.py`, `package.json`, `dist/`, and `backend/` to the Deck at `/home/deck/homebrew/plugins/DeckTools/`, then set permissions (step 5 above).

## Usage

1. Open the Steam Store page for a game
2. Open QAM > DeckTools — the AppID auto-fills
3. Tap **Download Manifest**
4. Restart Steam when done

### Game Options

| Option               | Description                                     |
| -------------------- | ----------------------------------------------- |
| **FakeAppId**        | Set an alternative AppID for compatibility      |
| **Token**            | Manage authentication tokens in SLSsteam config |
| **DLCs**             | Manage DLC entries for a game                   |
| **Goldberg**         | Toggle Goldberg Steam emulator profile          |
| **Achievements**     | Generate achievement files via SLScheevo        |
| **Fixes**            | Apply community game patches                    |
| **Linux Native Fix** | Set executable permissions on game files        |
| **Repair ACF**       | Regenerate appmanifest                          |

### Settings

- API credentials (Ryuu, Morrenus)
- Free API list refresh
- SLSsteam injection verification
- Dependency management (ACCELA, SLSsteam, .NET)
- Language switcher (EN / PT-BR)

## Development

```bash
pnpm install
pnpm run build    # Build once
pnpm run watch    # Watch mode
```

Backend: Python (async) in `backend/`. Frontend: TypeScript + React in `src/`.

## Credits & Acknowledgments

DeckTools builds upon and integrates with several community projects:

| Project                                                                    | Author            | Role                                                                                           |
| -------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| [LuaToolsLinux](https://github.com/Star123451/LuaToolsLinux)               | Star123451        | Original project that inspired DeckTools. Core manifest handling and API logic derived from it |
| [SLSsteam](https://github.com/nichelimux/SLSsteam)                         | nichelimux        | Steam emulator — DeckTools manages its configuration, tokens, FakeAppIds, and DLCs             |
| [SLScheevo](https://github.com/xamionex/SLScheevo)                         | xamionex          | Achievement file generator for SLSsteam-managed games                                          |
| [ACCELA](https://github.com/nichelimux/ACCELA)                             | nichelimux        | Dependency installer and package manager (Goldberg, DepotDownloader, .NET)                     |
| [Goldberg Steam Emulator](https://gitlab.com/nichelimux/goldberg_emulator) | nichelimux        | Steam API emulator DLLs, bundled through ACCELA                                                |
| [enter-the-wired](https://github.com/Star123451/enter-the-wired)           | Star123451        | Automated dependency installation script                                                       |
| [DepotDownloader](https://github.com/SteamRE/DepotDownloader)              | SteamRE           | Steam depot content downloader                                                                 |
| [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)          | SteamDeckHomebrew | Plugin platform for Steam Deck Game Mode                                                       |
| [Morrenus](https://manifest.morrenus.xyz)                                  | Morrenus          | Manifest API and game search service                                                           |

## Disclaimer

This tool is provided for educational and personal use only. Users are responsible for complying with all applicable laws and terms of service. The authors do not condone or encourage any form of software piracy.

## License

MIT
