{ lib, biome }:
# biome.json's $schema names the release its rules and options are written for,
# and CI installs exactly that one. The nixpkgs biome feeding the devshell and
# the flake's checks must be it too, or the two lint differently.
let
  declared = builtins.elemAt (lib.splitString "/" (lib.importJSON ../biome.json)."$schema") 4;
in
lib.throwIf (biome.version != declared)
  "biome.json's $schema names biome ${declared}, but the locked nixpkgs ships ${biome.version}: run `biome migrate --write` (or update the flake lock) so both agree"
  biome
