{ lib, ruff }:
# ruff.toml's required-version is the release CI installs, and ruff itself
# refuses to run as any other. Checked here as well so a flake lock that moves
# ruff fails when it is evaluated, not when someone next lints.
let
  line = lib.findFirst (lib.hasPrefix "required-version") (throw "no required-version in ruff.toml") (
    lib.splitString "\n" (builtins.readFile ../../ruff.toml)
  );
  declared = lib.removePrefix "==" (builtins.elemAt (lib.splitString "\"" line) 1);
in
lib.throwIf (ruff.version != declared)
  "ruff.toml requires ruff ${declared}, but the locked nixpkgs ships ${ruff.version}: set required-version to ==${ruff.version} (or update the flake lock) so both agree"
  ruff
