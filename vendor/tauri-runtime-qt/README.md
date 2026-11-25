# tauri-runtime-qt (vendored)

The Linux runtime of the desktop app: Tauri 3 on Qt Widgets and QtWebEngine, native on Wayland.
Three crates, `tauri-runtime-qt` over `qtshim` over `qtshim-sys` (C++).

- Source: https://github.com/KRTirtho/tauri-runtime-qt at `48e4da3`, licensed `Apache-2.0 OR MIT`
  (each crate's `Cargo.toml`).
- Proposed for Tauri itself in tauri-apps/tauri#16529. Once a Qt runtime ships in a Tauri
  release, depend on that and delete this directory.

## What differs from the source

The source builds against a fork of `tauri` and of `muda`. This copy builds against the
published `tauri` 3 alpha:

- `tauri-runtime-qt`: no `qt` feature of `tauri`, and without `WindowDispatch::qt_window` and
  `WindowBuilder::transient_for_qt`, which only the fork's Qt menus need. The app has no native
  menu on Linux.
- The crates' own tests and their `qt-test-harness` are left out.

Not workspace members (`exclude` in the root `Cargo.toml`): `task check` lints and formats our
code, not this copy.
