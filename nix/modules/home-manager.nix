{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.streamline-engine;
  app = config.programs.streamline-player;
  web = config.services.streamline-player-web;
  # A user unit's credentials directory depends on the UID, so the YAML could
  # not name it; the engine reads the user's own file instead.
  common = import ./common.nix {
    inherit pkgs cfg;
    inherit (cfg) secretFile;
  };
in
{
  imports = [ ./options.nix ];

  config = lib.mkMerge [
    (lib.mkIf app.enable { home.packages = [ app.package ]; })

    (lib.mkIf web.enable {
      assertions = [
        {
          assertion = pkgs.stdenv.hostPlatform.isLinux;
          message = "services.streamline-player-web uses a systemd user unit and is Linux-only.";
        }
      ];

      systemd.user.services.streamline-player-web = {
        Unit.Description = "Streamline web player";
        Install.WantedBy = [ "default.target" ];
        Service = {
          ExecStart = web.execStart;
          Restart = "always";
          RestartSec = 5;
        };
      };
    })

    (lib.mkIf cfg.enable {
      assertions = [
        {
          assertion = pkgs.stdenv.hostPlatform.isLinux;
          message = "services.streamline-engine uses a systemd user unit and is Linux-only.";
        }
      ];

      services.streamline-engine.settings = {
        jobs_dir = lib.mkDefault "${config.xdg.stateHome}/streamline-engine/jobs";
        tmp_dir = lib.mkDefault "${config.xdg.cacheHome}/streamline-engine/live";
      };

      systemd.user.services.streamline-engine = {
        Unit.Description = "Streamline streaming engine";
        Install.WantedBy = [ "default.target" ];
        # No ProtectSystem/ProtectHome here, unlike the NixOS module: a user
        # running it under their own account keeps the library in $HOME.
        Service = common.serviceConfig // {
          ExecStart = "${lib.getExe cfg.package} --config ${common.configFile}";
        };
      };
    })
  ];
}
