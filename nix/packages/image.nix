{
  stdenv,
  dockerTools,
  mesa,
  engine,
}:
# nixpkgs links libplacebo to the Vulkan loader, so it can make the Vulkan device of its own that
# the VAAPI tonemap needs; linuxserver/ffmpeg's cannot, and its engine would tonemap on the CPU.
# The render node is usually root:render 0660: give the container that gid at run time
# (Kubernetes supplementalGroups), as Streamline's VAAPI image does.
dockerTools.streamLayeredImage {
  name = "ghcr.io/streamline-hq/streamline-player/engine";
  tag = engine.version;
  # ffmpeg and dovi_tool land in /bin; with `ffmpeg_dir` left unset the engine
  # finds them on PATH.
  contents = [
    engine
    engine.tools
    mesa
  ];
  extraCommands = "mkdir -m 1777 tmp";
  # The default jobs_dir is $XDG_STATE_HOME/streamline-engine/jobs. Trickplay
  # sheets and subtitles stay there for as long as their source file does.
  fakeRootCommands = "install -d -o 1000 -g 1000 var/lib/streamline-engine";
  config = {
    Volumes."/var/lib/streamline-engine" = { };
    User = "1000:1000";
    Entrypoint = [ "/bin/engine" ];
    Cmd = [
      "--config"
      "/etc/engine/config.yaml"
    ];
    Labels = {
      "org.opencontainers.image.source" = "https://github.com/Streamline-HQ/streamline-player";
      "org.opencontainers.image.description" = "Streamline's streaming engine";
      "org.opencontainers.image.version" = engine.version;
    };
    Env = [
      "PATH=/bin"
      "XDG_STATE_HOME=/var/lib"
      "LIBVA_DRIVERS_PATH=${mesa}/lib/dri"
      "VK_ICD_FILENAMES=${mesa}/share/vulkan/icd.d/radeon_icd.${stdenv.hostPlatform.uname.processor}.json"
    ];
    ExposedPorts."8097/tcp" = { };
  };
}
