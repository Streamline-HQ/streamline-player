{ lib, buildPackages }:
# package.json's engines.node names one exact Node, with no range: the release
# the devshell, the package builds and CI's setup-node all run. Streamline
# rebuilds Node from source when nixpkgs ships another patch; here the flake
# refuses instead, so bump engines.node only to what the locked nixpkgs ships.
let
  declared = (lib.importJSON ../../package.json).engines.node;
  attr = "nodejs_${lib.versions.major declared}";
  pkg = lib.throwIf (
    !buildPackages ? ${attr}
  ) "package.json declares Node ${declared}, but nixpkgs has no ${attr}" buildPackages.${attr};
in
lib.throwIf (pkg.version != declared)
  "package.json declares Node ${declared}, but the locked nixpkgs ships ${pkg.version}: set engines.node to ${pkg.version} (or update the flake lock) so both agree"
  pkg
