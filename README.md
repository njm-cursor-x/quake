# Web Quake

The original Quake engine, running in a browser. Based on id Software's GPL
Quake source (via [Qwasm](https://github.com/GMH-Code/Qwasm)), compiled to
WebAssembly with Emscripten and rendered through WebGL via
[GL4ES](https://github.com/ptitSeb/gl4es).

## Game data

The engine was GPL'd by id; the game data did not come with it. This build
ships the official Quake 1.06 shareware archive (`quake106.zip`) and extracts
`id1/pak0.pak` in the browser at start. Episode 1 only — *Dimension of the
Doomed*.

| Source | Content | Where it comes from |
| --- | --- | --- |
| **Quake shareware, episode 1** (shipped as zip) | *Dimension of the Machine*, 8 maps | `scripts/fetch-quake-shareware.sh` |
| Your own `pak0.pak` | Whatever you own | Browser file picker, read locally |

`pak1.pak` (full game) and mission packs are commercial. Nothing here downloads
them, and `make check-dist` refuses to package anything other than
`quake106.zip`.

Quake shareware licensing is stricter than Doom's: redistributing a loose
`pak0.pak` may not be permitted. Shipping the official `quake106.zip` and
extracting at runtime is the conservative approach used here.

## Requirements

- [Emscripten](https://emscripten.org/) (`brew install emscripten` on macOS)
- `curl`, `unzip`, `make`, `cmake`, `node`
- `7z` or `unar` (to extract `resource.1` from the shareware zip at build time)

If Homebrew's emscripten postinstall fails on the Command Line Tools Python 3.9,
put Homebrew Python 3.10+ first on `PATH` (e.g.
`export PATH="$(brew --prefix python@3.14)/bin:$PATH"`).

## Build and run

```bash
git clone --recursive <repo-url>   # engine + GL4ES are submodules
./scripts/build.sh
python3 -m http.server --directory dist 8000
```

Already cloned without `--recursive`? Run `git submodule update --init`.

Open http://127.0.0.1:8000/ — WASM will not load from `file://`.

`scripts/build.sh` fetches and checksums `quake106.zip`, builds GL4ES for
Emscripten, compiles the engine, then writes `dist/`.

## Loading

First play needs about 25–30 MB: the wasm engine plus the ~9 MB shareware zip.
All of it is fetched on the splash screen *before* you press Start, behind a
progress bar.

`web/app.js` streams each asset with `fetch` and keeps the bytes in the Cache
Storage API. Repeat visits skip the network for these assets.

`make package` writes a content hash of the engine artifacts to
`dist/build.txt`. The page compares it against the cached copy and drops only
the stale engine entries, so rebuilding the engine does not force players to
re-download the shareware zip.

Prefetching is skipped when the browser reports Data Saver
(`navigator.connection.saveData`); the download then starts on Start instead.

## Music

Quake's soundtrack is CD audio, not embedded in the PAK. This build plays
sound effects from `pak0.pak` via SDL2. CD tracks are deferred to a later
release.

The splash screen has a volume slider that defaults to 25%. It is passed as
`+volume` / `+bgmvolume` at launch, which runs after `config.cfg` is exec'd, so
it overrides whatever a previous session saved. In-game you can still change it
from the console (`volume 0.5`) or the options menu.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse (locked) | Look |
| Left click | Fire |
| Space | Jump |
| 1–9 / wheel | Weapons |
| Esc | Menu |
| \` / ~ | Console |

Gamepad: left stick moves, right stick looks, RT/A fires, A jumps, LB/RB
switch weapons, Start opens the menu. Connect the pad before you press Start.

Vanilla Quake moves with the arrow keys, leaves `W`/`S`/`D` unbound, and puts
swim up/down on `A`/`Z`. `web/app.js` writes an `autoexec.cfg` into the virtual
filesystem with WASD bindings. Because `quake.rc` runs `autoexec.cfg` after
`config.cfg`, these bindings are reapplied on every launch and will override
in-game rebinds of those specific keys — drop the `AUTOEXEC` write if you want
fully persistent custom binds.

Mouselook is forced on in `IN_Move` (`src/vid_sdl.c`). Vanilla gates it behind
a held `+mlook` key and otherwise walks the player with mouse Y, which does not
work under pointer lock.

## Saves

Config and save games persist in IndexedDB (`/qwasm`) across reloads.

## License

- Engine: GPL-2.0 (id Software Quake source / Qwasm). See [COPYING](COPYING).
- GL4ES: MIT. See `third_party/gl4es/LICENSE`.
- Game data: © id Software. Only the official shareware archive is redistributed
  here; see the license files inside `quake106.zip`.
