# Shipping Arcadium

Arcadium ships as four things, all built from the same web app:

| What | Built with | Lives in |
| --- | --- | --- |
| Desktop app on Steam (Windows, macOS, Linux, Steam Deck) | Electron | `desktop/` |
| iPhone / iPad app | Capacitor | `ios/` (generated) |
| Android app | Capacitor | `android/` (generated) |
| Match server for online play | Node in Docker | `server/`, `Dockerfile` |

Every client starts from the web build in `dist/`, made by `npm run build` in the repo root.

> Prices and store rules below were right when this was written. Stores change them, so check
> the current numbers before you budget or submit.

---

## 0. Before any release: point the game at your servers

The list of match servers is baked into the web build. Set it when you build:

```sh
VITE_GAME_SERVERS=wss://us.example.com/play,wss://eu.example.com/play npm run build
```

The game pings every server in the list and joins the fastest one. Without the variable it
falls back to `ws://localhost:8787/play`, which is only useful on your own machine. Offline
play works either way.

Store builds must use `wss://` (encrypted). iOS refuses unencrypted connections outright, and
Android blocks them from the app's secure origin.

---

## 1. Match server

The server runs matches and nothing else: no accounts, no database, no economy. Players' coins
and unlocks live on their devices. It only relays turn commands between players, so it needs
very little CPU and bandwidth.

### What you need

- A small Linux VPS per region (1 vCPU, 1 GB RAM is plenty to start), about $4–6 a month from
  Hetzner, DigitalOcean, Vultr, Linode or similar. Put one near each player base, for example
  one in the US and one in Europe.
- A domain name, with one DNS `A` record per server: `us.example.com`, `eu.example.com`.

### Set up one server

1. Install Docker on the VPS: `curl -fsSL https://get.docker.com | sh`
2. Copy the repo onto it (for example `git clone`).
3. Next to the repo's `Dockerfile`, create `compose.yaml`:

   ```yaml
   services:
     server:
       build: .
       restart: unless-stopped
       environment:
         REGION: us        # shown to players; use eu, asia, ... on the other servers
     caddy:
       image: caddy:2
       restart: unless-stopped
       ports: ["80:80", "443:443"]
       volumes:
         - ./Caddyfile:/etc/caddy/Caddyfile
         - caddy_data:/data
   volumes:
     caddy_data: {}
   ```

   and `Caddyfile`:

   ```
   us.example.com {
       reverse_proxy server:8787
   }
   ```

   Caddy gets and renews the TLS certificate by itself, and passes WebSocket connections
   through untouched. That is what turns the server's plain `ws://` into the `wss://` the
   apps need.
4. Start it: `docker compose up -d --build`
5. Check it: `curl https://us.example.com/healthz` should answer. `docker compose ps` shows the
   container's health; Docker also checks `/healthz` itself every 30 seconds.

Only ports 80 and 443 need to be open in the firewall. Port 8787 stays private between the two
containers.

The image reads two environment variables: `PORT` (default `8787`) and `REGION` (default
`local`).

### Updating

```sh
git pull && docker compose up -d --build
```

Restarting ends the matches running on that server, so update at a quiet hour. When the
network messages change (`NET.protocolVersion` in `src/games/landgrab/config.ts`), update the
servers and release the new clients together.

### What it costs

- About $5 a month per region. Two regions: roughly $120 a year.
- Bandwidth is not a concern: a player uses a few MB per hour of play, and these plans include
  terabytes of traffic.
- To see how many players a box holds, run a few bot-filled rooms and watch `docker stats`.
  Add a second box in a region only when CPU stays high.

---

## 2. Steam (Windows, macOS, Linux, Steam Deck)

### One-time setup

1. Sign up at [partner.steamgames.com](https://partner.steamgames.com) (Steamworks), fill in
   the tax and bank forms, and pay the Steam Direct fee: $100 per game, paid back to you once
   the game earns $1,000.
2. Steam gives you an **App ID**. Under *SteamPipe → Depots*, create three depots (Windows,
   macOS, Linux) and set each one's operating system.
3. Under *Installation → General*, add one launch option per OS:
   - Windows: `Arcadium.exe`
   - macOS: `Arcadium.app`
   - Linux / Steam Deck: `arcadium`

### Build the desktop app

The desktop wrapper has its own `package.json` with Electron and electron-builder. They are not
part of the root install, so install them once:

```sh
cd desktop
npm install
```

Then, with `VITE_GAME_SERVERS` set as in section 0:

```sh
npm run pack:win     # -> desktop/out/win-unpacked/
npm run pack:mac     # -> desktop/out/mac-universal/   (runs on Intel and Apple Silicon)
npm run pack:linux   # -> desktop/out/linux-unpacked/
```

Each command builds the web app, copies it into `desktop/app`, and packages an unpacked folder.
Steam ships that folder as is, so there are no installers. Build each platform on its own OS
(a Mac for the macOS build; a CI service with Windows, macOS and Linux runners works well).

For the app icon, put a 1024×1024 `icon.png` in `desktop/build/` before packaging.

While developing, run `npm run dev` in the repo root and `npm run dev` in `desktop/`: the app
loads the live dev server and F12 opens the developer tools. `npm start` in `desktop/` runs
the real production build instead.

Keys: F11 or Alt+Enter toggles fullscreen.

### Upload with SteamPipe

1. Download the Steamworks SDK and use its `steamcmd` (in `tools/ContentBuilder`).
2. Create `app_build.vdf` (replace the IDs with yours):

   ```
   "AppBuild"
   {
       "AppID" "1234560"
       "Desc" "Arcadium 0.1.0"
       "ContentRoot" "/path/to/arcadium/desktop/out/"
       "BuildOutput" "./output/"
       "Depots"
       {
           "1234561" { "FileMapping" { "LocalPath" "win-unpacked/*"  "DepotPath" "." "recursive" "1" } }
           "1234562" { "FileMapping" { "LocalPath" "mac-universal/*" "DepotPath" "." "recursive" "1" } }
           "1234563" { "FileMapping" { "LocalPath" "linux-unpacked/*" "DepotPath" "." "recursive" "1" } }
       }
   }
   ```
3. Upload: `steamcmd +login <your build account> +run_app_build /path/to/app_build.vdf +quit`
4. In Steamworks under *SteamPipe → Builds*, set the new build live on a beta branch, test it,
   then make it live on `default`.

### Cloud saves (Steam Auto-Cloud)

The desktop app keeps its save files in one folder, so Steam can sync them with no code:

| OS | Save folder |
| --- | --- |
| Windows | `%APPDATA%\Arcadium\saves` |
| macOS | `~/Library/Application Support/Arcadium/saves` |
| Linux / Steam Deck | `~/.config/Arcadium/saves` |

In Steamworks under *Application → Steam Cloud*:

1. Set a byte quota per user (1 MB is plenty) and a file limit (10).
2. Turn on Auto-Cloud and add one root path per OS, each with pattern `*`:
   - Windows: root `WinAppDataRoaming`, subdirectory `Arcadium/saves`
   - macOS: root `MacAppSupport`, subdirectory `Arcadium/saves`
   - Linux: root `LinuxHome`, subdirectory `.config/Arcadium/saves`
3. Publish the changes. A player's progress now follows them between PCs and their Steam Deck.

### Steam Deck tips

- The app detects the Deck (and SteamOS in general) and starts fullscreen at the Deck's
  1280×800.
- The d-pad and left stick steer, so pick the **Gamepad** template as the default controller
  layout in Steamworks (*Steam Input*).
- Ship the native Linux build; the Deck runs it directly. Test on real hardware with the
  Steamworks *SteamOS Devkit Client* before asking Valve for a Deck Verified review. Valve
  checks text size at 1280×800, controller-only play, and that the game opens without a
  launcher.
- If the window stays black in Game Mode, add `--ozone-platform=x11` to the Linux launch option's
  arguments.
- Typing the profile name: players can open Steam's on-screen keyboard with Steam + X.

### Later: achievements and the Steam overlay

The game doesn't talk to Steam yet. When you want achievements, add
[steamworks.js](https://github.com/ceifa/steamworks.js) to `desktop/`:

1. `npm install steamworks.js` in `desktop/`.
2. In `main.cjs`, call `require('steamworks.js').init(<your App ID>)` once at startup, and
   `require('steamworks.js').electronEnableSteamOverlay()` before creating the window to get the
   Shift+Tab overlay.
3. Expose an `unlockAchievement(id)` call through `preload.cjs`, and have it call
   `client.achievement.activate(id)` in the main process.
4. Add `asarUnpack: ["node_modules/steamworks.js/**"]` to `electron-builder.yml`, because the
   native Steam library can't load from inside the app archive.

### macOS signing

Steam installs games without Apple's quarantine flag, so a build without a Developer ID runs.
Apple Silicon Macs still refuse code with no signature at all: if electron-builder reports that
it skipped signing, add `identity: "-"` under `mac:` in `electron-builder.yml` for a free ad-hoc
signature. With an Apple Developer ID, set `CSC_LINK` and `CSC_KEY_PASSWORD` before
`npm run pack:mac` to sign properly instead.

---

## 3. iPhone and iPad (App Store)

### What you need

- A Mac with the latest Xcode.
- The Apple Developer Program: $99 a year.

### First time

```sh
npm run build
npx cap add ios        # creates the ios/ project (only once)
npx cap open ios       # opens it in Xcode
```

In Xcode, select the **App** target:

1. *Signing & Capabilities*: choose your team. The bundle identifier comes from `appId` in
   `capacitor.config.ts` (`com.arcadium.app` is a placeholder; change it to a domain you own
   **before** the first upload, because it can never change after).
2. *General → Deployment Info*: choose the orientations the game supports and tick
   **Requires full screen**, so iPad multitasking can't squeeze the game into a corner.
3. *Assets → AppIcon*: add the 1024×1024 icon.

### Every release

```sh
VITE_GAME_SERVERS=... npm run build
npx cap sync ios
npx cap open ios
```

Bump the version and build number in Xcode, then *Product → Archive → Distribute App → App
Store Connect*. The build appears in App Store Connect; try it with TestFlight first.

### App Store Connect

1. Create the app with the same bundle identifier, then add screenshots, a description and a
   privacy policy URL (required).
2. **App Privacy**: online play sends a random player ID, the player's name and their moves to
   your match servers. If the servers keep none of that once the match ends, you can answer
   *Data Not Collected*. Update the answers if you add analytics or crash reporting.
3. **Age rating questionnaire**: answer honestly. Two things to know:
   - The end-of-life reward reels are styled as a **reward spinner**: game icons, not casino
     symbols. You can't bet on them or buy into them, and they only multiply coins the player
     already earned. Say so in the review notes so the reviewer doesn't take them for a slot
     machine.
   - Coins can't be bought with real money. If you ever sell coins, the chests and reels become
     paid random rewards: you'd have to show the odds before purchase (the chest screen already
     does), and the questionnaire answers and the rating will change.
   - Players "die" when their trail is cut. That is mild cartoon violence at most.

### Saves and backups

On iOS the save lives in the app's preferences (Capacitor Preferences), which iCloud and device
backups include. Restoring a phone or moving to a new one brings the coins along.

---

## 4. Android (Google Play)

### What you need

- Android Studio (latest).
- A Google Play developer account: $25 once.

### First time

```sh
npm run build
npx cap add android    # creates the android/ project (only once)
npx cap open android   # opens it in Android Studio
```

Choose the orientations the game supports with `android:screenOrientation` on the activity in
`android/app/src/main/AndroidManifest.xml`, and set the app icon with *File → New → Image
Asset*.

### Signing key

Create an upload key once and keep it safe (password manager plus a backup):

```sh
keytool -genkeypair -v -keystore arcadium-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Use **Play App Signing** (the default): Google keeps the real app signing key, and if you lose
the upload key, Google support can reset it.

### Every release

```sh
VITE_GAME_SERVERS=... npm run build
npx cap sync android
```

Raise `versionCode` (every upload needs a higher number) and `versionName` in
`android/app/build.gradle`, then build a signed app bundle (AAB), either in Android Studio
(*Build → Generate Signed App Bundle*) or from the command line:

```sh
npx cap build android --keystorepath /full/path/to/arcadium-upload.jks --keystorepass <pass> \
  --keystorealias upload --keystorealiaspass <pass> --androidreleasetype AAB
```

### Play Console

1. Create the app and fill in the store listing.
2. Complete **Content rating** (the IARC questionnaire; give the same honest answers as for
   Apple about the reward reels), **Data safety** (same answers as Apple's App Privacy),
   **Target audience** (not aimed at children), and **Ads** (none).
3. Upload the AAB to a testing track first. New personal developer accounts must run a closed
   test with a minimum number of testers for a couple of weeks before they can publish (check
   the Console for the current requirement).
4. Play requires a recent target API level each year. Keeping Capacitor up to date keeps the
   generated project compliant.

### Saves and backups

The save lives in the app's preferences (Capacitor Preferences), which Android Auto Backup
copies to the player's Google account. Reinstalling, or setting up a new phone, restores it.

### Testing online play on a phone

Phones need a `wss://` server, so set up one real server (section 1) for device testing. Offline
play works without any server.

---

## Costs at a glance

| Item | Cost |
| --- | --- |
| Steam Direct | $100 per game, paid back after $1,000 in sales |
| Apple Developer Program | $99 a year |
| Google Play developer account | $25 once |
| Match servers | about $5 a month per region |
| Domain | about $10–15 a year |

Store revenue share: Steam takes 30% (less at very high revenue). Apple and Google take 15% for
developers earning under $1M a year through their small-business programs (you have to enrol),
30% otherwise.

## Release checklist

1. Servers updated and `https://<region>/healthz` answers.
2. `VITE_GAME_SERVERS=... npm run build` with the production server list.
3. Steam: `npm run pack:*` on each OS, upload with SteamPipe, test on a beta branch, go live.
4. iOS: `npx cap sync ios`, bump version, archive, TestFlight, submit.
5. Android: `npx cap sync android`, bump `versionCode`, signed AAB, testing track, production.
