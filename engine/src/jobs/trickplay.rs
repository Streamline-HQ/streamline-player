use std::path::Path;
use std::process::Stdio;

use serde_json::{Value, json};
use tokio::process::Command;

use super::{JobError, lower_priority};
use crate::analysis::{Analysis, Hdr};
use crate::args::{CPU_TONEMAP, placebo_filter};
use crate::decision::HdrOut;
use crate::hw::Hw;

const INTERVAL: u32 = 10;
const TILE_WIDTH: u32 = 320;
const COLS: u32 = 10;
const ROWS: u32 = 10;
const INDEX_FILE: &str = "trickplay.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Tonemap {
    None,
    Libplacebo,
    Cpu,
}

impl Tonemap {
    fn name(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Libplacebo => "libplacebo",
            Self::Cpu => "cpu",
        }
    }
}

fn tonemap_for(hw: &Hw, a: &Analysis) -> Tonemap {
    let hdr = a
        .video
        .first()
        .is_some_and(|v| v.hdr != Hdr::Sdr || v.dv.is_some());
    match (hdr, hw.libplacebo_sw) {
        (false, _) => Tonemap::None,
        (true, true) => Tonemap::Libplacebo,
        (true, false) => Tonemap::Cpu,
    }
}

/// Even height of a tile at `TILE_WIDTH`, from the display aspect (the sample aspect ratio applies).
fn tile_height(a: &Analysis) -> Option<u32> {
    let v = a.video.first()?;
    if v.width == 0 || v.height == 0 {
        return None;
    }
    let (n, d) = if v.sar.0 == 0 || v.sar.1 == 0 {
        (1, 1)
    } else {
        v.sar
    };
    let h = f64::from(TILE_WIDTH) * f64::from(v.height) * f64::from(d)
        / (f64::from(v.width) * f64::from(n));
    Some((((h / 2.0).round() as u32) * 2).max(2))
}

fn square_pixels(a: &Analysis) -> bool {
    a.video
        .first()
        .is_none_or(|v| v.sar.0 == 0 || v.sar.1 == 0 || v.sar.0 == v.sar.1)
}

fn args(input: &Path, a: &Analysis, _hw: &Hw, tonemap: Tonemap, out: &Path) -> Vec<String> {
    let th = tile_height(a).unwrap_or(2);
    let scale = if square_pixels(a) {
        format!("scale={TILE_WIDTH}:-2")
    } else {
        format!("scale={TILE_WIDTH}:{th}")
    };
    // eof_action=pass: plain fps drops the last frame, so a clip with one keyframe got no sheet.
    let mut vf = format!("fps=1/{INTERVAL}:eof_action=pass,{scale}");
    match tonemap {
        Tonemap::None => {}
        Tonemap::Libplacebo => {
            vf.push_str(&format!(
                ",format=p010le,{}",
                placebo_filter(TILE_WIDTH, th, HdrOut::Tonemap)
            ));
        }
        Tonemap::Cpu => {
            vf.push(',');
            vf.push_str(CPU_TONEMAP);
        }
    }
    vf.push_str(&format!(",tile={COLS}x{ROWS}"));
    let video = a.video.first().map_or(0, |v| v.index);
    let mut args: Vec<String> = ["-nostdin", "-y", "-hide_banner", "-loglevel", "error"]
        .map(ToOwned::to_owned)
        .into();
    args.extend(["-skip_frame".into(), "nokey".into(), "-i".into()]);
    args.push(input.to_string_lossy().into_owned());
    args.extend(
        [
            "-map",
            &format!("0:{video}"),
            "-an",
            "-sn",
            "-vf",
            &vf,
            "-pix_fmt",
            "yuvj420p",
            "-fps_mode",
            "passthrough",
            "-q:v",
            "5",
            "-start_number",
            "0",
        ]
        .map(ToOwned::to_owned),
    );
    args.push(out.join("sheet_%03d.jpg").to_string_lossy().into_owned());
    args
}

fn index(a: &Analysis, tile_height: u32) -> Result<Value, JobError> {
    if a.video.is_empty() {
        return Err(JobError::NoVideo);
    }
    let count = ((a.duration / f64::from(INTERVAL)).ceil() as u32).max(1);
    let per_sheet = COLS * ROWS;
    let sheets: Vec<String> = (0..count.div_ceil(per_sheet))
        .map(|i| format!("sheet_{i:03}.jpg"))
        .collect();
    Ok(json!({
        "interval": INTERVAL,
        "tile_width": TILE_WIDTH,
        "tile_height": tile_height,
        "cols": COLS,
        "rows": ROWS,
        "count": count,
        "sheets": sheets,
    }))
}

async fn run_quiet(bin: &Path, args: &[String]) -> Result<(bool, String), std::io::Error> {
    let mut cmd = Command::new(bin);
    cmd.args(args);
    lower_priority(&mut cmd);
    let out = cmd.stdin(Stdio::null()).kill_on_drop(true).output().await?;
    Ok((
        out.status.success(),
        String::from_utf8_lossy(&out.stderr).trim().to_owned(),
    ))
}

fn clear_sheets(out: &Path) {
    let Ok(entries) = std::fs::read_dir(out) else {
        return;
    };
    for e in entries.flatten() {
        if e.file_name().to_string_lossy().starts_with("sheet_") {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

pub async fn run(
    ffmpeg_bin: &Path,
    hw: &Hw,
    input: &Path,
    a: &Analysis,
    out: &Path,
) -> Result<Value, JobError> {
    let th = tile_height(a).ok_or(JobError::NoVideo)?;
    let mut value = index(a, th)?;
    let video = a.video.first().map_or(0, |v| v.index);
    let mut tonemap = tonemap_for(hw, a);
    let mut result = run_quiet(ffmpeg_bin, &args(input, a, hw, tonemap, out)).await?;
    if !result.0 && tonemap == Tonemap::Libplacebo {
        clear_sheets(out);
        tonemap = Tonemap::Cpu;
        result = run_quiet(ffmpeg_bin, &args(input, a, hw, tonemap, out)).await?;
    }
    if !result.0 {
        clear_sheets(out);
        return Err(JobError::Ffmpeg {
            index: video,
            stderr: result.1,
        });
    }
    // The index goes in last, so a run that stops half way leaves none behind.
    std::fs::write(out.join(INDEX_FILE), value.to_string())?;
    value["tonemap"] = json!(tonemap.name());
    Ok(value)
}

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;
    use std::process::Command as StdCommand;

    use super::*;
    use crate::analysis::{Dovi, Hdr, VideoStream};
    use crate::decision::EncoderSet;
    use crate::hw::Backend;

    fn have(tool: &str) -> bool {
        StdCommand::new(tool)
            .arg("-version")
            .output()
            .is_ok_and(|o| o.status.success())
    }

    fn analysis(hdr: Hdr, dv: bool, duration: f64) -> Analysis {
        Analysis {
            duration,
            video: vec![VideoStream {
                index: 0,
                width: 1920,
                height: 1080,
                sar: (1, 1),
                hdr,
                dv: dv.then(Dovi::default),
                ..VideoStream::default()
            }],
            ..Analysis::default()
        }
    }

    fn hw(libplacebo_sw: bool) -> Hw {
        let mut hw = Hw::new(Backend::Cpu, String::new(), EncoderSet::default(), false);
        hw.libplacebo_sw = libplacebo_sw;
        hw
    }

    fn vf(args: &[String]) -> &str {
        let i = args.iter().position(|a| a == "-vf").unwrap();
        &args[i + 1]
    }

    fn build(hw: &Hw, a: &Analysis, tonemap: Tonemap) -> Vec<String> {
        args(Path::new("/m/in.mkv"), a, hw, tonemap, Path::new("/o"))
    }

    #[test]
    fn args_decode_keyframes_only() {
        let args = build(&hw(false), &analysis(Hdr::Sdr, false, 60.0), Tonemap::None);
        let skip = args.iter().position(|a| a == "-skip_frame").unwrap();
        assert_eq!(args[skip + 1], "nokey");
        assert!(skip < args.iter().position(|a| a == "-i").unwrap());
        assert!(args.iter().any(|a| a == "-an"));
        assert!(args.iter().any(|a| a == "-sn"));
        assert!(!args.iter().any(|a| a.starts_with("-hwaccel")));
        assert_eq!(
            vf(&args),
            "fps=1/10:eof_action=pass,scale=320:-2,tile=10x10"
        );
    }

    #[test]
    fn hdr_uses_libplacebo_when_probed() {
        let want = format!(
            "fps=1/10:eof_action=pass,scale=320:-2,format=p010le,{},tile=10x10",
            placebo_filter(320, 180, HdrOut::Tonemap)
        );
        for a in [
            analysis(Hdr::Hdr10, false, 60.0),
            analysis(Hdr::Hlg, false, 60.0),
            analysis(Hdr::Sdr, true, 60.0),
        ] {
            let args = build(&hw(true), &a, tonemap_for(&hw(true), &a));
            assert_eq!(vf(&args), want);
        }
        let sdr = analysis(Hdr::Sdr, false, 60.0);
        assert_eq!(tonemap_for(&hw(true), &sdr), Tonemap::None);
    }

    #[test]
    fn hdr_uses_cpu_without_libplacebo() {
        let want = format!("fps=1/10:eof_action=pass,scale=320:-2,{CPU_TONEMAP},tile=10x10");
        for a in [
            analysis(Hdr::Hdr10, false, 60.0),
            analysis(Hdr::Hlg, false, 60.0),
            analysis(Hdr::Sdr, true, 60.0),
        ] {
            let args = build(&hw(false), &a, tonemap_for(&hw(false), &a));
            assert_eq!(vf(&args), want);
        }
    }

    fn fake_ffmpeg(dir: &Path) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let bin = dir.join("ffmpeg");
        std::fs::write(
            &bin,
            r#"#!/bin/sh
d=$(dirname "$0")
echo "$*" >> "$d/runs.txt"
for a in "$@"; do last=$a; done
out=$(dirname "$last")
case "$*" in
  *libplacebo*) : > "$out/sheet_000.jpg"; : > "$out/sheet_007.jpg"; echo boom >&2; exit 1 ;;
esac
: > "$out/sheet_000.jpg"
"#,
        )
        .unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        bin
    }

    #[tokio::test]
    async fn libplacebo_failure_falls_back_to_cpu() {
        let root = std::env::temp_dir().join(format!("engine-trickplay-{}", std::process::id()));
        let bin = fake_ffmpeg(&root.join("bin"));
        let out = root.join("out");
        std::fs::create_dir_all(&out).unwrap();
        let a = analysis(Hdr::Hdr10, false, 25.0);
        let v = run(&bin, &hw(true), Path::new("/m/in.mkv"), &a, &out)
            .await
            .unwrap();
        assert_eq!(v["tonemap"], "cpu");
        let runs = std::fs::read_to_string(root.join("bin/runs.txt")).unwrap();
        assert_eq!(runs.lines().count(), 2);
        assert!(out.join("sheet_000.jpg").is_file());
        assert!(!out.join("sheet_007.jpg").exists());
        assert!(out.join("trickplay.json").is_file());
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn index_counts_tiles() {
        for (secs, count, sheets) in [(4.0, 1, 1), (10.0, 1, 1), (10.5, 2, 1), (1234.0, 124, 2)] {
            let v = index(&analysis(Hdr::Sdr, false, secs), 180).unwrap();
            assert_eq!(v["count"], count, "{secs}");
            assert_eq!(v["sheets"].as_array().unwrap().len(), sheets, "{secs}");
        }
    }

    #[tokio::test]
    async fn no_video_fails() {
        let out = std::env::temp_dir().join(format!("engine-trickplay-nv-{}", std::process::id()));
        std::fs::create_dir_all(&out).unwrap();
        let a = Analysis {
            duration: 30.0,
            ..Analysis::default()
        };
        let err = run(Path::new("ffmpeg"), &hw(false), Path::new("/m/a"), &a, &out)
            .await
            .unwrap_err();
        assert!(matches!(err, JobError::NoVideo));
        assert_eq!(std::fs::read_dir(&out).unwrap().count(), 0);
        std::fs::remove_dir_all(out).ok();
    }

    async fn real_clip(name: &str, extra: &[&str], vf: &str) -> Option<(PathBuf, Analysis)> {
        if !have("ffmpeg") || !have("ffprobe") {
            return None;
        }
        let dir = std::env::temp_dir().join(format!("engine-tp-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let clip = dir.join("in.mkv");
        let made = StdCommand::new("ffmpeg")
            .args(["-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i"])
            .arg(format!(
                "testsrc2=size=640x360:rate=10:duration={}",
                if name == "hdr" { 12 } else { 25 }
            ))
            .args(["-vf", vf])
            .args(extra)
            .arg(&clip)
            .output()
            .unwrap();
        if !made.status.success() {
            return None;
        }
        let a = crate::analysis::run_analyze(Path::new("ffprobe"), &clip)
            .await
            .unwrap();
        Some((clip, a))
    }

    #[tokio::test]
    async fn trickplay_real_ffmpeg() {
        let Some((clip, a)) =
            real_clip("sdr", &["-c:v", "mpeg4", "-g", "10"], "format=yuv420p").await
        else {
            return;
        };
        let out = clip.parent().unwrap().join("out");
        std::fs::create_dir_all(&out).unwrap();
        let v = run(Path::new("ffmpeg"), &hw(false), &clip, &a, &out)
            .await
            .unwrap();
        assert_eq!(v["count"], 3);
        assert_eq!(v["tonemap"], "none");
        let th = v["tile_height"].as_u64().unwrap();
        let probe = StdCommand::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=p=0",
            ])
            .arg(out.join("sheet_000.jpg"))
            .output()
            .unwrap();
        assert_eq!(
            String::from_utf8_lossy(&probe.stdout).trim(),
            format!("3200,{}", 10 * th)
        );
        let mut on_disk: Value =
            serde_json::from_slice(&std::fs::read(out.join("trickplay.json")).unwrap()).unwrap();
        on_disk["tonemap"] = json!("none");
        assert_eq!(on_disk, v);
        std::fs::remove_dir_all(clip.parent().unwrap()).ok();
    }

    #[tokio::test]
    async fn trickplay_real_ffmpeg_hdr() {
        let hdr = [
            "-c:v",
            "libx265",
            "-pix_fmt",
            "yuv420p10le",
            "-x265-params",
            "log-level=error",
            "-color_primaries",
            "bt2020",
            "-color_trc",
            "smpte2084",
            "-colorspace",
            "bt2020nc",
        ];
        let Some((clip, mut a)) = real_clip(
            "hdr",
            &hdr,
            "format=yuv420p10le,setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc",
        ).await else {
            return;
        };
        let have_zscale = StdCommand::new("ffmpeg")
            .args(["-hide_banner", "-filters"])
            .output()
            .is_ok_and(|o| String::from_utf8_lossy(&o.stdout).contains("zscale"));
        if !have_zscale {
            return;
        }
        a.video[0].hdr = Hdr::Hdr10;
        let out = clip.parent().unwrap().join("out");
        std::fs::create_dir_all(&out).unwrap();
        let v = run(Path::new("ffmpeg"), &hw(false), &clip, &a, &out)
            .await
            .unwrap();
        assert_eq!(v["tonemap"], "cpu");
        let probe = StdCommand::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=pix_fmt",
                "-of",
                "csv=p=0",
            ])
            .arg(out.join("sheet_000.jpg"))
            .output()
            .unwrap();
        let fmt = String::from_utf8_lossy(&probe.stdout);
        assert!(
            fmt.trim().starts_with("yuvj4") || fmt.trim().starts_with("yuv4"),
            "{fmt}"
        );
        assert!(!fmt.contains("10"), "{fmt}");
        std::fs::remove_dir_all(clip.parent().unwrap()).ok();
    }
}
