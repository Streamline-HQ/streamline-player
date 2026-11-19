//! Where the audio of a written segment ends, read from its boxes. A run that takes over after
//! that segment starts its audio on this exact tick.

use std::path::Path;

use tokio::io::AsyncReadExt;

/// A fragment's `moof` leads the segment and is a few kilobytes: its tables, not its media.
const HEAD_BYTES: u64 = 1 << 20;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Seam {
    /// End of the previous segment's last audio sample, in the audio track's timescale.
    pub audio_end: u64,
    pub timescale: u32,
}

impl Seam {
    pub fn audio_end_secs(&self) -> f64 {
        self.audio_end as f64 / f64::from(self.timescale)
    }
}

struct Boxes<'a>(&'a [u8]);

impl<'a> Iterator for Boxes<'a> {
    type Item = ([u8; 4], &'a [u8]);

    fn next(&mut self) -> Option<Self::Item> {
        let size = be32(self.0, 0)? as usize;
        let kind: [u8; 4] = self.0.get(4..8)?.try_into().ok()?;
        let size = if size == 0 { self.0.len() } else { size };
        let body = self.0.get(8..size)?;
        self.0 = &self.0[size..];
        Some((kind, body))
    }
}

fn child<'a>(data: &'a [u8], kind: &[u8; 4]) -> Option<&'a [u8]> {
    Boxes(data).find(|(k, _)| k == kind).map(|(_, body)| body)
}

fn be32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn be64(b: &[u8], at: usize) -> Option<u64> {
    Some(u64::from_be_bytes(b.get(at..at + 8)?.try_into().ok()?))
}

/// The audio track's id and timescale, from an init segment.
fn audio_track(init: &[u8]) -> Option<(u32, u32)> {
    let moov = child(init, b"moov")?;
    Boxes(moov)
        .filter(|(kind, _)| kind == b"trak")
        .find_map(|(_, trak)| {
            let mdia = child(trak, b"mdia")?;
            if child(mdia, b"hdlr")?.get(8..12)? != b"soun" {
                return None;
            }
            let tkhd = child(trak, b"tkhd")?;
            let mdhd = child(mdia, b"mdhd")?;
            let wide = |b: &[u8]| if b.first() == Some(&1) { 20 } else { 12 };
            Some((be32(tkhd, wide(tkhd))?, be32(mdhd, wide(mdhd))?))
        })
}

fn traf_end(traf: &[u8], track: u32) -> Option<u64> {
    let tfhd = child(traf, b"tfhd")?;
    if be32(tfhd, 4)? != track {
        return None;
    }
    let flags = be32(tfhd, 0)? & 0x00ff_ffff;
    let mut at = 8;
    if flags & 0x1 != 0 {
        at += 8;
    }
    if flags & 0x2 != 0 {
        at += 4;
    }
    let default_duration = if flags & 0x8 != 0 {
        be32(tfhd, at)
    } else {
        None
    };
    let tfdt = child(traf, b"tfdt")?;
    let mut end = if tfdt.first() == Some(&1) {
        be64(tfdt, 4)?
    } else {
        u64::from(be32(tfdt, 4)?)
    };
    for (_, trun) in Boxes(traf).filter(|(kind, _)| kind == b"trun") {
        let flags = be32(trun, 0)? & 0x00ff_ffff;
        let count = u64::from(be32(trun, 4)?);
        let mut at = 8;
        for bit in [0x1, 0x4] {
            if flags & bit != 0 {
                at += 4;
            }
        }
        if flags & 0x100 == 0 {
            end += count * u64::from(default_duration?);
            continue;
        }
        let stride = 4 * [0x100, 0x200, 0x400, 0x800]
            .iter()
            .filter(|bit| flags & **bit != 0)
            .count();
        for i in 0..count as usize {
            end += u64::from(be32(trun, at + i * stride)?);
        }
    }
    Some(end)
}

fn track_end(segment: &[u8], track: u32) -> Option<u64> {
    Boxes(segment)
        .filter(|(kind, _)| kind == b"moof")
        .flat_map(|(_, moof)| Boxes(moof).filter(|(kind, _)| kind == b"traf"))
        .filter_map(|(_, traf)| traf_end(traf, track))
        .max()
}

async fn head(path: &Path) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    tokio::fs::File::open(path)
        .await
        .ok()?
        .take(HEAD_BYTES)
        .read_to_end(&mut out)
        .await
        .ok()?;
    Some(out)
}

/// `None` whenever anything is missing or unreadable: the run then starts as a fresh seek does.
pub async fn read(init: &Path, segment: &Path) -> Option<Seam> {
    let (track, timescale) = audio_track(&head(init).await?)?;
    let audio_end = track_end(&head(segment).await?, track)?;
    (timescale > 0).then_some(Seam {
        audio_end,
        timescale,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn boxed(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut out = ((body.len() + 8) as u32).to_be_bytes().to_vec();
        out.extend(kind);
        out.extend(body);
        out
    }

    fn traf(track: u32, tfdt: u64, default_duration: Option<u32>, durations: &[u32]) -> Vec<u8> {
        let mut tfhd = (if default_duration.is_some() {
            0x8u32
        } else {
            0
        })
        .to_be_bytes()
        .to_vec();
        tfhd.extend(track.to_be_bytes());
        tfhd.extend(default_duration.unwrap_or(0).to_be_bytes());
        let mut time = vec![1, 0, 0, 0];
        time.extend(tfdt.to_be_bytes());
        let per_sample = default_duration.is_none();
        let mut trun = (if per_sample { 0x301u32 } else { 0x201 })
            .to_be_bytes()
            .to_vec();
        trun.extend((durations.len() as u32).to_be_bytes());
        trun.extend(0u32.to_be_bytes());
        for d in durations {
            if per_sample {
                trun.extend(d.to_be_bytes());
            }
            trun.extend(7u32.to_be_bytes());
        }
        let mut body = boxed(b"tfhd", &tfhd);
        body.extend(boxed(b"tfdt", &time));
        body.extend(boxed(b"trun", &trun));
        boxed(b"traf", &body)
    }

    #[test]
    fn audio_end_sums_the_track_s_samples() {
        let mut moof = traf(1, 500, None, &[10, 10]);
        moof.extend(traf(2, 48_000, None, &[1024, 1024, 1000]));
        let segment = boxed(b"moof", &moof);
        assert_eq!(track_end(&segment, 2), Some(51_048));
        assert_eq!(track_end(&segment, 1), Some(520));
        assert_eq!(track_end(&segment, 3), None);
    }

    #[test]
    fn audio_end_uses_the_default_duration() {
        let segment = boxed(b"moof", &traf(2, 96, Some(1024), &[0, 0, 0]));
        assert_eq!(track_end(&segment, 2), Some(96 + 3 * 1024));
    }

    #[test]
    fn truncated_boxes_read_as_nothing() {
        let segment = boxed(b"moof", &traf(2, 96, None, &[1024, 1024]));
        assert_eq!(track_end(&segment[..segment.len() - 6], 2), None);
        assert_eq!(audio_track(b"data\n"), None);
    }
}
