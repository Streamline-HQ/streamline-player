use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex, PoisonError};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const ANALYSIS_VERSION: u32 = 3;

#[derive(Debug, thiserror::Error)]
pub enum AnalysisError {
    #[error("cannot run ffprobe: {0}")]
    Spawn(String),
    #[error("ffprobe cannot read the file: {0}")]
    Unreadable(String),
    #[error("ffprobe output is not valid json: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Analysis {
    pub version: u32,
    #[serde(default)]
    pub container: String,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub bit_rate: u64,
    #[serde(default)]
    pub video: Vec<VideoStream>,
    #[serde(default)]
    pub audio: Vec<AudioStream>,
    #[serde(default)]
    pub subtitles: Vec<SubtitleStream>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    #[serde(default)]
    pub chapters: Vec<Chapter>,
    #[serde(default)]
    pub keyframes: Vec<f64>,
    /// The dts of each keyframe in `keyframes`, where MPEG-TS seeks (see playlist::seek_time).
    #[serde(default)]
    pub keyframe_dts: Vec<f64>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Hdr {
    #[default]
    Sdr,
    Hdr10,
    Hlg,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Dovi {
    #[serde(default)]
    pub profile: u8,
    #[serde(default)]
    pub level: u8,
    #[serde(default)]
    pub bl_compat_id: u8,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct VideoStream {
    #[serde(default)]
    pub index: u32,
    #[serde(default)]
    pub codec: String,
    #[serde(default)]
    pub profile: String,
    #[serde(default)]
    pub level: Option<u32>,
    #[serde(default)]
    pub bit_depth: u8,
    #[serde(default)]
    pub pix_fmt: String,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    #[serde(default)]
    pub sar: (u32, u32),
    #[serde(default)]
    pub fps: f64,
    #[serde(default)]
    pub vfr: bool,
    #[serde(default)]
    pub field_order: String,
    #[serde(default)]
    pub start_time: f64,
    #[serde(default)]
    pub hdr: Hdr,
    #[serde(default)]
    pub dv: Option<Dovi>,
    #[serde(default)]
    pub hdr10plus: bool,
    /// ffprobe's has_b_frames: the stream reorders frames, which moves an input seek (see playlist::seek_time).
    #[serde(default)]
    pub b_frames: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AudioStream {
    #[serde(default)]
    pub index: u32,
    #[serde(default)]
    pub codec: String,
    #[serde(default)]
    pub profile: String,
    #[serde(default)]
    pub channels: u32,
    #[serde(default)]
    pub layout: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub default: bool,
    #[serde(default)]
    pub forced: bool,
    #[serde(default)]
    pub start_time: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SubtitleStream {
    #[serde(default)]
    pub index: u32,
    #[serde(default)]
    pub codec: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub default: bool,
    #[serde(default)]
    pub forced: bool,
    #[serde(default)]
    pub sdh: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Attachment {
    #[serde(default)]
    pub index: u32,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub mimetype: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Chapter {
    #[serde(default)]
    pub start: f64,
    #[serde(default)]
    pub end: f64,
    #[serde(default)]
    pub title: String,
}

pub fn is_current(a: &Analysis) -> bool {
    a.version >= ANALYSIS_VERSION
}

fn num(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

fn int(v: &Value) -> Option<i64> {
    num(v).map(|f| f as i64)
}

fn text(v: &Value) -> String {
    v.as_str().unwrap_or_default().to_owned()
}

fn rational(v: &Value, sep: char) -> Option<(u32, u32)> {
    let (a, b) = v.as_str()?.split_once(sep)?;
    Some((a.parse().ok()?, b.parse().ok()?))
}

fn fps(v: &Value) -> Option<f64> {
    let (n, d) = rational(v, '/')?;
    (d != 0 && n != 0).then(|| f64::from(n) / f64::from(d))
}

fn flag(stream: &Value, name: &str) -> bool {
    stream["disposition"][name].as_i64() == Some(1)
}

fn tag(stream: &Value, name: &str) -> String {
    text(&stream["tags"][name])
}

fn bit_depth(stream: &Value) -> u8 {
    if let Some(d) = int(&stream["bits_per_raw_sample"]).filter(|d| *d > 0) {
        return d as u8;
    }
    let pix_fmt = stream["pix_fmt"].as_str().unwrap_or_default();
    for depth in [16u8, 14, 12, 10, 9] {
        if pix_fmt.contains(&depth.to_string()) {
            return depth;
        }
    }
    8
}

fn is_sdh(stream: &Value, title: &str) -> bool {
    flag(stream, "hearing_impaired")
        || title
            .to_lowercase()
            .split(|c: char| !c.is_alphanumeric() && c != '_')
            .any(|w| w == "sdh" || w == "cc")
}

fn container(format_name: &str) -> String {
    const NAMES: [(&str, &str); 6] = [
        ("matroska", "mkv"),
        ("mov,mp4", "mp4"),
        ("webm", "webm"),
        ("mpegts", "ts"),
        ("avi", "avi"),
        ("mpeg", "mpeg"),
    ];
    NAMES
        .iter()
        .find(|(probe, _)| format_name.contains(probe))
        .map_or_else(String::new, |(_, name)| (*name).to_owned())
}

fn side_data<'a>(stream: &'a Value, kind: &str) -> Option<&'a Value> {
    stream["side_data_list"]
        .as_array()?
        .iter()
        .find(|s| s["side_data_type"].as_str() == Some(kind))
}

fn video_stream(s: &Value, first_frame: &Value) -> VideoStream {
    let hdr = match s["color_transfer"].as_str() {
        Some("smpte2084") => Hdr::Hdr10,
        Some("arib-std-b67") => Hdr::Hlg,
        _ => Hdr::Sdr,
    };
    let avg = fps(&s["avg_frame_rate"]);
    let raw = fps(&s["r_frame_rate"]);
    let hdr10plus = first_frame["frames"][0]["side_data_list"]
        .as_array()
        .is_some_and(|l| {
            l.iter()
                .any(|d| text(&d["side_data_type"]).contains("SMPTE2094-40"))
        });
    VideoStream {
        index: int(&s["index"]).unwrap_or(0) as u32,
        codec: text(&s["codec_name"]),
        profile: text(&s["profile"]),
        level: int(&s["level"]).filter(|l| *l > 0).map(|l| l as u32),
        bit_depth: bit_depth(s),
        pix_fmt: text(&s["pix_fmt"]),
        width: int(&s["width"]).unwrap_or(0) as u32,
        height: int(&s["height"]).unwrap_or(0) as u32,
        sar: rational(&s["sample_aspect_ratio"], ':')
            .filter(|(n, d)| *n != 0 && *d != 0)
            .unwrap_or((1, 1)),
        fps: avg.or(raw).unwrap_or(0.0),
        vfr: matches!((avg, raw), (Some(a), Some(r)) if (a - r).abs() > 0.001),
        field_order: text(&s["field_order"]),
        start_time: num(&s["start_time"]).unwrap_or(0.0),
        hdr,
        dv: side_data(s, "DOVI configuration record").map(|d| Dovi {
            profile: int(&d["dv_profile"]).unwrap_or(0) as u8,
            level: int(&d["dv_level"]).unwrap_or(0) as u8,
            bl_compat_id: int(&d["dv_bl_signal_compatibility_id"]).unwrap_or(0) as u8,
        }),
        hdr10plus,
        b_frames: int(&s["has_b_frames"]).unwrap_or(0).max(0) as u32,
    }
}

/// Keyframe pts in order, with their dts; rows are `pts,dts,flags` or `pts,flags`.
fn keyframes(packets_csv: &str) -> (Vec<f64>, Vec<f64>) {
    let mut kf: Vec<(f64, f64)> = packets_csv
        .lines()
        .filter_map(|line| {
            let cols: Vec<&str> = line.split(',').map(str::trim).collect();
            let pts = cols.first()?.parse::<f64>().ok()?;
            let dts = match cols.as_slice() {
                [_, dts, _, ..] => dts.parse().unwrap_or(pts),
                _ => pts,
            };
            cols.last()?.contains('K').then_some((pts, dts))
        })
        .collect();
    kf.sort_by(|a, b| a.0.total_cmp(&b.0));
    kf.dedup_by(|a, b| a.0 == b.0);
    kf.into_iter().unzip()
}

fn last_pts(packets_csv: &str) -> Option<f64> {
    packets_csv
        .lines()
        .filter_map(|line| line.split(',').next()?.trim().parse::<f64>().ok())
        .max_by(f64::total_cmp)
}

pub fn parse(
    probe: &Value,
    first_frame: &Value,
    packets_csv: &str,
) -> Result<Analysis, AnalysisError> {
    let streams = probe["streams"].as_array().map_or(&[][..], Vec::as_slice);
    let mut a = Analysis {
        version: ANALYSIS_VERSION,
        container: container(probe["format"]["format_name"].as_str().unwrap_or_default()),
        duration: num(&probe["format"]["duration"]).unwrap_or(0.0),
        bit_rate: num(&probe["format"]["bit_rate"]).unwrap_or(0.0) as u64,
        ..Analysis::default()
    };
    (a.keyframes, a.keyframe_dts) = keyframes(packets_csv);
    // Audio can outlast the video, and a segment past the last frame cannot be produced: ffmpeg
    // fails with "received no packets". One frame short on purpose, so that every segment boundary
    // below `duration` has a frame at or after it.
    let start = num(&probe["format"]["start_time"]).unwrap_or(0.0);
    if let Some(video_end) = last_pts(packets_csv)
        .map(|t| t - start)
        .filter(|t| *t > 0.0)
    {
        a.duration = a.duration.min(video_end);
    }
    for s in streams {
        let index = int(&s["index"]).unwrap_or(0) as u32;
        let title = tag(s, "title");
        match s["codec_type"].as_str() {
            Some("video") if !flag(s, "attached_pic") => {
                a.video.push(video_stream(s, first_frame));
            }
            Some("audio") => a.audio.push(AudioStream {
                index,
                codec: text(&s["codec_name"]),
                profile: text(&s["profile"]),
                channels: int(&s["channels"]).unwrap_or(0) as u32,
                layout: text(&s["channel_layout"]),
                language: tag(s, "language"),
                default: flag(s, "default"),
                forced: flag(s, "forced"),
                start_time: num(&s["start_time"]).unwrap_or(0.0),
                title,
            }),
            Some("subtitle") => a.subtitles.push(SubtitleStream {
                index,
                codec: text(&s["codec_name"]),
                language: tag(s, "language"),
                default: flag(s, "default"),
                forced: flag(s, "forced"),
                sdh: is_sdh(s, &title),
                title,
            }),
            Some("attachment") => a.attachments.push(Attachment {
                index,
                filename: tag(s, "filename"),
                mimetype: tag(s, "mimetype"),
            }),
            _ => {}
        }
    }
    for c in probe["chapters"].as_array().into_iter().flatten() {
        a.chapters.push(Chapter {
            start: num(&c["start_time"]).unwrap_or(0.0),
            end: num(&c["end_time"]).unwrap_or(0.0),
            title: tag(c, "title"),
        });
    }
    Ok(a)
}

type Prepare<'a> = &'a (dyn Fn(&mut tokio::process::Command) + Sync);

async fn ffprobe(
    ffprobe: &Path,
    args: &[&str],
    path: &Path,
    prepare: Prepare<'_>,
) -> Result<String, AnalysisError> {
    let mut cmd = tokio::process::Command::new(ffprobe);
    cmd.args(["-v", "error"]).args(args).arg(path);
    prepare(&mut cmd);
    let out = cmd
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| AnalysisError::Spawn(format!("{}: {e}", ffprobe.display())))?;
    if !out.status.success() {
        return Err(AnalysisError::Unreadable(
            String::from_utf8_lossy(&out.stderr).trim().to_owned(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

pub async fn run_analyze(ffprobe_bin: &Path, path: &Path) -> Result<Analysis, AnalysisError> {
    run_analyze_with(ffprobe_bin, path, &|_| {}).await
}

/// The streams, chapters and container of the file, and its first video frame: quick to read
/// whatever the file's size.
async fn probe(
    ffprobe_bin: &Path,
    path: &Path,
    prepare: Prepare<'_>,
) -> Result<(Value, Value), AnalysisError> {
    let probe = ffprobe(
        ffprobe_bin,
        &[
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            "-show_chapters",
        ],
        path,
        prepare,
    )
    .await?;
    let frame = ffprobe(
        ffprobe_bin,
        &[
            "-select_streams",
            "v:0",
            "-read_intervals",
            "%+#1",
            "-show_frames",
            "-show_entries",
            "frame=side_data_list",
            "-print_format",
            "json",
        ],
        path,
        prepare,
    )
    .await?;
    Ok((serde_json::from_str(&probe)?, serde_json::from_str(&frame)?))
}

/// `prepare` runs on each ffprobe command after its program and arguments are set and before stdio is configured.
pub async fn run_analyze_with(
    ffprobe_bin: &Path,
    path: &Path,
    prepare: Prepare<'_>,
) -> Result<Analysis, AnalysisError> {
    let (probe, frame) = probe(ffprobe_bin, path, prepare).await?;
    let packets = match indexed_packets(ffprobe_bin, path, &probe, prepare).await {
        Some(packets) => packets,
        None => packets(ffprobe_bin, path, None, prepare).await?,
    };
    parse(&probe, &frame, &packets)
}

/// The video packets as `pts,dts,flags` rows: all of them, which reads the whole file, or those
/// ffprobe reads in `interval`.
async fn packets(
    ffprobe_bin: &Path,
    path: &Path,
    interval: Option<&str>,
    prepare: Prepare<'_>,
) -> Result<String, AnalysisError> {
    let mut args = vec!["-select_streams", "v:0"];
    if let Some(interval) = interval {
        args.extend(["-read_intervals", interval]);
    }
    args.extend([
        "-show_entries",
        "packet=pts_time,dts_time,flags",
        "-of",
        "csv=p=0",
    ]);
    ffprobe(ffprobe_bin, &args, path, prepare).await
}

/// How much of the file's start and end is read to check its index against.
const INDEX_CHECK_SECS: f64 = 10.0;
/// A cue and the packet it names carry one timestamp, printed with different rounding.
const SAME_KEYFRAME_SECS: f64 = 0.0005;

/// The rows `parse` needs, from a Matroska file's own index instead of every packet: one per
/// keyframe, and the last packets for where the video ends. The index of some files skips
/// keyframes, which would number the segments of a copied stream wrongly, so it is held to the
/// keyframes actually found in the first and the last seconds. `None` sends the caller the long
/// way.
async fn indexed_packets(
    ffprobe_bin: &Path,
    path: &Path,
    probe: &Value,
    prepare: Prepare<'_>,
) -> Option<String> {
    let format = &probe["format"];
    if container(format["format_name"].as_str()?) != "mkv" {
        return None;
    }
    let end = num(&format["start_time"]).unwrap_or(0.0) + num(&format["duration"])?;
    let file = path.to_owned();
    let cues = tokio::task::spawn_blocking(move || crate::mkv::cue_keyframes(&file))
        .await
        .ok()??;

    let head = packets(
        ffprobe_bin,
        path,
        Some(&format!("%+{INDEX_CHECK_SECS}")),
        prepare,
    )
    .await
    .ok()?;
    let tail_from = (end - INDEX_CHECK_SECS).max(0.0);
    let tail = packets(ffprobe_bin, path, Some(&format!("{tail_from}%")), prepare)
        .await
        .ok()?;

    let (head_keys, _) = keyframes(&head);
    let first = *head_keys.first()?;
    // The interval's last second is left out: where ffprobe stops reading is not exact.
    let head_until = first + INDEX_CHECK_SECS - 1.0;
    let (tail_keys, _) = keyframes(&tail);
    let same = |found: &[f64], from: f64, until: f64| {
        let inside = |t: &&f64| **t >= from && **t < until;
        let found: Vec<&f64> = found.iter().filter(inside).collect();
        let listed: Vec<&f64> = cues.iter().filter(inside).collect();
        found.len() == listed.len()
            && found
                .iter()
                .zip(&listed)
                .all(|(a, b)| (**a - **b).abs() < SAME_KEYFRAME_SECS)
    };
    if (cues[0] - first).abs() >= SAME_KEYFRAME_SECS
        || !same(&head_keys, first, head_until)
        || !same(&tail_keys, tail_from.max(head_until), f64::INFINITY)
    {
        tracing::info!(path = %path.display(), "the file's index skips keyframes; reading every packet");
        return None;
    }
    // Only the cues name keyframes; of the packets read, where the video ends is all that is kept.
    let last = last_pts(&tail)?;
    let mut rows: String = cues
        .iter()
        .map(|k| format!("{k:.6},{k:.6},K__\n"))
        .collect();
    rows.push_str(&format!("{last:.6},{last:.6},___\n"));
    Some(rows)
}

/// A file as it was analysed: its path, size and modification time.
type FileKey = (PathBuf, u64, Option<SystemTime>);

static RECENT: LazyLock<Mutex<HashMap<FileKey, Arc<tokio::sync::OnceCell<Analysis>>>>> =
    LazyLock::new(Mutex::default);
const RECENT_MAX: usize = 64;

fn kept_name(key: &FileKey) -> String {
    use sha2::Digest;
    let mtime = key
        .2
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_nanos());
    let mut h = sha2::Sha256::new();
    h.update(key.0.as_os_str().as_encoded_bytes());
    h.update(format!("\0{}\0{mtime}", key.1));
    hex::encode(&h.finalize()[..16])
}

fn read_kept(file: &Path) -> Option<Analysis> {
    let a: Analysis = serde_json::from_slice(&std::fs::read(file).ok()?).ok()?;
    is_current(&a).then_some(a)
}

fn write_kept(file: &Path, a: &Analysis) {
    let written = file
        .parent()
        .map_or(Ok(()), std::fs::create_dir_all)
        .and_then(|()| std::fs::write(file, serde_json::to_vec(a).unwrap_or_default()));
    if let Err(e) = written {
        tracing::warn!(file = %file.display(), error = %e, "cannot keep the analysis");
    }
}

/// The analysis of `path` as it is now, run once however many ask and remembered. Playing a file
/// not analysed yet asks three times in a row (its tracks, the decisions, the session), and a
/// run reads the whole file. The run outlives a caller that gave up waiting, so asking again
/// finds it done.
///
/// With `kept`, it is also written to that directory and read back from it, so it survives a
/// restart and a job that runs days after the file's analysis does not read the file again.
pub async fn analyze_shared(
    ffprobe_bin: &Path,
    path: &Path,
    kept: Option<&Path>,
    prepare: Prepare<'static>,
) -> Result<Analysis, AnalysisError> {
    let Ok(meta) = tokio::fs::metadata(path).await else {
        return run_analyze_with(ffprobe_bin, path, prepare).await;
    };
    let key = (path.to_owned(), meta.len(), meta.modified().ok());
    // ponytail: a file that changes or goes leaves its old entry behind (a few hundred KB);
    // sweep them with the job outputs if the volume ever fills.
    let kept = kept.map(|dir| dir.join(format!("{}.json", kept_name(&key))));
    let cell = {
        let mut recent = RECENT.lock().unwrap_or_else(PoisonError::into_inner);
        // ponytail: forgets everything when full; an LRU if 64 files in play at once ever matters.
        if recent.len() >= RECENT_MAX && !recent.contains_key(&key) {
            recent.clear();
        }
        recent.entry(key).or_default().clone()
    };
    let (bin, path) = (ffprobe_bin.to_owned(), path.to_owned());
    tokio::spawn(async move {
        cell.get_or_try_init(|| async {
            if let Some(a) = kept.as_deref().and_then(read_kept) {
                return Ok(a);
            }
            let a = run_analyze_with(&bin, &path, prepare).await?;
            if let Some(file) = &kept {
                write_kept(file, &a);
            }
            Ok(a)
        })
        .await
        .cloned()
    })
    .await
    .unwrap_or_else(|e| Err(AnalysisError::Spawn(e.to_string())))
}

/// What the file holds, for naming its tracks and deciding how to play it: the whole analysis
/// when one is at hand, else everything but the keyframes, which a file with no usable index
/// gives up only when read from end to end. Never to be played from: without keyframes a copied
/// stream has no segments.
pub async fn tracks(
    ffprobe_bin: &Path,
    path: &Path,
    kept: Option<&Path>,
    prepare: Prepare<'_>,
) -> Result<Analysis, AnalysisError> {
    if let Ok(meta) = tokio::fs::metadata(path).await {
        let key = (path.to_owned(), meta.len(), meta.modified().ok());
        let recent = RECENT
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(&key)
            .and_then(|cell| cell.get().cloned());
        let whole = recent.or_else(|| read_kept(&kept?.join(format!("{}.json", kept_name(&key)))));
        if let Some(a) = whole {
            return Ok(a);
        }
    }
    // ponytail: probed again on each call (two short ffprobe runs); remember it next to RECENT
    // if tracks and decisions of one file ever show up as slow.
    let (probe, frame) = probe(ffprobe_bin, path, prepare).await?;
    parse(&probe, &frame, "")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[tokio::test]
    async fn shared_analysis_runs_once_for_a_file() {
        let dir = std::env::temp_dir().join(format!("engine-shared-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (bin, file, runs) = (dir.join("ffprobe"), dir.join("a.mkv"), dir.join("runs"));
        std::fs::write(&file, "x").unwrap();
        crate::jobs::write_executable(
            &bin,
            &format!(
                "#!/bin/sh\necho run >> {}\ncase \"$*\" in *csv=p=0*) ;; *) echo '{}' ;; esac\n",
                runs.display(),
                r#"{"format":{"duration":"1","start_time":"0","format_name":"matroska"},"streams":[]}"#,
            ),
        );
        let (a, b) = tokio::join!(
            analyze_shared(&bin, &file, None, &|_| {}),
            analyze_shared(&bin, &file, None, &|_| {}),
        );
        assert_eq!(a.unwrap().duration, b.unwrap().duration);
        analyze_shared(&bin, &file, None, &|_| {}).await.unwrap();
        let kept = dir.join("kept");
        std::fs::write(&file, "xy").unwrap();
        analyze_shared(&bin, &file, Some(&kept), &|_| {})
            .await
            .unwrap();
        RECENT.lock().unwrap().clear();
        analyze_shared(&bin, &file, Some(&kept), &|_| {})
            .await
            .unwrap();
        // One analysis is three ffprobe runs, and the kept one is not run again.
        let ran = std::fs::read_to_string(&runs).unwrap().lines().count();
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(ran, 6);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn tracks_never_read_every_packet() {
        let dir = std::env::temp_dir().join(format!("engine-tracks-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (bin, file, runs) = (dir.join("ffprobe"), dir.join("a.mp4"), dir.join("runs"));
        std::fs::write(&file, "x").unwrap();
        crate::jobs::write_executable(
            &bin,
            &format!(
                "#!/bin/sh\necho \"$*\" >> {}\ncase \"$*\" in *csv=p=0*) echo '1.0,1.0,K__' ;; *) echo '{}' ;; esac\n",
                runs.display(),
                r#"{"format":{"duration":"9","start_time":"0","format_name":"mov,mp4"},"streams":[{"index":1,"codec_type":"audio","codec_name":"aac"}]}"#,
            ),
        );
        let kept = dir.join("kept");
        let quick = tracks(&bin, &file, Some(&kept), &|_| {}).await.unwrap();
        assert_eq!(quick.audio.len(), 1);
        assert!(quick.keyframes.is_empty());
        let ran = std::fs::read_to_string(&runs).unwrap();
        assert_eq!(ran.lines().count(), 2);
        assert!(!ran.contains("csv=p=0"));

        let whole = analyze_shared(&bin, &file, Some(&kept), &|_| {})
            .await
            .unwrap();
        assert_eq!(whole.keyframes, vec![1.0]);
        let before = std::fs::read_to_string(&runs).unwrap().lines().count();
        let again = tracks(&bin, &file, Some(&kept), &|_| {}).await.unwrap();
        let after = std::fs::read_to_string(&runs).unwrap().lines().count();
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(again.keyframes, vec![1.0]);
        assert_eq!(before, after);
    }

    /// Needs a real ffmpeg, like the engine's end-to-end tests.
    #[tokio::test]
    async fn a_matroska_index_gives_what_every_packet_gives() {
        let ffmpeg = |args: &[&str]| {
            std::process::Command::new("ffmpeg")
                .args(["-nostdin", "-y", "-v", "error"])
                .args(args)
                .output()
                .is_ok_and(|o| o.status.success())
        };
        let dir = std::env::temp_dir().join(format!("engine-index-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let clip = dir.join("in.mkv");
        let (clip_arg, probe_bin) = (clip.to_str().unwrap(), Path::new("ffprobe"));
        if !ffmpeg(&[
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x180:rate=24:duration=40",
            "-c:v",
            "libx264",
            "-g",
            "36",
            "-bf",
            "2",
            clip_arg,
        ]) {
            let _ = std::fs::remove_dir_all(&dir);
            return;
        }
        let probe: Value = serde_json::from_str(
            &ffprobe(
                probe_bin,
                &["-print_format", "json", "-show_format"],
                &clip,
                &|_| {},
            )
            .await
            .unwrap(),
        )
        .unwrap();
        let every = packets(probe_bin, &clip, None, &|_| {}).await.unwrap();
        let indexed = indexed_packets(probe_bin, &clip, &probe, &|_| {}).await;
        let _ = std::fs::remove_dir_all(&dir);

        let indexed = indexed.expect("the index of a file ffmpeg wrote is complete");
        assert!(indexed.lines().count() < every.lines().count() / 4);
        assert_eq!(keyframes(&indexed).0, keyframes(&every).0);
        assert!(keyframes(&every).0.len() > 20);
        assert_eq!(last_pts(&indexed), last_pts(&every));
    }

    fn fixture(name: &str) -> Analysis {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ffprobe");
        let read = |ext: &str| std::fs::read_to_string(dir.join(format!("{name}{ext}"))).unwrap();
        parse(
            &serde_json::from_str(&read(".json")).unwrap(),
            &serde_json::from_str(&read(".frames.json")).unwrap(),
            &read(".packets.csv"),
        )
        .unwrap()
    }

    #[test]
    fn analysis_ignores_unknown_field() {
        let a: Analysis = serde_json::from_str(r#"{"version": 3, "foo": 1, "video": []}"#).unwrap();
        assert_eq!(a.version, 3);
        assert!(is_current(&a));
        assert!(!is_current(&Analysis::default()));
    }

    #[test]
    fn keyframes_keep_their_dts() {
        let csv = "1.543,1.460,K__\n1.501,1.501,___\n0.042,0.000,K__\n0.042,0.000,K__\n";
        assert_eq!(keyframes(csv), (vec![0.042, 1.543], vec![0.0, 1.46]));
        assert_eq!(keyframes("2.0,K__\n"), (vec![2.0], vec![2.0]));
    }

    #[test]
    fn duration_ends_at_the_last_video_frame() {
        let probe = |start: &str| {
            serde_json::json!({
                "format": { "duration": "25.04", "start_time": start, "format_name": "matroska,webm" },
                "streams": []
            })
        };
        let parsed = |start, csv| parse(&probe(start), &Value::Null, csv).unwrap().duration;
        assert_eq!(parsed("0", "0.0,K__\n22.105,___\n10.0,K__\n"), 22.105);
        assert_eq!(parsed("1.5", "1.5,K__\n11.5,___\n"), 10.0);
        // Cover art: one packet, the audio is the content.
        assert_eq!(parsed("0", "0.0,K__\n"), 25.04);
        assert_eq!(parsed("0", ""), 25.04);
    }

    #[test]
    fn parse_h264() {
        let a = fixture("h264_aac_mkv");
        assert_eq!(a.container, "mkv");
        assert_eq!(a.video.len(), 1);
        let v = &a.video[0];
        assert_eq!(
            (v.codec.as_str(), v.bit_depth, v.pix_fmt.as_str()),
            ("h264", 8, "yuv420p")
        );
        assert_eq!(v.hdr, Hdr::Sdr);
        assert!(!a.keyframes.is_empty());
        assert!(a.keyframes.windows(2).all(|w| w[0] < w[1]));
        assert_eq!(a.keyframes[0], v.start_time);
    }

    #[test]
    fn parse_hdr10_truehd_pgs_ass_fonts() {
        let a = fixture("hevc10_hdr10_truehd_pgs_ass_fonts");
        assert_eq!(a.video[0].hdr, Hdr::Hdr10);
        assert_eq!(a.video[0].bit_depth, 10);
        let truehd: Vec<_> = a.audio.iter().filter(|s| s.codec == "truehd").collect();
        assert_eq!(truehd.len(), 1);
        assert_eq!(truehd[0].channels, 8);
        assert!(a.subtitles.iter().any(|s| s.codec == "hdmv_pgs_subtitle"));
        assert!(a.subtitles.iter().any(|s| s.codec == "ass"));
        assert!(a.subtitles.iter().any(|s| s.forced));
        assert!(
            a.attachments
                .iter()
                .any(|f| f.filename.ends_with(".ttf") || f.filename.ends_with(".otf"))
        );
    }

    #[test]
    fn parse_dv_p81() {
        let dv = fixture("dv_p81").video[0].dv.clone().unwrap();
        assert_eq!((dv.profile, dv.bl_compat_id), (8, 1));
    }

    #[test]
    fn parse_dv_p7() {
        assert_eq!(fixture("dv_p7").video[0].dv.clone().unwrap().profile, 7);
    }

    #[test]
    fn parse_av1_dv_p10() {
        let v = &fixture("av1_dv_p10").video[0];
        assert_eq!(v.codec, "av1");
        let dv = v.dv.clone().unwrap();
        assert_eq!((dv.profile, dv.bl_compat_id), (10, 1));
    }

    #[test]
    fn parse_444() {
        assert!(fixture("hevc444").video[0].pix_fmt.contains("444"));
    }

    #[test]
    fn parse_mpeg2_interlaced() {
        let v = &fixture("mpeg2_interlaced").video[0];
        assert_ne!(v.field_order, "progressive");
        assert!(!v.field_order.is_empty());
    }

    #[test]
    fn sdh_from_title_or_disposition() {
        let s = serde_json::json!({"disposition": {"hearing_impaired": 0}});
        assert!(is_sdh(&s, "English [SDH]"));
        assert!(is_sdh(&s, "English CC"));
        assert!(!is_sdh(&s, "Accent"));
        assert!(is_sdh(
            &serde_json::json!({"disposition": {"hearing_impaired": 1}}),
            ""
        ));
    }
}
