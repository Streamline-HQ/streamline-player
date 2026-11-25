{
  lib,
  callPackage,
  rustPlatform,
  cargo-tauri,
  pnpmConfigHook,
  sqlite,
  pkg-config,
  qt6,
  nodejs,
  pnpm,
  desktop,
  web,
}:
let
  source = callPackage ./source.nix { };
in
rustPlatform.buildRustPackage {
  pname = "streamline-player";
  inherit (source) version;
  src = source.app;
  cargoLock.lockFile = ../../Cargo.lock;
  buildAndTestSubdir = "src-tauri";

  inherit (web) pnpmDeps prePnpmInstall;

  nativeBuildInputs = [
    cargo-tauri.hook
    nodejs
    pnpm
    pnpmConfigHook
    sqlite
    pkg-config
    qt6.wrapQtAppsHook
  ];
  # The same list the devshell derives its environment from; wrapQtAppsHook
  # bakes Qt's plugin paths into the launcher.
  buildInputs = desktop.libs;

  # The workspace's tests run once, in checks.cargo-test, as `task test:rust` does.
  doCheck = false;

  meta = {
    description = "Streamline's desktop player";
    mainProgram = "streamline-player";
    platforms = lib.platforms.linux;
  };
}
