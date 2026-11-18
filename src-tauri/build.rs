fn main() {
    tauri_build::build();
    println!("cargo:rustc-check-cfg=cfg(downloads)");
    if matches!(
        std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
        Ok("linux" | "windows" | "macos" | "android")
    ) {
        println!("cargo:rustc-cfg=downloads");
    }
}
