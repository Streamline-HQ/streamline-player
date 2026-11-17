//! Reads a Matroska file's own keyframe index (its Cues), so finding the keyframes does not
//! mean reading every packet of the file.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

const SEGMENT: u32 = 0x1853_8067;
const SEEK_HEAD: u32 = 0x114D_9B74;
const SEEK_ID: u32 = 0x53AB;
const SEEK_POSITION: u32 = 0x53AC;
const INFO: u32 = 0x1549_A966;
const TIMESTAMP_SCALE: u32 = 0x002A_D7B1;
const TRACKS: u32 = 0x1654_AE6B;
const TRACK_NUMBER: u32 = 0xD7;
const TRACK_TYPE: u32 = 0x83;
const CUES: u32 = 0x1C53_BB6B;
const CUE_POINT: u32 = 0xBB;
const CUE_TIME: u32 = 0xB3;
const CUE_TRACK_POSITIONS: u32 = 0xB7;
const CUE_TRACK: u32 = 0xF7;

const VIDEO_TRACK: u64 = 1;
const DEFAULT_SCALE_NS: u64 = 1_000_000;
/// The header, the seek index and the track list sit at the front of a file; one that keeps
/// them further in is analysed the long way.
const HEAD_BYTES: u64 = 1 << 20;
/// A film's Cues take a few hundred kilobytes. More than this is not an index worth trusting.
const MAX_CUES_BYTES: u64 = 64 << 20;

struct Element {
    id: u32,
    start: usize,
    end: usize,
}

/// One EBML variable-length integer at `at`: its value and the offset after it. An id keeps its
/// length marker, a size drops it.
fn vint(b: &[u8], at: usize, id: bool) -> Option<(u64, usize)> {
    let first = *b.get(at)?;
    let len = first.leading_zeros() as usize + 1;
    if len > 8 {
        return None;
    }
    // An eight-byte size has no value bits in its first byte.
    let mask = (0xFF_u16 >> len) as u8;
    let mut v = u64::from(if id { first } else { first & mask });
    for byte in b.get(at + 1..at + len)? {
        v = (v << 8) | u64::from(*byte);
    }
    Some((v, at + len))
}

/// The elements laid end to end in `b[from..to]`, stopping at the first that does not fit.
fn elements(b: &[u8], from: usize, to: usize) -> impl Iterator<Item = Element> + '_ {
    let mut at = from;
    std::iter::from_fn(move || {
        if at >= to {
            return None;
        }
        let (id, after_id) = vint(b, at, true)?;
        let (size, start) = vint(b, after_id, false)?;
        let end = start.checked_add(usize::try_from(size).ok()?)?;
        at = end;
        Some(Element {
            id: u32::try_from(id).ok()?,
            start,
            end,
        })
    })
}

fn uint(b: &[u8], e: &Element) -> Option<u64> {
    let bytes = b.get(e.start..e.end)?;
    (bytes.len() <= 8).then(|| bytes.iter().fold(0, |v, x| (v << 8) | u64::from(*x)))
}

fn read_at(file: &mut File, at: u64, len: u64) -> Option<Vec<u8>> {
    file.seek(SeekFrom::Start(at)).ok()?;
    let mut out = Vec::new();
    file.take(len).read_to_end(&mut out).ok()?;
    Some(out)
}

struct Head {
    /// Where the Cues element starts in the file.
    cues: u64,
    scale_ns: u64,
    video_track: u64,
}

fn head(b: &[u8]) -> Option<Head> {
    let header = elements(b, 0, b.len()).next()?;
    let segment = elements(b, header.end, b.len()).next()?;
    if segment.id != SEGMENT {
        return None;
    }
    let (mut cues, mut scale_ns, mut video_track) = (None, DEFAULT_SCALE_NS, None);
    // The segment runs to the end of the file, far past what was read.
    for top in elements(b, segment.start, b.len()) {
        if top.end > b.len() {
            break;
        }
        match top.id {
            SEEK_HEAD => {
                for seek in elements(b, top.start, top.end) {
                    let (mut id, mut position) = (None, None);
                    for field in elements(b, seek.start, seek.end) {
                        match field.id {
                            SEEK_ID => id = uint(b, &field),
                            SEEK_POSITION => position = uint(b, &field),
                            _ => {}
                        }
                    }
                    if id == Some(u64::from(CUES)) {
                        cues = position.map(|p| segment.start as u64 + p);
                    }
                }
            }
            INFO => {
                for field in elements(b, top.start, top.end) {
                    if field.id == TIMESTAMP_SCALE {
                        scale_ns = uint(b, &field)?;
                    }
                }
            }
            TRACKS => {
                for track in elements(b, top.start, top.end) {
                    let (mut number, mut kind) = (None, None);
                    for field in elements(b, track.start, track.end) {
                        match field.id {
                            TRACK_NUMBER => number = uint(b, &field),
                            TRACK_TYPE => kind = uint(b, &field),
                            _ => {}
                        }
                    }
                    if kind == Some(VIDEO_TRACK) && video_track.is_none() {
                        video_track = number;
                    }
                }
            }
            _ => {}
        }
    }
    Some(Head {
        cues: cues?,
        scale_ns,
        video_track: video_track?,
    })
}

fn cue_times(b: &[u8], h: &Head) -> Vec<f64> {
    let mut out = Vec::new();
    for point in elements(b, 0, b.len()) {
        if point.id != CUE_POINT {
            continue;
        }
        let (mut time, mut video) = (None, false);
        for field in elements(b, point.start, point.end) {
            match field.id {
                CUE_TIME => time = uint(b, &field),
                CUE_TRACK_POSITIONS => {
                    video |= elements(b, field.start, field.end)
                        .any(|f| f.id == CUE_TRACK && uint(b, &f) == Some(h.video_track));
                }
                _ => {}
            }
        }
        if let (Some(t), true) = (time, video) {
            // As ffprobe prints a timestamp: whole nanoseconds over a billion.
            out.push(t.saturating_mul(h.scale_ns) as f64 / 1e9);
        }
    }
    out.sort_by(f64::total_cmp);
    out.dedup();
    out
}

/// The timestamps, in seconds, the file's Cues list for its first video track, in order. `None`
/// when the file is not Matroska, has no Cues or keeps them where this does not look. The Cues
/// of some files skip keyframes, so the caller checks them against the file before use.
pub fn cue_keyframes(path: &Path) -> Option<Vec<f64>> {
    let mut file = File::open(path).ok()?;
    let h = head(&read_at(&mut file, 0, HEAD_BYTES)?)?;
    let start = read_at(&mut file, h.cues, 16)?;
    let cues = elements(&start, 0, start.len()).next()?;
    let len = (cues.end - cues.start) as u64;
    if cues.id != CUES || len > MAX_CUES_BYTES {
        return None;
    }
    let body = read_at(&mut file, h.cues + cues.start as u64, len)?;
    let times = cue_times(&body, &h);
    (!times.is_empty()).then_some(times)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn el(id: &[u8], body: &[u8]) -> Vec<u8> {
        let mut out = id.to_vec();
        // An eight-byte size, which every length fits.
        out.push(0x01);
        out.extend_from_slice(&(body.len() as u64).to_be_bytes()[1..]);
        out.extend_from_slice(body);
        out
    }

    fn cue(time: u8, track: u8) -> Vec<u8> {
        el(
            &[0xBB],
            &[el(&[0xB3], &[time]), el(&[0xB7], &el(&[0xF7], &[track]))].concat(),
        )
    }

    fn file(cues: &[u8]) -> std::path::PathBuf {
        let info = el(
            &[0x15, 0x49, 0xA9, 0x66],
            &el(&[0x2A, 0xD7, 0xB1], &[0x0F, 0x42, 0x40]),
        );
        let track = |number: u8, kind: u8| {
            el(
                &[0xAE],
                &[el(&[0xD7], &[number]), el(&[0x83], &[kind])].concat(),
            )
        };
        let tracks = el(
            &[0x16, 0x54, 0xAE, 0x6B],
            &[track(1, 2), track(2, 1)].concat(),
        );
        // The seek entry is 32 bytes and the head it sits in 12 more, whatever the position.
        let seek = |position: u8| {
            el(
                &[0x11, 0x4D, 0x9B, 0x74],
                &el(
                    &[0x4D, 0xBB],
                    &[
                        el(&[0x53, 0xAB], &[0x1C, 0x53, 0xBB, 0x6B]),
                        el(&[0x53, 0xAC], &[position]),
                    ]
                    .concat(),
                ),
            )
        };
        let before = seek(0).len() + info.len() + tracks.len();
        let body = [seek(before as u8), info, tracks, cues.to_vec()].concat();
        let bytes = [
            el(&[0x1A, 0x45, 0xDF, 0xA3], &[]),
            el(&[0x18, 0x53, 0x80, 0x67], &body),
        ]
        .concat();
        let path = std::env::temp_dir().join(format!(
            "engine-cues-{}-{}.mkv",
            std::process::id(),
            cues.len()
        ));
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn lists_the_video_tracks_cues_in_order() {
        let cues = el(
            &[0x1C, 0x53, 0xBB, 0x6B],
            &[cue(42, 2), cue(7, 1), cue(9, 2), cue(42, 2)].concat(),
        );
        let path = file(&cues);
        let got = cue_keyframes(&path);
        std::fs::remove_file(&path).unwrap();
        assert_eq!(got, Some(vec![0.009, 0.042]));
    }

    #[test]
    fn has_nothing_to_say_without_cues_for_the_video() {
        let path = file(&el(&[0x1C, 0x53, 0xBB, 0x6B], &cue(7, 1)));
        let got = cue_keyframes(&path);
        std::fs::remove_file(&path).unwrap();
        assert_eq!(got, None);

        let not_matroska =
            std::env::temp_dir().join(format!("engine-cues-{}.mp4", std::process::id()));
        std::fs::write(&not_matroska, b"\0\0\0\x18ftypmp42").unwrap();
        let got = cue_keyframes(&not_matroska);
        std::fs::remove_file(&not_matroska).unwrap();
        assert_eq!(got, None);
    }
}
