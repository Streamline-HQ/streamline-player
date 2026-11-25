// Android answers these in Kotlin (Tauri forwards commands the Rust side does not handle to the
// mobile plugin), Linux in src/desktop.rs. These names only feed the ACL.
const COMMANDS: &[&str] = &[
    "capabilities",
    "deviceInfo",
    "frameRate",
    "restoreDisplay",
    "load",
    "play",
    "pause",
    "seek",
    "stop",
    "speed",
    "stats",
    "subtitle",
    "timing",
    "volume",
    "viewport",
    "subtitleLift",
    "voice",
    "requestNotifications",
    "pendingRoute",
    "registerListener",
    "register_listener",
    "removeListener",
    "remove_listener",
];

// The Qt video layer is C++ against the system's Qt 6 and libmpv, found with pkg-config.
fn qt_video() {
    let pc = |args: &[&str]| {
        let out = std::process::Command::new("pkg-config")
            .args(args)
            .output()
            .expect("pkg-config");
        assert!(
            out.status.success(),
            "pkg-config {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8(out.stdout).unwrap()
    };
    // `gl`: Qt's OpenGL headers include <GL/gl.h> and its .pc files do not say where it is.
    let modules = ["Qt6OpenGLWidgets", "Qt6WebEngineWidgets", "mpv", "gl"];
    let mut build = cc::Build::new();
    build.cpp(true).std("c++17").file("qt/video.cpp");
    for flag in pc(&[&["--cflags"], modules.as_slice()].concat()).split_whitespace() {
        build.flag(flag);
    }
    build.compile("slpvideo");
    for flag in pc(&[&["--libs"], modules.as_slice()].concat()).split_whitespace() {
        if let Some(lib) = flag.strip_prefix("-l") {
            println!("cargo:rustc-link-lib=dylib={lib}");
        } else if let Some(dir) = flag.strip_prefix("-L") {
            println!("cargo:rustc-link-search=native={dir}");
        }
    }
    println!("cargo:rerun-if-changed=qt/video.cpp");
}

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        qt_video();
    }
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
