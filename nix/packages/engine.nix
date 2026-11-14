{
  lib,
  callPackage,
  rustPlatform,
  symlinkJoin,
  ffmpeg-headless,
  dovi-tool,
  # Not named `ffmpeg`: callPackage would fill that from nixpkgs and this default would never
  # apply. nixpkgs' ffmpeg and ffmpeg-headless both lack libplacebo, which tonemaps, and
  # chromaprint, the muxer the intro job fingerprints with; ffmpeg-full has them and is three
  # times the size, most of it desktop libraries.
  engineFfmpeg ? ffmpeg-headless.override {
    withPlacebo = true;
    withChromaprint = true;
  },
}:
let
  source = callPackage ./source.nix { };
  manifest = (lib.importTOML ../../engine/Cargo.toml).package;
in
rustPlatform.buildRustPackage {
  pname = "streamline-engine";
  inherit (manifest) version;
  src = source.rust;
  cargoLock.lockFile = ../../Cargo.lock;
  cargoBuildFlags = [
    "-p"
    "engine"
  ];
  # The workspace's tests run once, in checks.cargo-test, as `task test:rust` does.
  doCheck = false;

  # With `ffmpeg_dir` set, the engine runs ffmpeg, ffprobe and dovi_tool all
  # from it (Config::binary), so they share one directory.
  passthru.tools = symlinkJoin {
    name = "streamline-engine-tools";
    paths = [
      (lib.getBin engineFfmpeg)
      dovi-tool
    ];
  };

  meta = {
    inherit (manifest) description;
    mainProgram = "engine";
    platforms = lib.platforms.linux;
  };
}
