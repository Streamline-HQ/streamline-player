# Security Policy

## Supported versions

| Version                         | Supported          |
| ------------------------------- | ------------------ |
| `main` (apps, engine image)     | :white_check_mark: |

There is no app release yet: fixes land on `main`, and the engine image is
published from it. Streamline Player is maintained by one person.

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/Streamline-HQ/streamline-player/security/advisories/new).
If that is unavailable to you, email dev@antoine-langlois.net instead.

Please include:

- The commit or engine image tag, and which app (Android TV, desktop, web)
- What an attacker can do: steal a device key, read a file outside the library
  through the engine, start a transcode without a playback token, etc.
- Steps to reproduce (tokens and secrets redacted)

Expect an acknowledgement within a week and a fix or a decision within 30 days
for anything exploitable. This is a spare-time project, not a vendor with an
on-call rotation: if something is actively being exploited, say so up front and
I will prioritise it. I will credit you in the advisory unless you'd rather stay
anonymous.

Please give me a chance to ship a fix before disclosing publicly. There is no
bug bounty.

## Scope

In scope:

- **The apps**: a device key or access token stored outside OS secure storage,
  reaching JavaScript, or leaking into a log; the webview loading or running
  content it should not (CSP, deep links, the sign-in redirect); a password
  passing through the app
- **The engine**: serving or reading a file outside its media mounts; answering
  `/hls` or a download without a valid playback token, or for another session;
  a control-plane call (`/v1`) accepted without Streamline's secret; anything a
  request can slip into an ffmpeg command line
- Supply-chain issues in the engine image build

Out of scope:

- Vulnerabilities in the player extension (the API the apps call, sign-in,
  pairing, playback tokens): report those to
  [streamline-player-ext](https://github.com/Streamline-HQ/streamline-player-ext/security/advisories/new),
  and those in Streamline itself to
  [Streamline](https://github.com/DataHearth/streamline/security/advisories/new).
- The engine's control plane reachable from untrusted networks. Only its data
  routes are meant to be published; `/v1` belongs to Streamline.
- Anything over plain HTTP. Streamline and the engine are built to sit behind
  TLS.
- Vulnerabilities in ffmpeg, mpv, ExoPlayer, Shaka Player, WebKitGTK or the OS
  webviews themselves. Report those upstream.
- Scanner or agent output with no demonstrated path to exploitation.
