//! The pure parts of the desktop player: geometry, unit conversions, and the decoder probe.

use serde_json::{Value, json};
use std::{
    ffi::{c_char, c_int, c_void},
    time::Duration,
};

/// mpv's default `sub-margin-y`, which a lift adds to.
const SUB_MARGIN_DEFAULT: f64 = 22.0;
/// mpv measures `sub-margin-y` against an OSD this tall, whatever the window is.
const SUB_REFERENCE_HEIGHT: f64 = 720.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// mpv's `video-margin-ratio-{left,right,top,bottom}` that put the picture in `rect` inside a
/// window of `width` by `height`; `None` is the whole window.
pub fn margin_ratios(rect: Option<Rect>, width: f64, height: f64) -> [f64; 4] {
    let Some(r) = rect.filter(|_| width > 0.0 && height > 0.0) else {
        return [0.0; 4];
    };
    let unit = |v: f64| v.clamp(0.0, 0.99);
    [
        unit(r.x / width),
        unit((width - r.x - r.width) / width),
        unit(r.y / height),
        unit((height - r.y - r.height) / height),
    ]
}

/// `sub-margin-y` for a subtitle raised `px` CSS pixels, in a window `physical_height` device
/// pixels tall on a screen of `scale` device pixels per CSS pixel.
pub fn sub_margin_y(px: f64, scale: f64, physical_height: f64) -> f64 {
    if physical_height <= 0.0 {
        return SUB_MARGIN_DEFAULT;
    }
    SUB_MARGIN_DEFAULT + px.max(0.0) * scale * SUB_REFERENCE_HEIGHT / physical_height
}

pub fn bits_per_second(bytes: f64, window: Duration) -> u64 {
    if window.is_zero() {
        return 0;
    }
    (bytes * 8.0 / window.as_secs_f64()) as u64
}

/// The contract's video codecs and profiles for the decoders VA-API lists (`vainfo` names).
pub fn codecs_from_va(profiles: &[&str]) -> Vec<(&'static str, Vec<&'static str>)> {
    const MAP: &[(&str, &str, &str)] = &[
        (
            "VAProfileH264ConstrainedBaseline",
            "h264",
            "constrained baseline",
        ),
        ("VAProfileH264Baseline", "h264", "baseline"),
        ("VAProfileH264Main", "h264", "main"),
        ("VAProfileH264High", "h264", "high"),
        ("VAProfileHEVCMain", "hevc", "main"),
        ("VAProfileHEVCMain10", "hevc", "main 10"),
        ("VAProfileAV1Profile0", "av1", "main"),
    ];
    let mut out: Vec<(&'static str, Vec<&'static str>)> = Vec::new();
    for (va, codec, profile) in MAP {
        if !profiles.contains(va) {
            continue;
        }
        match out.iter_mut().find(|(c, _)| c == codec) {
            Some((_, list)) => list.push(profile),
            None => out.push((codec, vec![profile])),
        }
    }
    out
}

/// What mpv decodes in software, for a machine without VA-API.
pub fn software_codecs() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
        (
            "h264",
            vec![
                "baseline",
                "constrained baseline",
                "main",
                "high",
                "high 10",
            ],
        ),
        ("hevc", vec!["main", "main 10"]),
        ("av1", vec!["main"]),
    ]
}

#[derive(Clone, Debug, Default)]
pub struct Display {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub refresh_hz: f64,
}

/// `max_width`, `max_height` and `max_fps` follow the display, as on Android: a picture past
/// what the screen shows is wasted bandwidth.
pub fn capabilities(codecs: &[(&str, Vec<&str>)], display: &Display) -> Value {
    let width = if display.width > 0 {
        display.width
    } else {
        3840
    };
    let height = if display.height > 0 {
        display.height
    } else {
        2160
    };
    let fps = display.refresh_hz.round().max(30.0);
    let video: Vec<Value> = codecs
        .iter()
        .map(|(codec, profiles)| {
            json!({ "codec": codec, "profiles": profiles, "max_level": null,
                    "max_width": width, "max_height": height, "max_fps": fps })
        })
        .collect();
    json!({
        "video": video,
        "hdr": { "formats": ["hdr10", "hdr10plus", "hlg"], "dv_profiles": [] },
        "audio": {
            "codecs": ["aac", "ac3", "dts", "eac3", "flac", "mp3", "opus", "truehd", "vorbis"],
            "max_channels": 8,
            "passthrough": [],
        },
        "containers": ["mp4", "mkv"],
        "subtitles": ["webvtt", "srt", "ass", "pgs"],
        "hls_keyframe_exact": false,
    })
}

const RTLD_NOW: c_int = 2;
const VA_ENTRYPOINT_VLD: c_int = 1;

unsafe extern "C" {
    fn dlopen(file: *const c_char, mode: c_int) -> *mut c_void;
    fn dlsym(handle: *mut c_void, name: *const c_char) -> *mut c_void;
    fn dlclose(handle: *mut c_void) -> c_int;
}

fn va_profile_name(profile: c_int) -> Option<&'static str> {
    Some(match profile {
        5 => "VAProfileH264Baseline",
        6 => "VAProfileH264Main",
        7 => "VAProfileH264High",
        13 => "VAProfileH264ConstrainedBaseline",
        17 => "VAProfileHEVCMain",
        18 => "VAProfileHEVCMain10",
        32 => "VAProfileAV1Profile0",
        _ => return None,
    })
}

/// The profiles the first DRM render node decodes in hardware. libva is opened at run time: a
/// machine without it plays in software instead of failing to start.
pub fn va_decode_profiles() -> Option<Vec<&'static str>> {
    use std::os::fd::AsRawFd;
    type GetDisplay = unsafe extern "C" fn(c_int) -> *mut c_void;
    type Initialize = unsafe extern "C" fn(*mut c_void, *mut c_int, *mut c_int) -> c_int;
    type Terminate = unsafe extern "C" fn(*mut c_void) -> c_int;
    type MaxNum = unsafe extern "C" fn(*mut c_void) -> c_int;
    type QueryProfiles = unsafe extern "C" fn(*mut c_void, *mut c_int, *mut c_int) -> c_int;
    type QueryEntrypoints =
        unsafe extern "C" fn(*mut c_void, c_int, *mut c_int, *mut c_int) -> c_int;

    unsafe fn open(name: &std::ffi::CStr) -> Option<*mut c_void> {
        let h = unsafe { dlopen(name.as_ptr(), RTLD_NOW) };
        (!h.is_null()).then_some(h)
    }
    unsafe fn sym<T: Copy>(h: *mut c_void, name: &std::ffi::CStr) -> Option<T> {
        let p = unsafe { dlsym(h, name.as_ptr()) };
        (!p.is_null()).then(|| unsafe { std::mem::transmute_copy(&p) })
    }

    let node = std::fs::read_dir("/dev/dri")
        .ok()?
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("renderD"))
        .min_by_key(|e| e.file_name())?;
    let file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(node.path())
        .ok()?;
    unsafe {
        let va = open(c"libva.so.2")?;
        let drm = open(c"libva-drm.so.2")?;
        let result = (|| {
            let get_display: GetDisplay = sym(drm, c"vaGetDisplayDRM")?;
            let initialize: Initialize = sym(va, c"vaInitialize")?;
            let terminate: Terminate = sym(va, c"vaTerminate")?;
            let max_profiles: MaxNum = sym(va, c"vaMaxNumProfiles")?;
            let max_entrypoints: MaxNum = sym(va, c"vaMaxNumEntrypoints")?;
            let query_profiles: QueryProfiles = sym(va, c"vaQueryConfigProfiles")?;
            let query_entrypoints: QueryEntrypoints = sym(va, c"vaQueryConfigEntrypoints")?;
            let dpy = get_display(file.as_raw_fd());
            if dpy.is_null() {
                return None;
            }
            let (mut major, mut minor) = (0, 0);
            if initialize(dpy, &mut major, &mut minor) != 0 {
                return None;
            }
            let mut profiles = vec![0; max_profiles(dpy).max(0) as usize];
            let mut count = 0;
            let mut found = Vec::new();
            if query_profiles(dpy, profiles.as_mut_ptr(), &mut count) == 0 {
                for &profile in &profiles[..count.max(0) as usize] {
                    let Some(name) = va_profile_name(profile) else {
                        continue;
                    };
                    let mut entries = vec![0; max_entrypoints(dpy).max(0) as usize];
                    let mut n = 0;
                    if query_entrypoints(dpy, profile, entries.as_mut_ptr(), &mut n) == 0
                        && entries[..n.max(0) as usize].contains(&VA_ENTRYPOINT_VLD)
                    {
                        found.push(name);
                    }
                }
            }
            terminate(dpy);
            Some(found)
        })();
        dlclose(drm);
        dlclose(va);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 0.0001
    }

    #[test]
    fn a_corner_rectangle_becomes_margin_ratios() {
        let rect = Rect {
            x: 1076.0,
            y: 685.0,
            width: 340.0,
            height: 191.0,
        };
        let [left, right, top, bottom] = margin_ratios(Some(rect), 1440.0, 900.0);
        assert!(close(left, 0.7472), "{left}");
        assert!(close(right, 0.0167), "{right}");
        assert!(close(top, 0.7611), "{top}");
        assert!(close(bottom, 0.0267), "{bottom}");
    }

    #[test]
    fn the_whole_window_has_no_margins() {
        assert_eq!(margin_ratios(None, 1440.0, 900.0), [0.0; 4]);
        let rect = Rect {
            x: 1.0,
            y: 1.0,
            width: 1.0,
            height: 1.0,
        };
        assert_eq!(margin_ratios(Some(rect), 0.0, 0.0), [0.0; 4]);
    }

    #[test]
    fn a_rectangle_past_the_window_stays_inside_mpvs_range() {
        let rect = Rect {
            x: 1400.0,
            y: 880.0,
            width: 340.0,
            height: 191.0,
        };
        let ratios = margin_ratios(Some(rect), 1440.0, 900.0);
        assert!(ratios.iter().all(|r| (0.0..1.0).contains(r)), "{ratios:?}");
    }

    #[test]
    fn a_lift_is_the_same_share_of_the_window_at_any_scale() {
        assert_eq!(sub_margin_y(0.0, 1.0, 720.0), 22.0);
        assert!(close(sub_margin_y(92.0, 1.0, 720.0), 22.0 + 92.0));
        assert!(close(sub_margin_y(92.0, 2.0, 1440.0), 22.0 + 92.0));
        assert!(close(sub_margin_y(92.0, 1.0, 1440.0), 22.0 + 46.0));
        assert!(close(sub_margin_y(92.0, 2.0, 720.0), 22.0 + 184.0));
    }

    #[test]
    fn bytes_over_a_window_are_bits_per_second() {
        assert_eq!(
            bits_per_second(2_500_000.0, Duration::from_secs(2)),
            10_000_000
        );
        assert_eq!(bits_per_second(1.0, Duration::ZERO), 0);
    }

    #[test]
    fn va_profiles_map_to_the_contracts_names() {
        let found = codecs_from_va(&[
            "VAProfileH264Main",
            "VAProfileH264High",
            "VAProfileHEVCMain10",
            "VAProfileVP9Profile0",
            "VAProfileMPEG2Main",
        ]);
        assert_eq!(
            found,
            vec![("h264", vec!["main", "high"]), ("hevc", vec!["main 10"])]
        );
        assert!(codecs_from_va(&[]).is_empty());
    }

    #[test]
    fn capabilities_follow_the_display() {
        let display = Display {
            name: "DP-1".into(),
            width: 2560,
            height: 1440,
            refresh_hz: 143.9,
        };
        let caps = capabilities(&[("hevc", vec!["main"])], &display);
        assert_eq!(caps["video"][0]["max_width"], 2560);
        assert_eq!(caps["video"][0]["max_fps"], 144.0);
    }

    #[test]
    fn the_probe_answers_where_a_render_node_exists_and_va_is_expected() {
        let found = va_decode_profiles();
        eprintln!("va profiles: {found:?}");
        let node = std::fs::read_dir("/dev/dri").is_ok_and(|d| {
            d.flatten()
                .any(|e| e.file_name().to_string_lossy().starts_with("renderD"))
        });
        if node && std::env::var_os("EXPECT_VA_PROBE").is_some() {
            assert!(
                found.is_some(),
                "EXPECT_VA_PROBE is set and a render node exists, but the probe declined"
            );
        }
    }
}
