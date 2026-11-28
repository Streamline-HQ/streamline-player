{ pkgs, lib }:
# numtide devshell runs no nixpkgs setup hooks, so nothing fills in the search
# paths pkg-config and Qt read. They are derived here from one list, which the
# desktop package takes as its buildInputs too, so the shell and the package
# cannot disagree about what the app links.
let
  # The Linux shell is Qt Widgets around QtWebEngine (vendor/tauri-runtime-qt).
  qt = with pkgs.qt6; [
    qtbase
    qtwebengine
    qtwebchannel
    qtwayland
  ];

  libs =
    qt
    ++ (with pkgs; [
      openssl
      # The desktop player: libmpv through its OpenGL render API; libGL brings libEGL.
      mpv-unwrapped
      libGL
    ]);

  # A .pc file names its dependencies (Qt6WebEngineWidgets requires Qt6Widgets,
  # Qt6Quick, …) and pkg-config fails unless each one is on PKG_CONFIG_PATH too.
  # nixpkgs records them as the dev outputs' propagatedBuildInputs.
  pcClosure =
    roots:
    map (x: x.drv) (
      builtins.genericClosure {
        startSet = map (d: {
          key = (lib.getDev d).outPath;
          drv = lib.getDev d;
        }) roots;
        operator =
          x:
          map (d: {
            key = d.outPath;
            drv = d;
          }) (lib.filter lib.isDerivation (x.drv.propagatedBuildInputs or [ ]));
      }
    );

  # Qt keeps its .pc files in `out`, the others in `dev`.
  pc = lib.unique (
    lib.concatMap (d: [
      d
      (d.out or d)
    ]) (pcClosure libs)
  );
in
{
  inherit libs pcClosure;

  env = [
    {
      name = "PKG_CONFIG_PATH";
      value = lib.concatStringsSep ":" [
        (lib.makeSearchPath "lib/pkgconfig" pc)
        (lib.makeSearchPath "share/pkgconfig" pc)
      ];
    }
    {
      # A binary run from the shell is not wrapped: without this Qt finds neither its
      # Wayland platform plugin nor QtWebEngine's.
      name = "QT_PLUGIN_PATH";
      value = lib.makeSearchPath "lib/qt-6/plugins" (
        with pkgs.qt6;
        [
          qtbase
          qtwayland
          qtwebengine
        ]
      );
    }
    {
      # Build scripts that emit a bare `-lmpv` give the linker no -L; the cc
      # wrapper only learns search dirs from setup hooks, which never ran. With
      # these dirs found, the wrapper also writes their rpath, even through
      # rust-lld, so dev binaries need no LD_LIBRARY_PATH (which would hand the
      # shell's OpenSSL to every host tool run inside it).
      name = "LIBRARY_PATH";
      value = lib.makeLibraryPath libs;
    }
    {
      name = "CC";
      value = "${pkgs.stdenv.cc}/bin/cc";
    }
    {
      name = "CXX";
      value = "${pkgs.stdenv.cc}/bin/c++";
    }
  ];
}
