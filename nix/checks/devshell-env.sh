set -eu

fail() {
  echo "devshell-env: $*" >&2
  exit 1
}

for pc in Qt6WebEngineWidgets Qt6WebChannel Qt6OpenGLWidgets Qt6PrintSupport Qt6DBus openssl mpv egl; do
  pkg-config --exists "$pc" || fail "pkg-config cannot resolve $pc: $(pkg-config --print-errors --exists "$pc" 2>&1)"
done

wayland=""
IFS=:
for dir in $QT_PLUGIN_PATH; do
  [ -d "$dir" ] || fail "QT_PLUGIN_PATH names a missing directory: $dir"
  [ -e "$dir/platforms/libqwayland.so" ] && wayland=1
done
unset IFS

[ -n "$wayland" ] || fail "QT_PLUGIN_PATH has no Wayland platform plugin"
[ -x "$CC" ] || fail "CC is not executable: ${CC:-unset}"
command -v cc >/dev/null || fail "no cc on PATH for rustc to link with"
# The player plugin's build script links libmpv and libEGL by bare name, with
# no -L of its own.
work=$(mktemp -d)
echo 'int main(void){return 0;}' > "$work/link.c"
cc "$work/link.c" -lmpv -lEGL -o "$work/link" || fail "cc cannot link -lmpv -lEGL by bare name"
# Host tools run inside the shell too (xh, git…); an LD_LIBRARY_PATH would
# swap their OpenSSL for the shell's and break them.
[ -z "${LD_LIBRARY_PATH:-}" ] || fail "LD_LIBRARY_PATH leaks the shell's libraries into host tools"
# A cargo build runs against libmpv without LD_LIBRARY_PATH only if the linker
# wrote an rpath. RUSTFLAGS is exported, as users do, so nothing the rpath
# depends on may come from cargo's per-target rustflags.
mkdir -p "$work/crate/src"
printf '[package]\nname = "rpath"\nversion = "0.0.0"\nedition = "2021"\n' > "$work/crate/Cargo.toml"
cat > "$work/crate/src/main.rs" <<'RS'
#[link(name = "mpv")]
extern "C" {
    fn mpv_client_api_version() -> std::os::raw::c_ulong;
}
fn main() {
    assert!(unsafe { mpv_client_api_version() } > 0);
}
RS
CARGO_HOME="$work/cargo" RUSTFLAGS="-C debuginfo=0" cargo run --offline --quiet --manifest-path "$work/crate/Cargo.toml" \
  || fail "a cargo-built binary cannot load libmpv: no rpath reached the linker"
