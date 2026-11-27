# Embervale Tracker

A map of Embervale, the world of Enshrouded, with every Flame Shrine, Flame Sanctum and Ancient Spire and the borders of each region. Drop a `characterN.ksd` save file on the page to see which ones you have found and which ones you have yet to discover. The map shows your own fog of war from the save. Flames you have not found under the fog show too, and you can hide them to keep the surprise. The desktop app for Windows and Linux finds your saves on its own.

Embervale Tracker is based on [enshrouded-flames-finder](https://github.com/quantumsheep/enshrouded-flames-finder) by quantumsheep, and is licensed under the same Apache License 2.0.

## Why does this project exist?

Some Steam achievements, such as Spark of the Veilwater Basin, ask you to find every Flame Shrine and Flame Sanctum in a region:

![The Steam achievement Spark of the Veilwater Basin: "Find all flame shrines and sanctums in the Veilwater Basin." 0.5% of players have it.](docs/spark-of-the-veilwater-basin.png)

They are tedious to complete because the in-game map shows visited and unvisited Flame Shrines and Flame Sanctums with the same icon. Embervale Tracker marks the ones you have found, so you can see which ones you still have to visit.

## Where to find the character save

Where the save files are depends on whether Steam Cloud is on for Enshrouded. To check, right-click Enshrouded in your Steam library and select **Properties**.

- **Steam Cloud on (default):** open the Steam install folder (usually `C:\Program Files (x86)\Steam`; Steam shows it under **Steam > Settings > Storage**). Then go to `userdata\<YOUR_STEAM_ID>\1203620\remote`. You can also download the file from your [Steam Cloud storage for Enshrouded](https://store.steampowered.com/account/remotestorageapp/?appid=1203620). You must be logged in to Steam to see this page.
- **Steam Cloud off:** paste `%userprofile%\Saved Games\keen games\Enshrouded` into the Windows Start menu or the File Explorer address bar.

In that folder, select a `characterN.ksd` file.

On a shared PC with Steam Cloud on, each Steam account has its own `userdata` folder. With Steam Cloud off, all players on the PC share one save folder.

## Development

```sh
bun install
bun run dev
```

Other scripts: `bun run build`, `bun test`, `bun run check`, `bun run format`.

## Game data

The locations and region borders come from the game files, which [kfc-parser](https://github.com/Brabb3l/kfc-parser) unpacks to JSON:

```sh
kfc-parser unpack -g <Enshrouded folder> -o <output folder>
```

- **Flame shrines, sanctums and Ancient Spires** (`src/locations.ts`): their positions and knowledge ids are in the world's `SceneResource`. A spire uses the first knowledge id that its fast travel marker unlocks.
- **Region borders** (`src/regions.ts`): generated from the world's biome map, a 1280 × 1280 grid with 8 m cells:

  ```sh
  bun scripts/generate-regions.ts <output folder>/BiomeMapResource/509feadb-4c60-425f-9c7c-deeefd9b6920_6287e034_0.json
  ```

## Desktop app

The app wraps the page in a [Tauri](https://tauri.app) window. It runs on Windows and on Linux, where Enshrouded runs through Steam's Proton.

- **Windows:** an installer and a standalone `.exe`. Players need nothing else installed: the app uses WebView2, which ships with Windows 10 and 11.
- **Linux:** an `.AppImage` and a `.deb`. The app uses WebKitGTK.

The app finds your character saves on its own. It lists the `characterN.ksd` files in each Steam account's `userdata/<id>/1203620/remote` folder and in the game's `Saved Games\keen games\Enshrouded` folder, loads the newest one, and loads it again when the game saves. It can read only those files and the ones you select or drop on it. On Linux it looks in `~/.local/share/Steam`, `~/.steam/steam` and Flatpak Steam, and finds the `Saved Games` folder in the Proton prefix in each Steam library.

To build it yourself, install [Rust](https://rustup.rs) (and on Linux the [Tauri prerequisites](https://tauri.app/start/prerequisites/)), then run:

```sh
bun run tauri dev    # opens the app window with live reload
bun run tauri build  # writes the installers to src-tauri/target/release/bundle
```

### Releasing

The [release workflow](.github/workflows/release.yml) runs on tags that start with `v`. It checks that the tag matches the app version, runs the checks and tests, builds the Windows and Linux installers and attaches them to a draft GitHub release. The same tag deploys the website.

1. Set the new version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, and commit.
2. Tag and push: `git tag v0.2.0` and `git push origin v0.2.0`.
3. When the workflow is done, check the draft under **Releases** and publish it.

## Docker

```sh
docker build -t embervale-tracker .
docker run -p 8080:80 embervale-tracker
```

## License

The source code is licensed under the [Apache License 2.0](LICENSE).

Enshrouded and its assets, such as the map and the flame shrine and Ancient Spire icons, are the property of Keen Games. They are not covered by this license. This project is not affiliated with Keen Games.
