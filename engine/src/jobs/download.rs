use std::path::Path;
use std::process::Stdio;

use serde::Deserialize;
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;

use super::{JobError, lower_priority};
use crate::analysis::{Analysis, AudioStream};
use crate::args::file_video_args;
use crate::caps::Capabilities;
use crate::decision::{CopyTag, DvHandling, SessionParams, VideoAction, decide};
use crate::hw::Hw;

const COPYABLE_AUDIO: [&str; 3] = ["aac", "ac3", "eac3"];
const RE_ENCODED_AUDIO: &str = "eac3";
const RE_ENCODED_BITRATE: &str = "640k";
const RE_ENCODED_MAX_CHANNELS: u32 = 6;

#[derive(Debug, Clone, Deserialize)]
pub struct DownloadSpec {
    pub path: String,
    pub capabilities: Capabilities,
    pub audio_indexes: Vec<u32>,
    #[serde(default)]
    pub max_bitrate: Option<u64>,
    #[serde(default)]
    pub max_height: Option<u32>,
}

impl DownloadSpec {
    fn capped(&self) -> bool {
        self.max_bitrate.is_some() || self.max_height.is_some()
    }
}

fn picked<'a>(a: &'a Analysis, spec: &DownloadSpec) -> Result<Vec<&'a AudioStream>, JobError> {
    if spec.audio_indexes.is_empty() {
        return Err(JobError::Invalid("pick at least one audio stream".into()));
    }
    let mut out: Vec<&AudioStream> = Vec::new();
    for i in &spec.audio_indexes {
        let s = a
            .audio
            .iter()
            .find(|s| s.index == *i)
            .ok_or_else(|| JobError::Invalid(format!("no audio stream {i}")))?;
        if !out.iter().any(|o| o.index == s.index) {
            out.push(s);
        }
    }
    Ok(out)
}

fn audio_position(a: &Analysis, s: &AudioStream) -> usize {
    a.audio.iter().position(|x| x.index == s.index).unwrap_or(0)
}

fn copy_tag(tag: CopyTag) -> Option<&'static str> {
    match tag {
        CopyTag::Hvc1 => Some("hvc1"),
        CopyTag::Dvh1 => Some("dvh1"),
        CopyTag::Avc1 => Some("avc1"),
        CopyTag::Av01 => Some("av01"),
        CopyTag::Dav1 => Some("dav1"),
        CopyTag::Other => None,
    }
}

struct Built {
    args: Vec<String>,
    container: &'static str,
    video: &'static str,
    audio: Vec<Value>,
}

fn base_args() -> Vec<String> {
    [
        "-nostdin",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        "-stats_period",
        "2",
    ]
    .map(ToOwned::to_owned)
    .into()
}

fn subset_args(input: &Path, a: &Analysis, audio: &[&AudioStream], out: &Path) -> Built {
    let mut args = base_args();
    args.extend(["-i".into(), input.display().to_string()]);
    args.extend(["-map".into(), "0:v:0".into()]);
    for s in audio {
        args.extend(["-map".into(), format!("0:a:{}", audio_position(a, s))]);
    }
    args.extend(["-map_chapters", "0", "-c", "copy", "-sn", "-dn"].map(ToOwned::to_owned));
    args.push(out.display().to_string());
    Built {
        args,
        container: "mkv",
        video: "copy",
        audio: audio
            .iter()
            .map(|s| json!({ "index": s.index, "action": "copy", "codec": s.codec }))
            .collect(),
    }
}

fn capped_args(
    input: &Path,
    a: &Analysis,
    audio: &[&AudioStream],
    spec: &DownloadSpec,
    hw: &Hw,
    out: &Path,
) -> Result<Built, JobError> {
    let params = SessionParams {
        audio_index: audio.first().map(|s| s.index),
        max_bitrate: spec.max_bitrate,
        max_height: spec.max_height,
        ..Default::default()
    };
    let plan = decide(&spec.capabilities, a, &params, &hw.encoders)
        .map_err(|e| JobError::Invalid(e.message))?;

    let mut before_input = Vec::new();
    let mut video_args: Vec<String> = Vec::new();
    let video = match plan.video {
        VideoAction::Copy { tag, dv } => {
            video_args.extend(["-c:v".into(), "copy".into()]);
            // A converted profile 7 has no 8.1 pipeline here; its base layer is HDR10.
            let (tag, strip) = match (tag, dv) {
                (_, DvHandling::P7ToP81) => (CopyTag::Hvc1, true),
                (t, DvHandling::Strip) => (t, true),
                (t, DvHandling::Keep) => (t, false),
            };
            if let Some(t) = copy_tag(tag) {
                video_args.extend(["-tag:v".into(), t.into()]);
            }
            if strip {
                video_args.extend(["-bsf:v".into(), "dovi_rpu=strip=1".into()]);
            }
            "copy"
        }
        VideoAction::Transcode { .. } => {
            let v = file_video_args(&plan, a, hw);
            before_input = v.before_input;
            video_args = v.encode;
            "transcode"
        }
    };

    let mut args = base_args();
    args.extend(before_input);
    args.extend(["-i".into(), input.display().to_string()]);
    args.extend(["-map".into(), "0:v:0".into()]);
    let mut audio_out = Vec::new();
    for (k, s) in audio.iter().enumerate() {
        args.extend(["-map".into(), format!("0:a:{}", audio_position(a, s))]);
        if COPYABLE_AUDIO.contains(&s.codec.as_str()) {
            args.extend([format!("-c:a:{k}"), "copy".into()]);
            audio_out.push(json!({ "index": s.index, "action": "copy", "codec": s.codec }));
        } else {
            args.extend([
                format!("-c:a:{k}"),
                RE_ENCODED_AUDIO.into(),
                format!("-b:a:{k}"),
                RE_ENCODED_BITRATE.into(),
                format!("-ac:a:{k}"),
                s.channels.clamp(1, RE_ENCODED_MAX_CHANNELS).to_string(),
            ]);
            audio_out
                .push(json!({ "index": s.index, "action": "encode", "codec": RE_ENCODED_AUDIO }));
        }
    }
    args.extend([
        "-map_chapters".into(),
        "0".into(),
        "-sn".into(),
        "-dn".into(),
    ]);
    args.extend(video_args);
    args.extend(["-movflags".into(), "+faststart".into()]);
    args.push(out.display().to_string());
    Ok(Built {
        args,
        container: "mp4",
        video,
        audio: audio_out,
    })
}

async fn run_ffmpeg(
    ffmpeg_bin: &Path,
    args: &[String],
    duration: f64,
    progress: &(dyn Fn(f32) + Send + Sync),
) -> Result<(), JobError> {
    let mut cmd = Command::new(ffmpeg_bin);
    cmd.args(args);
    lower_priority(&mut cmd);
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let stdout = child.stdout.take().expect("stdout is piped");
    let mut stderr = child.stderr.take().expect("stderr is piped");
    let collected = tokio::spawn(async move {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text).await;
        text
    });
    let mut lines = BufReader::new(stdout).lines();
    while let Some(line) = lines.next_line().await? {
        if let Some(us) = line.strip_prefix("out_time_us=")
            && let Ok(us) = us.trim().parse::<f64>()
            && duration > 0.0
        {
            progress((us / 1e6 / duration).clamp(0.0, 1.0) as f32);
        }
    }
    let status = child.wait().await?;
    let stderr = collected.await.unwrap_or_default();
    if status.success() {
        Ok(())
    } else {
        Err(JobError::Download(stderr.trim().to_owned()))
    }
}

/// Writes exactly one of `original`, `download.mkv` or `download.mp4` into `out`.
pub async fn run(
    ffmpeg_bin: &Path,
    hw: &Hw,
    input: &Path,
    a: &Analysis,
    spec: &DownloadSpec,
    out: &Path,
    progress: &(dyn Fn(f32) + Send + Sync),
) -> Result<Value, JobError> {
    let audio = picked(a, spec)?;
    if a.video.is_empty() {
        return Err(JobError::NoVideo);
    }

    if !spec.capped() && audio.len() == a.audio.len() {
        let size = tokio::fs::metadata(input).await?.len();
        tokio::fs::write(out.join("original"), &spec.path).await?;
        return Ok(json!({
            "file": "original",
            "container": a.container,
            "size": size,
            "video": "copy",
            "audio": audio
                .iter()
                .map(|s| json!({ "index": s.index, "action": "copy", "codec": s.codec }))
                .collect::<Vec<_>>(),
        }));
    }

    let ext = if spec.capped() { "mp4" } else { "mkv" };
    let part = out.join(format!("download.part.{ext}"));
    let built = if spec.capped() {
        capped_args(input, a, &audio, spec, hw, &part)?
    } else {
        subset_args(input, a, &audio, &part)
    };

    if let Err(e) = run_ffmpeg(ffmpeg_bin, &built.args, a.duration, progress).await {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(e);
    }
    let file = format!("download.{}", built.container);
    if let Err(e) = tokio::fs::rename(&part, out.join(&file)).await {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(e.into());
    }
    progress(1.0);
    let size = tokio::fs::metadata(out.join(&file)).await?.len();
    Ok(json!({
        "file": file,
        "container": built.container,
        "size": size,
        "video": built.video,
        "audio": built.audio,
    }))
}

#[cfg(all(test, unix))]
mod tests {
    use std::process::Command as StdCommand;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use crate::analysis::{Hdr, VideoStream};
    use crate::caps::{AudioCaps, HdrCaps, VideoCap};
    use crate::decision::EncoderSet;
    use crate::hw::Backend;

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct Dir(std::path::PathBuf);

    impl Dir {
        fn new() -> Dir {
            let d = std::env::temp_dir().join(format!(
                "engine-download-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::SeqCst)
            ));
            std::fs::create_dir_all(d.join("out")).unwrap();
            Dir(d)
        }

        fn out(&self) -> std::path::PathBuf {
            self.0.join("out")
        }

        /// Logs its arguments next to itself, writes its last argument, fails when `fail` exists.
        fn fake_ffmpeg(&self) -> std::path::PathBuf {
            let bin = self.0.join("ffmpeg");
            crate::jobs::write_executable(
                &bin,
                "#!/bin/sh\ndir=$(dirname \"$0\")\necho \"$*\" >> \"$dir/argv.txt\"\nfor a in \"$@\"; do last=$a; done\necho data > \"$last\"\necho out_time_us=1000000\n[ -e \"$dir/fail\" ] && { echo boom >&2; exit 1; }\nexit 0\n",
            );
            bin
        }

        fn runs(&self) -> Vec<String> {
            std::fs::read_to_string(self.0.join("argv.txt"))
                .unwrap_or_default()
                .lines()
                .map(ToOwned::to_owned)
                .collect()
        }

        fn files(&self) -> Vec<String> {
            let mut v: Vec<String> = std::fs::read_dir(self.out())
                .unwrap()
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .collect();
            v.sort();
            v
        }
    }

    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn hw() -> Hw {
        Hw::new(Backend::Cpu, String::new(), EncoderSet::SOFTWARE, false)
    }

    fn audio(index: u32, codec: &str, channels: u32) -> AudioStream {
        AudioStream {
            index,
            codec: codec.into(),
            channels,
            layout: String::new(),
            ..Default::default()
        }
    }

    fn analysis(
        codec: &str,
        width: u32,
        height: u32,
        bit_rate: u64,
        audio: Vec<AudioStream>,
    ) -> Analysis {
        Analysis {
            version: 1,
            container: "mkv".into(),
            duration: 10.0,
            bit_rate,
            video: vec![VideoStream {
                index: 0,
                codec: codec.into(),
                profile: "Main".into(),
                bit_depth: 8,
                pix_fmt: "yuv420p".into(),
                width,
                height,
                sar: (1, 1),
                fps: 24.0,
                field_order: "progressive".into(),
                hdr: Hdr::Sdr,
                ..Default::default()
            }],
            audio,
            ..Default::default()
        }
    }

    fn caps() -> Capabilities {
        Capabilities {
            video: ["h264", "hevc"]
                .map(|c| VideoCap {
                    codec: c.into(),
                    profiles: vec![],
                    max_level: None,
                    max_width: 3840,
                    max_height: 2160,
                    max_fps: 60.0,
                })
                .into(),
            hdr: HdrCaps {
                formats: vec![],
                dv_profiles: vec![],
            },
            audio: AudioCaps {
                codecs: ["aac", "ac3", "eac3", "truehd"].map(Into::into).into(),
                max_channels: 8,
                passthrough: vec![],
            },
            containers: vec!["mkv".into(), "mp4".into()],
            subtitles: vec![],
            hls_keyframe_exact: false,
        }
    }

    fn spec(audio: &[u32], max_bitrate: Option<u64>, max_height: Option<u32>) -> DownloadSpec {
        DownloadSpec {
            path: "/m/film.mkv".into(),
            capabilities: caps(),
            audio_indexes: audio.to_vec(),
            max_bitrate,
            max_height,
        }
    }

    async fn go(d: &Dir, a: &Analysis, s: &DownloadSpec) -> Result<Value, JobError> {
        let input = d.0.join("in.mkv");
        std::fs::write(&input, b"0123456789").unwrap();
        run(&d.fake_ffmpeg(), &hw(), &input, a, s, &d.out(), &|_| {}).await
    }

    fn has(argv: &str, seq: &str) -> bool {
        format!(" {argv} ").contains(&format!(" {seq} "))
    }

    #[tokio::test]
    async fn original_when_nothing_changes() {
        let d = Dir::new();
        let a = analysis(
            "h264",
            1920,
            1080,
            5_000_000,
            vec![audio(1, "aac", 2), audio(2, "ac3", 6)],
        );
        let v = go(&d, &a, &spec(&[1, 2], None, None)).await.unwrap();
        assert_eq!(d.files(), ["original"]);
        assert!(d.runs().is_empty());
        assert_eq!(v["file"], "original");
        assert_eq!(v["container"], "mkv");
        assert_eq!(v["size"], 10);
    }

    #[tokio::test]
    async fn subset_copies_into_matroska() {
        let d = Dir::new();
        let a = analysis(
            "h264",
            1920,
            1080,
            5_000_000,
            vec![audio(1, "aac", 2), audio(2, "ac3", 6)],
        );
        let v = go(&d, &a, &spec(&[2], None, None)).await.unwrap();
        let runs = d.runs();
        assert_eq!(runs.len(), 1);
        let argv = &runs[0];
        assert!(has(argv, "-map 0:v:0"));
        assert!(has(argv, "-map 0:a:1"));
        assert!(!argv.contains("0:a:0"));
        assert!(has(argv, "-c copy") && has(argv, "-sn") && has(argv, "-map_chapters 0"));
        assert!(!argv.contains("-c:v"));
        assert_eq!(d.files(), ["download.mkv"]);
        assert_eq!(v["file"], "download.mkv");
        assert_eq!(v["audio"][0]["index"], 2);
    }

    #[tokio::test]
    async fn cap_transcodes_and_keeps_good_audio() {
        let d = Dir::new();
        let a = analysis(
            "hevc",
            3840,
            2160,
            40_000_000,
            vec![audio(1, "eac3", 6), audio(2, "truehd", 8)],
        );
        let v = go(&d, &a, &spec(&[1, 2], Some(8_000_000), Some(1080)))
            .await
            .unwrap();
        let argv = &d.runs()[0];
        assert!(has(argv, "-movflags +faststart"));
        assert!(
            argv.contains("-c:v libx264")
                || argv.contains("-c:v libx265")
                || argv.contains("-c:v libsvtav1"),
            "{argv}"
        );
        assert!(argv.contains("scale=") && argv.contains(":1080"), "{argv}");
        assert!(has(argv, "-c:a:0 copy"));
        assert!(has(argv, "-c:a:1 eac3") && has(argv, "-b:a:1 640k") && has(argv, "-ac:a:1 6"));
        assert!(!has(argv, "-re") && !argv.contains("-hls"));
        assert_eq!(d.files(), ["download.mp4"]);
        assert_eq!(v["container"], "mp4");
        assert_eq!(v["video"], "transcode");
        assert_eq!(v["audio"][0]["action"], "copy");
        assert_eq!(v["audio"][1]["action"], "encode");
        assert_eq!(v["audio"][1]["codec"], "eac3");
    }

    #[tokio::test]
    async fn cap_copies_video_that_fits() {
        let d = Dir::new();
        let a = analysis("h264", 1920, 1080, 5_000_000, vec![audio(1, "aac", 2)]);
        let v = go(&d, &a, &spec(&[1], Some(8_000_000), Some(1080)))
            .await
            .unwrap();
        let argv = &d.runs()[0];
        assert!(has(argv, "-c:v copy"), "{argv}");
        assert_eq!(v["video"], "copy");
    }

    #[tokio::test]
    async fn bad_audio_index_fails() {
        let d = Dir::new();
        let a = analysis("h264", 1920, 1080, 5_000_000, vec![audio(1, "aac", 2)]);
        let e = go(&d, &a, &spec(&[9], None, None)).await.unwrap_err();
        assert!(e.to_string().contains("no audio stream 9"));
        let e = go(&d, &a, &spec(&[], None, None)).await.unwrap_err();
        assert!(e.to_string().contains("at least one"));
        assert!(d.files().is_empty());
        assert!(d.runs().is_empty());
    }

    #[tokio::test]
    async fn failed_run_leaves_no_file() {
        let d = Dir::new();
        std::fs::write(d.0.join("fail"), "").unwrap();
        let a = analysis(
            "h264",
            1920,
            1080,
            5_000_000,
            vec![audio(1, "aac", 2), audio(2, "ac3", 6)],
        );
        let e = go(&d, &a, &spec(&[1], None, None)).await.unwrap_err();
        assert!(e.to_string().contains("boom"));
        assert!(d.files().is_empty(), "{:?}", d.files());
    }

    #[tokio::test]
    async fn progress_follows_ffmpegs_clock() {
        let d = Dir::new();
        let seen = std::sync::Mutex::new(Vec::new());
        let a = analysis(
            "h264",
            1920,
            1080,
            5_000_000,
            vec![audio(1, "aac", 2), audio(2, "ac3", 6)],
        );
        let input = d.0.join("in.mkv");
        std::fs::write(&input, b"x").unwrap();
        run(
            &d.fake_ffmpeg(),
            &hw(),
            &input,
            &a,
            &spec(&[1], None, None),
            &d.out(),
            &|p| seen.lock().unwrap().push(p),
        )
        .await
        .unwrap();
        let seen = seen.into_inner().unwrap();
        assert_eq!(seen.first(), Some(&0.1));
        assert_eq!(seen.last(), Some(&1.0));
    }

    fn have(tool: &str) -> bool {
        StdCommand::new(tool)
            .arg("-version")
            .output()
            .is_ok_and(|o| o.status.success())
    }

    #[tokio::test]
    async fn download_real_ffmpeg() {
        if !have("ffmpeg") || !have("ffprobe") {
            return;
        }
        let d = Dir::new();
        let mkv = d.0.join("in.mkv");
        let made = StdCommand::new("ffmpeg")
            .args(["-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i"])
            .arg("testsrc2=size=160x90:rate=10:duration=5")
            .args(["-f", "lavfi", "-i", "sine=frequency=440:duration=5"])
            .args(["-f", "lavfi", "-i", "sine=frequency=880:duration=5"])
            .args([
                "-map", "0", "-map", "1", "-map", "2", "-c:v", "mpeg4", "-c:a", "aac",
            ])
            .arg(&mkv)
            .output()
            .unwrap();
        assert!(
            made.status.success(),
            "{}",
            String::from_utf8_lossy(&made.stderr)
        );

        let a = crate::analysis::run_analyze(Path::new("ffprobe"), &mkv)
            .await
            .unwrap();
        assert_eq!(a.audio.len(), 2);
        let s = spec(&[a.audio[1].index], None, None);
        let v = run(Path::new("ffmpeg"), &hw(), &mkv, &a, &s, &d.out(), &|_| {})
            .await
            .unwrap();
        assert_eq!(v["file"], "download.mkv");
        let probe = StdCommand::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
            ])
            .arg(d.out().join("download.mkv"))
            .output()
            .unwrap();
        let kinds: Vec<_> = String::from_utf8_lossy(&probe.stdout)
            .lines()
            .map(ToOwned::to_owned)
            .collect();
        assert_eq!(kinds, ["video", "audio"]);
        assert_eq!(d.files(), ["download.mkv"]);

        let capped = spec(&[a.audio[0].index], Some(1_000_000), Some(72));
        let v = run(
            Path::new("ffmpeg"),
            &hw(),
            &mkv,
            &a,
            &capped,
            &d.out(),
            &|_| {},
        )
        .await
        .unwrap();
        assert_eq!(v["file"], "download.mp4");
        let probe = StdCommand::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=height",
            ])
            .args(["-of", "csv=p=0"])
            .arg(d.out().join("download.mp4"))
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&probe.stdout).trim(), "72");
    }
}
