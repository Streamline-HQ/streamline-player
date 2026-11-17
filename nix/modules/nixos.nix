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
  common = import ./common.nix {
    inherit pkgs cfg;
    # LoadCredential's fixed location for a system unit; the YAML cannot use
    # systemd's %d.
    secretFile = "/run/credentials/streamline-engine.service/secret";
  };
  port = lib.toInt (lib.last (lib.splitString ":" cfg.settings.listen));
  host = lib.removeSuffix ":${toString port}" cfg.settings.listen;
  # systemd splits these settings on whitespace, BindReadOnlyPaths on colons
  # too, and expands % specifiers in both: a path is quoted and escaped.
  quote = p: ''"${lib.replaceStrings [ "\\" "\"" "%" ":" ] [ "\\\\" "\\\"" "%%" "\\:" ] p}"'';
in
{
  imports = [ ./options.nix ];

  options.services.streamline-engine = {
    user = lib.mkOption {
      type = lib.types.str;
      default = "streamline-engine";
      description = "User the engine runs as. It needs read access to {option}`services.streamline-engine.mediaDirs`.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "streamline-engine";
      description = "Group the engine runs as.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Open the port of {option}`services.streamline-engine.settings.listen` in the firewall.";
    };

    hardwareAcceleration.enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Grant the engine the GPU: adds the `render` and `video` groups and
        opens the DRM devices to the sandbox, which blocks devices otherwise.
      '';
    };
  };

  options.services.streamline-player-web.openFirewall = lib.mkOption {
    type = lib.types.bool;
    default = false;
    description = "Open {option}`services.streamline-player-web.port` in the firewall.";
  };

  config = lib.mkMerge [
    (lib.mkIf app.enable { environment.systemPackages = [ app.package ]; })

    (lib.mkIf web.enable {
      networking.firewall.allowedTCPPorts = lib.mkIf web.openFirewall [ web.port ];

      systemd.services.streamline-player-web = {
        description = "Streamline web player";
        wantedBy = [ "multi-user.target" ];
        after = [ "network.target" ];
        serviceConfig = {
          ExecStart = web.execStart;
          Restart = "always";
          RestartSec = 5;
          DynamicUser = true;
          CapabilityBoundingSet = "";
          LockPersonality = true;
          MemoryDenyWriteExecute = true;
          PrivateDevices = true;
          ProtectClock = true;
          ProtectControlGroups = true;
          ProtectHome = true;
          ProtectHostname = true;
          ProtectKernelLogs = true;
          ProtectKernelModules = true;
          ProtectKernelTunables = true;
          ProtectProc = "invisible";
          RestrictAddressFamilies = [
            "AF_INET"
            "AF_INET6"
          ];
          RestrictNamespaces = true;
          RestrictRealtime = true;
          SystemCallArchitectures = "native";
          SystemCallFilter = [
            "@system-service"
            "~@privileged"
          ];
        };
      };
    })

    (lib.mkIf cfg.enable {
      services.streamline-engine.settings = {
        jobs_dir = lib.mkDefault "/var/lib/streamline-engine/jobs";
        # Not under /run: live segments for several transcodes would fill that
        # small RAM-backed tmpfs.
        tmp_dir = lib.mkDefault "/var/cache/streamline-engine/live";
      };

      users.users = lib.mkIf (cfg.user == "streamline-engine") {
        streamline-engine = {
          isSystemUser = true;
          inherit (cfg) group;
        };
      };
      users.groups = lib.mkIf (cfg.group == "streamline-engine") { streamline-engine = { }; };

      networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ port ];
      warnings =
        lib.optional
          (cfg.openFirewall && (lib.hasPrefix "127." host || host == "[::1]" || host == "localhost"))
          "services.streamline-engine.openFirewall opens port ${toString port}, but the engine listens on loopback (${cfg.settings.listen}): set settings.listen to an address other hosts reach.";

      systemd.services.streamline-engine = {
        description = "Streamline streaming engine";
        wantedBy = [ "multi-user.target" ];
        after = [ "network.target" ];
        unitConfig.RequiresMountsFor = map quote cfg.mediaDirs;

        serviceConfig = common.serviceConfig // {
          ExecStart = "${lib.getExe cfg.package} --config ${common.configFile}";
          User = cfg.user;
          Group = cfg.group;
          LoadCredential = "secret:${cfg.secretFile}";
          StateDirectory = "streamline-engine";
          CacheDirectory = "streamline-engine";

          ProtectSystem = "strict";
          # `tmpfs`, not `true`: `true` makes /home inaccessible, so even a bind
          # mount beneath it cannot be reached; an empty tmpfs hides the same
          # contents and lets the mediaDirs binds below show through.
          ProtectHome = "tmpfs";
          # ProtectSystem leaves the rest of the tree readable; these are where
          # libraries live outside /home, emptied the same way.
          TemporaryFileSystem = [
            "/mnt:ro"
            "/media:ro"
            "/srv:ro"
          ];
          BindReadOnlyPaths = map quote cfg.mediaDirs;

          SupplementaryGroups = lib.optionals cfg.hardwareAcceleration.enable [
            "render"
            "video"
          ];
          # A device class, not /dev/dri: systemd only accepts device nodes or
          # classes, and silently drops a directory, which leaves the render node
          # denied by the allow-list. char-drm covers card* and renderD*.
          DeviceAllow = lib.optionals cfg.hardwareAcceleration.enable [ "char-drm rw" ];
          PrivateDevices = !cfg.hardwareAcceleration.enable;
        };
      };
    })
  ];
}
