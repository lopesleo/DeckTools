# DeckTools

Decky Loader plugin for Steam Deck that manages game installations via **SLSsteam + ACCELA/DepotDownloaderMod** in Game Mode.

## Features

- **Download game manifests** from multiple APIs (Morrenus, Ryuu, Sushi) with automatic fallback
- **Auto-configure SLSsteam** (FakeAppId, Token, DLCs, Play Not Owned)
- **Download game files** via DepotDownloaderMod (.NET-based depot downloader)
- **Goldberg Steam Emulator** integration for offline play
- **Game fixes** — apply community fixes (generic, online/unsteam)
- **Workshop downloads** via DepotDownloaderMod
- **Auto-detect AppID** from Steam Store page or library
- **Search games** by name via Morrenus database
- **Update checking** for installed games
- **Full uninstall** with optional Proton prefix removal
- **PT-BR / English** interface

## Installation

### From Release (recommended)

1. Make sure [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) is installed on your Steam Deck
2. Download the latest `DeckTools.zip` from [Releases](https://github.com/lopesleo/DeckTools/releases)
3. Extract the zip — you'll get a `DeckTools/` folder
4. Copy the `DeckTools/` folder to your Steam Deck:
   ```
   /home/deck/homebrew/plugins/DeckTools/
   ```
   You can use SCP, SFTP, or a USB drive:
   ```bash
   scp -r DeckTools/ deck@<DECK_IP>:/home/deck/homebrew/plugins/
   ```
5. On the Deck, set correct permissions and restart Decky:
   ```bash
   sudo chown -R root:root /home/deck/homebrew/plugins/DeckTools
   sudo chmod -R 755 /home/deck/homebrew/plugins/DeckTools
   sudo systemctl restart plugin_loader
   ```
6. Open the **Quick Access Menu** (QAM) — DeckTools should appear with a download icon

### From Source

1. Clone the repo:
   ```bash
   git clone https://github.com/lopesleo/DeckTools.git
   cd DeckTools
   ```
2. Install dependencies and build:
   ```bash
   pnpm install
   pnpm run build
   ```
3. Copy `plugin.json`, `main.py`, `package.json`, `dist/`, and `backend/` to the Deck:
   ```
   /home/deck/homebrew/plugins/DeckTools/
   ```
4. Set permissions and restart Decky (same as step 5 above)

## Usage

### Adding a Game

1. On your Steam Deck, browse the **Steam Store** and open the game page you want
2. Open the **QAM** and tap the **DeckTools** plugin
3. The **AppID** auto-fills from the store page
4. Tap **Download Manifest** — the plugin downloads the manifest, installs lua scripts, configures SLSsteam, and optionally downloads game files
5. **Restart Steam** when the download finishes

You can also search by game name using the **Search by Name** field (uses the Morrenus database).

### Game Management

After adding a game, tap it in the game list to access:

| Feature | Description |
|---------|-------------|
| **FakeAppId** | Assigns a different AppID (default: 480/Spacewar) so Steam recognizes the game |
| **Token** | Adds an authentication token for the game in SLSsteam config |
| **DLCs** | Fetches and adds all known DLCs for the game |
| **Goldberg** | Replaces `steam_api.dll` with Goldberg emulator for offline play |
| **Check for Fixes** | Downloads community fixes (generic or online/unsteam) |
| **Linux Native Fix** | Sets executable permissions (`chmod`) on game files |
| **Repair ACF** | Regenerates the appmanifest and restarts Steam |
| **Check for Updates** | Compares local depot manifests with server versions |
| **Full Uninstall** | Removes game files, manifests, config entries, and optionally the Proton prefix |

### Settings

- **API Credentials** — Configure Ryuu cookie and Morrenus API key for premium API access
- **Update Free APIs** — Refresh the list of free manifest sources
- **Play Not Owned** — Toggle SLSsteam's PlayNotOwned feature
- **Verify Injection** — Check if SLSsteam is properly injected into `steam.sh`
- **Dependencies** — Install/reinstall ACCELA, SLSsteam, and .NET runtime

## Troubleshooting

- **Game not showing after download?** Restart Steam
- **Download failed?** Check your API credentials in Settings
- **Game won't launch?** Try applying FakeAppId (480) and Token
- **DLC not working?** Remove and re-add DLCs
- **Proton issues?** Try the Linux Native Fix or repair the ACF
- **Dependencies missing?** Go to Settings > Install Dependencies

## Development

```bash
pnpm install
pnpm run build    # Build once
pnpm run watch    # Watch mode
```

The backend is Python (async, required by Decky) in `backend/`. The frontend is TypeScript + React in `src/`.

## License

MIT
