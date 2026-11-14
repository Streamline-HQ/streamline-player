{ lib, buildPackages }:
# .python-version decides the Python the dev scripts run on (the mock Streamline
# and the compare bridge): pyenv, uv and CI's setup-python all read that file.
# Same contract as nix/tools/node.nix: the flake refuses a nixpkgs that ships another.
let
  declared = lib.trim (builtins.readFile ../../.python-version);
  attr = "python${lib.replaceStrings [ "." ] [ "" ] (lib.versions.majorMinor declared)}";
  pkg = lib.throwIf (
    !buildPackages ? ${attr}
  ) ".python-version declares Python ${declared}, but nixpkgs has no ${attr}" buildPackages.${attr};
in
lib.throwIf (pkg.version != declared)
  ".python-version declares Python ${declared}, but the locked nixpkgs ships ${pkg.version}: write ${pkg.version} there (or update the flake lock) so both agree"
  pkg
