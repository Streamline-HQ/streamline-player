# Contributing

Thanks for taking an interest. Bug reports and small focused PRs are the most
useful things you can send.

## Before you write code

- **Bug fix**: just open a PR. Link the issue if there is one. Say which app
  (Android TV, desktop, web) and device it happens on.
- **New feature or UI change**: open an issue first so we can agree on the
  shape before you spend an evening on it. Every screen follows a design made
  ahead of the code; a UI change that departs from it is a design question
  before it is a code one.
- **The API the apps call** is [`docs/contract/player.openapi.yaml`](docs/contract/player.openapi.yaml),
  served by the [player extension](https://github.com/Streamline-HQ/streamline-player-ext).
  A change to it lands here first, then in the extension.

## Setup

Requires Rust (the channel in `rust-toolchain.toml`), Node (the `engines.node`
in `package.json`), [pnpm](https://pnpm.io) (its `packageManager`),
[Task](https://taskfile.dev), and ffmpeg for the engine. Nix users get all of
it, at exactly those versions, from the flake devshell (`nix develop`, or
direnv); the Android toolchain is `nix develop .#android`.

```bash
git clone https://github.com/Streamline-HQ/streamline-player.git
cd streamline-player
pnpm install --frozen-lockfile
task dev:mock           # a mock Streamline on :8081
task dev:desktop        # the desktop app against it, with live reload
```

`task` lists every command. `task dev:stack` runs a real Streamline with the
player extension and the engine instead of the mock.

## The loop

```bash
task check              # everything CI runs: fmt:check, lint, test
task fmt                # treefmt, configured in flake.nix
task test
```

`task lint` is clippy with `-D warnings`, biome with warnings as errors, ruff,
statix and deadnix, and svelte-check. `nix flake check` runs the same checks
plus the package builds, the NixOS VM test and the home-manager evaluation.

## Conventions

The full house style lives in [CLAUDE.md](CLAUDE.md): it is written for AI
agents but it is an accurate description of how the code is put together.
The short version:

- **Every REST call goes through Rust**, never `fetch` from the webview: the
  credential stays out of JavaScript. The webview fetches only HLS, from the
  engine.
- **Capabilities come from the running webview** (`MediaCapabilities`,
  `isTypeSupported`, `matchMedia`), never from a per-platform table.
- **No password passes through the app**: sign-in is Streamline's own page,
  and a TV pairs.
- **Frontend**: SvelteKit (Svelte 5) as a static SPA, TypeScript everywhere.
  Add a dependency with `pnpm add`, never by editing `package.json`.
- **Comments**: only where the code cannot explain itself.

## AI-assisted contributions

Streamline is built with heavy AI assistance, so this is not a "no AI" project,
and you don't need to hide that you used a coding agent. There is one rule:

**You are the author. The model is a tool.**

In practice:

- **Understand every line you submit.** If a reviewer asks why a function is
  shaped that way and the honest answer is "the model wrote it", the PR isn't
  ready. Read the diff before you open it.
- **Run `task lint` and the tests yourself.** An agent claiming the tests pass
  is not evidence that they pass. Paste real output if a change is subtle.
- **Verify the code against reality, not plausibility.** Agents invent SDK
  functions, view columns and API fields that look exactly right and don't
  exist. Build it.
- **Mention it in the PR description.** One line, "written with Claude Code",
  so a reviewer knows which failure modes to look for. No stigma attached.
- **Point your agent at `CLAUDE.md`.** It is the house style and it is kept
  current; a PR that follows it needs far less review.

What gets closed without much discussion:

- Large unreviewed diffs the submitter can't explain, or PRs that clearly
  weren't run
- Agent-generated refactors, "modernisations", or comment/docstring sweeps nobody
  asked for
- Scanner or agent output filed as a bug report or security report with no
  reproduction: see [SECURITY.md](SECURITY.md) for what a real report looks like

Reviewer time is the scarce resource here. A small PR you fully understand is
worth more than a large one you don't.

## Commits and PRs

Conventional Commits, subject line only unless the body earns its place:

```
feat(engine): POST /v1/cache/clear frees orphan work dirs and expired job outputs
feat: Pair a TV in Settings, through the web player's /pair page
```

`type(scope): msg`, scope optional. Keep the PR to one topic. Rebase on `main`
rather than merging it in. Fill in the PR template checklist.

**A UI change needs screenshots or a video in the PR**, on each app it touches
(TV, desktop, web), before and after. Attach a short video for anything that
moves: focus, a panel, playback controls. Drag the files into the PR
description and GitHub hosts them.

## License

Contributions are licensed under [GPL-3.0-or-later](LICENSE), same as the
project.
