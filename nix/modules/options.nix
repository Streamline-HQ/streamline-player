# Option declarations shared by the NixOS and home-manager modules: both put
# the engine under `services.streamline-engine`, the web player under
# `services.streamline-player-web` and the desktop app under
# `programs.streamline-player`, so the tree is identical and only the unit
# around it differs.
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.streamline-engine;
  web = config.services.streamline-player-web;
  format = pkgs.formats.yaml { };
  # Copied, not a symlinkJoin: static-web-server refuses symlinks that lead out
  # of its root, so every store link would fall through to index.html.
  webRoot =
    pkgs.runCommandLocal "streamline-player-web-root"
      {
        config = lib.optionalString (web.streamlineUrl != null) (
          builtins.toJSON { streamline = web.streamlineUrl; }
        );
      }
      ''
        cp -r --no-preserve=mode ${web.package} $out
        if [ -n "$config" ]; then printf '%s' "$config" > $out/config.json; fi
      '';
in
{
  options.programs.streamline-player = {
    enable = lib.mkEnableOption "the Streamline desktop player";
    package = lib.mkPackageOption pkgs "streamline-player" { };
  };

  options.services.streamline-player-web = {
    enable = lib.mkEnableOption "the Streamline web player";

    package = lib.mkPackageOption pkgs "streamline-player-web" { };

    streamlineUrl = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "https://streamline.example.com";
      description = ''
        Streamline the web player signs in to and calls. `null` expects
        Streamline on the player's own origin, behind the same reverse proxy.
        Otherwise add the player's origin to the player extension's web player
        origins.
      '';
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address the web player is served on.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8098;
      description = "Port the web player is served on.";
    };

    execStart = lib.mkOption {
      type = lib.types.str;
      internal = true;
      readOnly = true;
      default = lib.escapeShellArgs [
        (lib.getExe pkgs.static-web-server)
        "--host"
        web.host
        "--port"
        (toString web.port)
        "--root"
        webRoot
        # Every route of the SPA is index.html.
        "--page-fallback"
        "${webRoot}/index.html"
        "--health"
      ];
      description = "The unit's command line, shared by the NixOS and home-manager modules.";
    };
  };

  options.services.streamline-engine = {
    enable = lib.mkEnableOption "the Streamline streaming engine";

    package = lib.mkPackageOption pkgs "streamline-engine" { };

    settings = lib.mkOption {
      type = lib.types.submodule {
        freeformType = format.type;
        options = {
          listen = lib.mkOption {
            type = lib.types.str;
            default = "127.0.0.1:8097";
            description = "Address the engine serves on. Streamline and the players reach it here.";
          };
          hw_accel = lib.mkOption {
            type = lib.types.enum [
              "auto"
              "vaapi"
              "nvenc"
              "qsv"
              "amf"
              "videotoolbox"
              "none"
            ];
            default = "auto";
            description = "GPU backend for transcoding; `auto` tries each available one and falls back to the CPU.";
          };
          tmp_dir = lib.mkOption {
            type = lib.types.str;
            description = "Directory for live HLS segments.";
          };
          jobs_dir = lib.mkOption {
            type = lib.types.str;
            description = "Directory for background job output (analysis, downloads).";
          };
          job_output_ttl = lib.mkOption {
            type = lib.types.str;
            default = "168h";
            description = "How long a job's output may go unread before the sweep removes it. Reading a file resets the clock. `0s` turns the sweep off.";
          };
        };
      };
      default = { };
      description = ''
        The engine's YAML config (see the engine design's Config section).
        `ffmpeg_dir` and `secret_file` are set by the module.
      '';
    };

    secretFile = lib.mkOption {
      type = lib.types.str;
      example = "/run/secrets/streamline-engine";
      description = ''
        File holding the bearer secret Streamline signs with. Read at runtime,
        never copied into the Nix store.
      '';
    };

    ffmpeg.package = lib.mkPackageOption pkgs "ffmpeg-full" { } // {
      description = "ffmpeg the engine runs. It needs VAAPI, Vulkan and libplacebo for hardware transcoding.";
    };

    mediaDirs = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      example = [ "/srv/media" ];
      description = ''
        Paths the engine may read media from, granted read-only. Streamline
        hands the engine file paths as it sees them, so these are its library
        roots.

        The NixOS unit hides everything else under /home, /root, /mnt, /media
        and /srv; any other path on the system stays readable, as under
        `ProtectSystem=strict`. The home-manager unit reads what its user can.
      '';
    };
  };

  config.assertions = [
    {
      assertion = !(cfg.enable && cfg.settings ? secret);
      message = "services.streamline-engine.settings.secret would land in the world-readable Nix store; set secretFile instead.";
    }
  ];
}
