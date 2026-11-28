# Streamline Player

[![CI](https://github.com/Streamline-HQ/streamline-player/actions/workflows/ci.yaml/badge.svg)](https://github.com/Streamline-HQ/streamline-player/actions/workflows/ci.yaml)
[![Image](https://github.com/Streamline-HQ/streamline-player/actions/workflows/image.yaml/badge.svg)](https://github.com/Streamline-HQ/streamline-player/actions/workflows/image.yaml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

The app for watching your [Streamline](https://github.com/DataHearth/streamline) library on Android TV, desktop and the web, and the Rust HLS engine that streams it, transcoding with ffmpeg and VAAPI. Streamline keeps the users, sessions and watch state through the [player extension](https://github.com/Streamline-HQ/streamline-player-ext); the engine only reads files and serves HLS.

## Features

- One Tauri 3 + SvelteKit app for Android TV, the Linux desktop and the web; Windows, macOS, phones and tablets are next
- Android TV plays through ExoPlayer with libass subtitles, the desktop through mpv, the web through Shaka Player
- Direct play when the device can, otherwise a transcode sized to the source and to the connection, with Auto quality that steps down on a stall and back up when it holds
- Subtitles (text, ASS, PGS, forced tracks), audio tracks, speed, chapters, skip intro, up next and trickplay
- Sign-in through Streamline's own page, device pairing for TVs, downloads for offline viewing
- The engine: HDR and Dolby Vision aware, VAAPI or CPU encoding, a cap on concurrent transcodes

## Install

There is no app release yet: build it from source (see [Development](#development)).

### The engine

The engine's image is `ghcr.io/streamline-hq/streamline-player/engine` (ffmpeg 9 from Debian sid), built from [`deploy/engine.Dockerfile`](deploy/engine.Dockerfile) (`task build:image:engine`). A push to `main` that changes the engine publishes `main` and `sha-<commit>`; a tag `vX.Y.Z` publishes `X.Y.Z`, `X.Y` and `latest`, for this image and the web player's. The Helm chart is in [`deploy/helm/streamline-engine`](deploy/helm/streamline-engine); releases are tags `chart-vX.Y.Z`, pushed to `oci://ghcr.io/streamline-hq/charts`.

The engine needs read access to the library at the paths Streamline sends (or a `path_map`), and the secret the player extension hands out once from Server settings. Then set its address in Server settings; the [player extension's README](https://github.com/Streamline-HQ/streamline-player-ext#bootstrap-order) has the full bootstrap order.

#### Storage

The engine writes to two directories:

- `tmp_dir` holds the live HLS segments, dropped when a stream ends. It can be anything with room for a few transcodes; it defaults to the system's temp directory.
- `jobs_dir` holds the background jobs' output and their backlog. Trickplay sheets and extracted subtitles stay there until their source file changes, or for `job_output_ttl` (7 days) after it went missing. Analysis results and prepared downloads go once they have been unread for `job_output_ttl`. Losing the directory costs every file's trickplay sheets and subtitles, made again the next time it plays, so keep it on persistent storage. It defaults to `$XDG_STATE_HOME/streamline-engine/jobs` (`~/.local/state/…`).

The images set `XDG_STATE_HOME=/var/lib` and declare `/var/lib/streamline-engine` a volume: mount one there (`docker run -v streamline-engine:/var/lib/streamline-engine …`). The Helm chart keeps the live segments in an emptyDir and gives `jobs_dir` the volume set under `jobs`: an existing claim, a claim of `jobs.size` the chart creates, or an emptyDir, which loses it all with the pod. The NixOS module puts `jobs_dir` in `/var/lib/streamline-engine` and the home-manager one in `$XDG_STATE_HOME`.

### The web player

The browser build, served by static-web-server: `ghcr.io/streamline-hq/streamline-player/web`, built from [`deploy/web.Dockerfile`](deploy/web.Dockerfile) (`task build:image:web`) and published like the engine's. Mount `/web/config.json` with `{ "streamline": "https://streamline.example.com" }` to point it at Streamline, and add the player's origin to the player extension's web player origins. The Helm chart is in [`deploy/helm/streamline-player-web`](deploy/helm/streamline-player-web).

### NixOS and home-manager

The flake's `nixosModules.default` and `homeModules.default` hold the engine (`services.streamline-engine`), the web player (`services.streamline-player-web`, with `streamlineUrl`) and the desktop app (`programs.streamline-player`).

## Documentation

- [Player API contract](docs/contract/player.openapi.yaml): the API the apps call, served by the player extension
- [Extensions](https://github.com/DataHearth/streamline/wiki/Extensions) on the Streamline wiki

## Development

The Taskfile holds every command (`task` lists them). Run them inside the devshell (direnv), or `nix develop .#android` for the Android ones.

```sh
task dev:desktop   # the desktop app with live reload
task dev:web       # the web build (Vite on :1430)
task dev:engine    # the engine on dev/engine.yaml (:8097)
task dev:mock      # a mock Streamline on :8081
task dev:stack     # Streamline, the player extension and the engine on the mock's library
task build:<target>  # engine, desktop:linux, desktop:windows, android, web, image:engine, image:web, images, …
task check         # everything CI runs: fmt:check, lint, test
```

`nix flake check` runs the same checks plus the package builds, the NixOS VM test and the home-manager evaluation.

## Contributing

Bug reports and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
the build/test loop, conventions and the policy on AI-assisted PRs. Participation
is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

Found a vulnerability? Don't open an issue — see [SECURITY.md](SECURITY.md).

## Streamline repositories

| Repository | What it is |
| --- | --- |
| [streamline](https://github.com/DataHearth/streamline) | The server: media manager, web UI and extension host |
| [streamline-player](https://github.com/Streamline-HQ/streamline-player) | The player apps (Android TV, desktop, web) and the HLS streaming engine |
| [streamline-player-ext](https://github.com/Streamline-HQ/streamline-player-ext) | The `player` extension: the API the player apps talk to |
| [streamline-opds-ext](https://github.com/Streamline-HQ/streamline-opds-ext) | OPDS 1.2 catalog for e-reader apps |
| [streamline-subsonic-ext](https://github.com/Streamline-HQ/streamline-subsonic-ext) | Subsonic / OpenSubsonic server for music apps |

## License

[GPL-3.0](LICENSE)
