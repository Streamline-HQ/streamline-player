//! The download queue: one title at a time, prepared by the server and fetched from the engine
//! over Range requests, into a folder that holds everything the player needs to play it alone.
//!
//! The queue knows nothing of Tauri: it takes the directory, the way to call Streamline and a
//! function that receives events, so the tests drive it directly.

use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs,
    future::Future,
    io::{self, Write},
    path::{Path, PathBuf},
    pin::Pin,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Notify;

pub type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;

/// Streamline, as the queue sees it. Errors are the strings `Api::call` gives: the answer's
/// JSON for an HTTP error, anything else for a network failure.
pub trait Server: Send + Sync + 'static {
    fn call(
        &self,
        method: Method,
        path: String,
        body: Option<Value>,
    ) -> BoxFuture<Result<Value, String>>;
    fn picture(&self, path: String) -> BoxFuture<Result<Vec<u8>, String>>;
}

pub type Emit = Arc<dyn Fn(&Snapshot) + Send + Sync>;
pub type OpenPart = Arc<dyn Fn(&Path) -> io::Result<Box<dyn Write + Send>> + Send + Sync>;

#[derive(Clone)]
pub struct Config {
    pub poll: Duration,
    /// Waits before the first, second, ... retry; the last one repeats.
    pub retry: Vec<Duration>,
    /// How long an open transfer may deliver nothing before it counts as lost.
    pub stall: Duration,
    pub open_part: OpenPart,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            poll: Duration::from_secs(2),
            retry: vec![
                Duration::from_secs(5),
                Duration::from_secs(15),
                Duration::from_secs(60),
            ],
            stall: Duration::from_secs(30),
            open_part: Arc::new(|path| {
                let file = fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(path)?;
                Ok(Box::new(file))
            }),
        }
    }
}

const EMIT_EVERY: Duration = Duration::from_millis(250);
const CONTAINERS: [&str; 9] = [
    "mkv", "mp4", "avi", "mov", "webm", "ts", "m4v", "wmv", "mpg",
];
const SUBTITLE_FORMATS: [&str; 4] = ["vtt", "ass", "srt", "sup"];
const FONT_FORMATS: [&str; 3] = ["ttf", "otf", "ttc"];

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Movies,
    Series,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum Quality {
    #[serde(rename = "original")]
    Original,
    #[serde(rename = "1080p")]
    P1080,
    #[serde(rename = "720p")]
    P720,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Queued,
    Preparing,
    Downloading,
    Waiting,
    Failed,
    Done,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Cause {
    PrepareFailed,
    NoSpace,
    Gone,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AudioPick {
    pub index: i64,
    pub language: String,
    pub codec: String,
    pub converted: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SubtitlePick {
    pub index: i64,
    pub language: String,
    pub codec: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Meta {
    pub kind: Kind,
    pub title_id: u32,
    pub title: String,
    pub year: Option<u32>,
    /// Minutes, as the library gives it.
    pub runtime: u32,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub episode_title: Option<String>,
    pub poster: String,
    pub still: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Offline {
    pub position: f64,
    pub done: bool,
    pub at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DownloadEntry {
    pub key: String,
    pub media_id: String,
    pub quality: Quality,
    pub audio: Vec<AudioPick>,
    pub subtitles: Vec<SubtitlePick>,
    pub state: State,
    pub progress: f64,
    pub bytes: u64,
    pub size: u64,
    pub error: Option<Cause>,
    pub added_at: String,
    pub meta: Meta,
    pub watched: bool,
    pub offline: Option<Offline>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct DownloadRequest {
    pub key: String,
    pub media_id: String,
    pub quality: Quality,
    pub audio: Vec<AudioPick>,
    pub subtitles: Vec<SubtitlePick>,
    pub size: u64,
    pub meta: Meta,
    pub watched: bool,
}

#[derive(Clone, Serialize)]
pub struct Snapshot {
    pub items: Vec<DownloadEntry>,
    pub rate: f64,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Storage {
    pub used: u64,
    pub other: u64,
    pub free: u64,
}

#[derive(Serialize)]
pub struct Local {
    pub url: String,
    pub tracks: Value,
    pub position: f64,
}

/// A path built from numbers only, so nothing the server says can name a folder.
fn folder_name(key: &str) -> Option<String> {
    let mut parts = key.split(':');
    let kind = parts.next()?;
    let ids: Vec<&str> = parts.collect();
    let wanted = match kind {
        "movies" => 1,
        "series" => 3,
        _ => return None,
    };
    let numeric =
        |p: &&str| !p.is_empty() && p.len() <= 10 && p.bytes().all(|b| b.is_ascii_digit());
    (ids.len() == wanted && ids.iter().all(numeric)).then(|| format!("{kind}-{}", ids.join("-")))
}

fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn iso(secs: i64) -> String {
    let (days, rest) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    iso(i64::try_from(secs).unwrap_or(0))
}

fn error_code(e: &str) -> Option<String> {
    serde_json::from_str::<Value>(e)
        .ok()?
        .pointer("/error/code")?
        .as_str()
        .map(str::to_owned)
}

/// Whether Streamline answered at all, whatever it said: `Api::call` returns the answer's JSON
/// for an HTTP error and the transport's message otherwise.
pub fn is_answer(e: &str) -> bool {
    serde_json::from_str::<Value>(e).is_ok() && error_code(e).as_deref() != Some("no_server")
}

fn out_of_space(e: &io::Error) -> bool {
    e.kind() == io::ErrorKind::StorageFull || matches!(e.raw_os_error(), Some(28 | 112))
}

enum Stop {
    /// Wait and try again; `true` when this attempt moved the file forward.
    Retry(bool),
    Fail(Cause),
}

fn io_stop(e: io::Error) -> Stop {
    if out_of_space(&e) {
        Stop::Fail(Cause::NoSpace)
    } else {
        eprintln!("downloads: {e}");
        Stop::Retry(false)
    }
}

fn call_stop(e: &str) -> Stop {
    match error_code(e).as_deref() {
        Some("not_found") => Stop::Fail(Cause::Gone),
        Some("invalid_request") => Stop::Fail(Cause::PrepareFailed),
        _ => Stop::Retry(false),
    }
}

struct Job {
    id: String,
    ready: bool,
    failed: bool,
    progress: f64,
    size: Option<u64>,
    container: Option<String>,
    url: Option<String>,
}

fn parse_job(v: &Value) -> Option<Job> {
    let id = v["id"].as_str().filter(|id| safe_id(id))?;
    let state = v["state"].as_str()?;
    Some(Job {
        id: id.to_owned(),
        ready: state == "ready",
        failed: state == "failed",
        progress: v["progress"].as_f64().unwrap_or(0.0),
        size: v["size"].as_u64(),
        container: v["container"].as_str().map(str::to_owned),
        url: v["url"].as_str().map(str::to_owned),
    })
}

#[derive(Default)]
struct Rate {
    ema: f64,
    since: Option<Instant>,
    bytes: u64,
}

impl Rate {
    fn add(&mut self, n: u64) {
        let start = *self.since.get_or_insert_with(Instant::now);
        self.bytes += n;
        let elapsed = start.elapsed();
        if elapsed >= EMIT_EVERY {
            let now = self.bytes as f64 / elapsed.as_secs_f64();
            self.ema = if self.ema == 0.0 {
                now
            } else {
                0.6 * self.ema + 0.4 * now
            };
            self.since = Some(Instant::now());
            self.bytes = 0;
        }
    }

    fn reset(&mut self) {
        *self = Rate::default();
    }
}

struct Active {
    key: String,
    abort: Box<dyn Fn() + Send>,
}

struct Shared {
    items: Vec<DownloadEntry>,
    capabilities: Value,
    rate: Rate,
    active: Option<Active>,
    last_emit: Option<Instant>,
    changes: u64,
}

struct Inner {
    dir: PathBuf,
    server: Arc<dyn Server>,
    /// No default headers: the engine takes a signed URL and nothing else.
    engine: reqwest::Client,
    emit: Emit,
    cfg: Config,
    shared: Mutex<Shared>,
    /// The change the index file holds. The index is written outside `shared`, so a slow disk
    /// never blocks a reader; this keeps a write that lost the race from replacing a newer list.
    saved: Mutex<u64>,
    wake: Notify,
}

pub struct Queue {
    inner: Arc<Inner>,
    worker: tauri::async_runtime::JoinHandle<()>,
}

impl Drop for Queue {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn find_video(dir: &Path) -> Option<PathBuf> {
    CONTAINERS
        .iter()
        .chain(["bin"].iter())
        .map(|ext| dir.join(format!("video.{ext}")))
        .find(|p| p.is_file())
}

fn file_len(path: &Path) -> u64 {
    fs::metadata(path).map_or(0, |m| m.len())
}

fn dir_size(dir: &Path) -> u64 {
    let Ok(read) = fs::read_dir(dir) else {
        return 0;
    };
    read.flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

/// Runs file I/O that can stall on a busy disk without parking an async worker: on a runtime
/// worker, its other tasks move to another thread meanwhile.
fn blocking<T>(f: impl FnOnce() -> T) -> T {
    match tokio::runtime::Handle::try_current() {
        Ok(h) if h.runtime_flavor() == tokio::runtime::RuntimeFlavor::MultiThread => {
            tokio::task::block_in_place(f)
        }
        _ => f(),
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

fn load_index(dir: &Path) -> Vec<DownloadEntry> {
    let items: Vec<DownloadEntry> = fs::read(dir.join("index.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    items
        .into_iter()
        .filter_map(|mut e| {
            let folder = dir.join(folder_name(&e.key)?);
            if !safe_id(&e.media_id) {
                return None;
            }
            match e.state {
                State::Done if find_video(&folder).is_none() => return None,
                State::Done | State::Failed => {}
                _ => {
                    e.state = State::Queued;
                    e.bytes = file_len(&folder.join("video.part"));
                }
            }
            Some(e)
        })
        .collect()
}

impl Queue {
    pub fn new(dir: PathBuf, server: Arc<dyn Server>, emit: Emit, cfg: Config) -> Queue {
        let _ = fs::create_dir_all(&dir);
        let capabilities = fs::read(dir.join("capabilities.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or(Value::Null);
        let inner = Arc::new(Inner {
            dir: dir.clone(),
            server,
            engine: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .read_timeout(Duration::from_secs(30))
                .build()
                .expect("a client with no TLS options builds"),
            emit,
            cfg,
            shared: Mutex::new(Shared {
                items: load_index(&dir),
                capabilities,
                rate: Rate::default(),
                active: None,
                last_emit: None,
                changes: 0,
            }),
            saved: Mutex::new(0),
            wake: Notify::new(),
        });
        let worker = tauri::async_runtime::spawn(inner.clone().work());
        Queue { inner, worker }
    }

    pub fn shutdown(&self) {
        self.worker.abort();
        if let Some(active) = self.inner.shared.lock().unwrap().active.take() {
            (active.abort)();
        }
    }

    pub fn items(&self) -> Vec<DownloadEntry> {
        self.inner.shared.lock().unwrap().items.clone()
    }

    /// Adds what is not already there; a request with a key or an ID that could name a path is dropped.
    pub fn start(&self, requests: Vec<DownloadRequest>, capabilities: Value) {
        let inner = &self.inner;
        let _ = write_atomic(
            &inner.dir.join("capabilities.json"),
            capabilities.to_string().as_bytes(),
        );
        {
            let mut shared = inner.shared.lock().unwrap();
            shared.capabilities = capabilities;
            for r in requests {
                let known = shared.items.iter().any(|e| e.key == r.key);
                if known
                    || folder_name(&r.key).is_none()
                    || !safe_id(&r.media_id)
                    || r.audio.is_empty()
                {
                    continue;
                }
                shared.items.push(DownloadEntry {
                    key: r.key,
                    media_id: r.media_id,
                    quality: r.quality,
                    audio: r.audio,
                    subtitles: r.subtitles,
                    state: State::Queued,
                    progress: 0.0,
                    bytes: 0,
                    size: r.size,
                    error: None,
                    added_at: now_iso(),
                    meta: r.meta,
                    watched: r.watched,
                    offline: None,
                });
            }
        }
        inner.changed();
        inner.wake.notify_one();
    }

    /// Stops what is running for these, tells Streamline about jobs it never heard `complete`
    /// for, and deletes the folders.
    pub async fn remove(&self, keys: Vec<String>) {
        let inner = &self.inner;
        for key in keys {
            let entry = {
                let mut shared = inner.shared.lock().unwrap();
                shared
                    .items
                    .iter()
                    .position(|e| e.key == key)
                    .map(|i| shared.items.remove(i))
            };
            let Some(entry) = entry else { continue };
            inner.changed();
            let running = {
                let shared = inner.shared.lock().unwrap();
                shared
                    .active
                    .as_ref()
                    .filter(|a| a.key == key)
                    .map(|a| (a.abort)())
                    .is_some()
            };
            if running {
                for _ in 0..500 {
                    if inner
                        .shared
                        .lock()
                        .unwrap()
                        .active
                        .as_ref()
                        .is_none_or(|a| a.key != key)
                    {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            }
            let Some(name) = folder_name(&key) else {
                continue;
            };
            let folder = inner.dir.join(name);
            if entry.state != State::Done
                && let Ok(id) = fs::read_to_string(folder.join("job"))
                && safe_id(&id)
            {
                let _ = inner
                    .server
                    .call(Method::DELETE, format!("/downloads/{id}"), None)
                    .await;
            }
            let _ = fs::remove_dir_all(folder);
        }
    }

    pub fn retry(&self, key: &str) {
        self.inner.update(key, |e| {
            if e.state == State::Failed {
                e.state = State::Queued;
                e.error = None;
            }
        });
        self.inner.wake.notify_one();
    }

    pub fn storage(&self) -> Storage {
        let dir = &self.inner.dir;
        let used = dir_size(dir);
        let total = fs4::total_space(dir).unwrap_or(0);
        let free = fs4::available_space(dir).unwrap_or(0);
        Storage {
            used,
            other: total.saturating_sub(free).saturating_sub(used),
            free,
        }
    }

    pub fn local_playback(&self, key: &str) -> Option<Local> {
        let entry = self.entry(key).filter(|e| e.state == State::Done)?;
        let folder = self.inner.dir.join(folder_name(key)?);
        let video = find_video(&folder)?;
        let tracks = fs::read(folder.join("tracks.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or(Value::Null);
        Some(Local {
            url: video.to_string_lossy().into_owned(),
            tracks,
            position: entry.offline.map_or(0.0, |o| o.position),
        })
    }

    pub fn note_offline(&self, key: &str, position: f64, done: bool) {
        self.inner.update(key, |e| {
            e.offline = Some(Offline {
                position,
                done,
                at: now_iso(),
            });
            e.watched |= done;
        });
    }

    /// Posts every note to Streamline. A note goes once the server has answered, whatever it
    /// answered; a network failure keeps it for the next try.
    pub async fn sync_offline(&self) -> usize {
        let inner = &self.inner;
        let notes: Vec<_> = self
            .items()
            .into_iter()
            .filter_map(|e| Some((e.key, e.media_id, e.meta.runtime, e.offline?)))
            .collect();
        let mut cleared = 0;
        for (key, media_id, runtime, note) in notes {
            let duration = i64::from(runtime) * 60;
            let position = if note.done {
                duration
            } else {
                note.position.round() as i64
            };
            let body = json!({
                "position_seconds": position,
                "duration_seconds": duration,
                "at": note.at,
            });
            let sent = inner
                .server
                .call(Method::PUT, format!("/watchstate/{media_id}"), Some(body))
                .await;
            if sent.as_ref().is_err_and(|e| !is_answer(e)) {
                continue;
            }
            inner.update(&key, |e| {
                if e.offline.as_ref().is_some_and(|o| o.at == note.at) {
                    e.offline = None;
                }
            });
            cleared += 1;
        }
        cleared
    }

    /// The picture a download saved for this artwork path, if it saved one.
    pub fn local_artwork(&self, path: &str) -> Option<Vec<u8>> {
        let path = path.trim_start_matches('/');
        let items = self.items();
        let (entry, file) = items.iter().find_map(|e| {
            if e.meta.poster.trim_start_matches('/') == path {
                Some((e, "poster"))
            } else if e.meta.still.trim_start_matches('/') == path {
                Some((e, "still"))
            } else {
                None
            }
        })?;
        fs::read(self.inner.dir.join(folder_name(&entry.key)?).join(file)).ok()
    }

    fn entry(&self, key: &str) -> Option<DownloadEntry> {
        self.items().into_iter().find(|e| e.key == key)
    }
}

/// A file inside the downloads folder, read as text; any other local path is refused.
pub fn read_local_text(downloads: &Path, path: &str) -> Result<String, String> {
    let root = downloads.canonicalize().map_err(|e| e.to_string())?;
    let file = Path::new(path).canonicalize().map_err(|e| e.to_string())?;
    if !file.starts_with(&root) {
        return Err("not a download".into());
    }
    fs::read_to_string(file).map_err(|e| e.to_string())
}

/// Whether `path` names a file inside the downloads folder.
pub fn is_local(path: &str) -> bool {
    !path.starts_with("http://") && !path.starts_with("https://")
}

impl Inner {
    fn snapshot(&self, shared: &mut Shared) -> Snapshot {
        shared.last_emit = Some(Instant::now());
        let downloading = shared.items.iter().any(|e| e.state == State::Downloading);
        Snapshot {
            items: shared.items.clone(),
            rate: if downloading { shared.rate.ema } else { 0.0 },
        }
    }

    fn save_index(&self, items: &[DownloadEntry], change: u64) {
        let mut saved = self.saved.lock().unwrap();
        if *saved >= change {
            return;
        }
        *saved = change;
        match serde_json::to_vec(items) {
            Ok(bytes) => {
                let path = self.dir.join("index.json");
                if let Err(e) = blocking(|| write_atomic(&path, &bytes)) {
                    eprintln!("downloads: the index was not saved: {e}");
                }
            }
            Err(e) => eprintln!("downloads: the index did not serialize: {e}"),
        }
    }

    /// Saves and announces the list.
    fn changed(&self) {
        let (snapshot, change) = {
            let mut shared = self.shared.lock().unwrap();
            shared.changes += 1;
            (self.snapshot(&mut shared), shared.changes)
        };
        self.save_index(&snapshot.items, change);
        (self.emit)(&snapshot);
    }

    fn update(&self, key: &str, apply: impl FnOnce(&mut DownloadEntry)) {
        {
            let mut shared = self.shared.lock().unwrap();
            let Some(entry) = shared.items.iter_mut().find(|e| e.key == key) else {
                return;
            };
            apply(entry);
            if entry.state != State::Downloading {
                shared.rate.reset();
            }
        }
        self.changed();
    }

    fn entry(&self, key: &str) -> Option<DownloadEntry> {
        let shared = self.shared.lock().unwrap();
        shared.items.iter().find(|e| e.key == key).cloned()
    }

    /// The bytes that just landed; announced at most four times a second.
    fn arrived(&self, key: &str, n: u64) {
        let snapshot = {
            let mut shared = self.shared.lock().unwrap();
            shared.rate.add(n);
            let Some(entry) = shared.items.iter_mut().find(|e| e.key == key) else {
                return;
            };
            entry.bytes += n;
            entry.progress = if entry.size > 0 {
                (entry.bytes as f64 / entry.size as f64).min(1.0)
            } else {
                0.0
            };
            if shared.last_emit.is_some_and(|t| t.elapsed() < EMIT_EVERY) {
                return;
            }
            self.snapshot(&mut shared)
        };
        (self.emit)(&snapshot);
    }

    async fn work(self: Arc<Self>) {
        loop {
            let next = {
                let shared = self.shared.lock().unwrap();
                shared
                    .items
                    .iter()
                    .find(|e| e.state == State::Queued)
                    .map(|e| e.key.clone())
            };
            let Some(key) = next else {
                self.wake.notified().await;
                continue;
            };
            let task = tauri::async_runtime::spawn({
                let (inner, key) = (self.clone(), key.clone());
                async move { inner.run(&key).await }
            });
            let handle = task.inner().abort_handle();
            self.shared.lock().unwrap().active = Some(Active {
                key,
                abort: Box::new(move || handle.abort()),
            });
            let _ = task.await;
            self.shared.lock().unwrap().active = None;
        }
    }

    async fn run(&self, key: &str) {
        let mut stalled = 0;
        loop {
            match self.attempt(key).await {
                Ok(()) => return,
                Err(Stop::Fail(cause)) => {
                    self.update(key, |e| {
                        e.state = State::Failed;
                        e.error = Some(cause);
                    });
                    return;
                }
                Err(Stop::Retry(moved)) => {
                    if moved {
                        stalled = 0;
                        continue;
                    }
                    self.update(key, |e| e.state = State::Waiting);
                    let waits = &self.cfg.retry;
                    let wait = waits
                        .get(stalled)
                        .or(waits.last())
                        .copied()
                        .unwrap_or_default();
                    stalled += 1;
                    tokio::time::sleep(wait).await;
                }
            }
        }
    }

    async fn attempt(&self, key: &str) -> Result<(), Stop> {
        let Some(entry) = self.entry(key) else {
            return Ok(());
        };
        let Some(name) = folder_name(key) else {
            return Err(Stop::Fail(Cause::Gone));
        };
        let dir = self.dir.join(name);
        fs::create_dir_all(&dir).map_err(io_stop)?;
        if find_video(&dir).is_none() {
            // A retry stays Waiting until the server answers: going through Preparing on every
            // attempt would flicker the state while the network is down.
            self.update(key, |e| {
                if e.state != State::Waiting {
                    e.state = State::Preparing;
                }
                e.error = None;
            });
            let job = self.prepare(&entry, &dir, None).await?;
            self.fetch_video(&entry, &dir, job).await?;
        }
        self.update(key, |e| e.state = State::Downloading);
        self.side_files(&entry, &dir).await?;
        self.complete(&entry, &dir).await
    }

    async fn job(&self, entry: &DownloadEntry, known: Option<&str>) -> Result<Job, Stop> {
        let answer = match known {
            Some(id) => {
                let got = self
                    .server
                    .call(Method::GET, format!("/downloads/{id}"), None)
                    .await;
                match got {
                    Err(e) if error_code(&e).as_deref() == Some("not_found") => None,
                    other => Some(other),
                }
            }
            None => None,
        };
        let answer = match answer {
            Some(a) => a,
            None => {
                let capabilities = self.shared.lock().unwrap().capabilities.clone();
                let body = json!({
                    "media_id": entry.media_id,
                    "quality": entry.quality,
                    "audio_indexes": entry.audio.iter().map(|a| a.index).collect::<Vec<_>>(),
                    "capabilities": capabilities,
                });
                self.server
                    .call(Method::POST, "/downloads".into(), Some(body))
                    .await
            }
        };
        let value = answer.map_err(|e| call_stop(&e))?;
        parse_job(&value).ok_or(Stop::Retry(false))
    }

    /// Posts the job (or asks for it again) and waits until the server has it ready.
    async fn prepare(
        &self,
        entry: &DownloadEntry,
        dir: &Path,
        known: Option<&str>,
    ) -> Result<Job, Stop> {
        let mut job = self.job(entry, known).await?;
        if let Err(e) = fs::write(dir.join("job"), &job.id) {
            return Err(io_stop(e));
        }
        loop {
            if job.failed {
                return Err(Stop::Fail(Cause::PrepareFailed));
            }
            if job.ready {
                if job.size.is_none() {
                    return Err(Stop::Fail(Cause::PrepareFailed));
                }
                return if job.url.is_some() {
                    Ok(job)
                } else {
                    Err(Stop::Retry(false))
                };
            }
            self.update(&entry.key, |e| {
                e.state = State::Preparing;
                e.progress = job.progress;
            });
            tokio::time::sleep(self.cfg.poll).await;
            job = self.job(entry, Some(&job.id)).await?;
        }
    }

    async fn fetch_video(&self, entry: &DownloadEntry, dir: &Path, first: Job) -> Result<(), Stop> {
        let key = &entry.key;
        let mut job = first;
        let size = job.size.unwrap_or_default();
        let part = dir.join("video.part");
        self.update(key, |e| {
            e.state = State::Downloading;
            e.size = size;
            e.bytes = file_len(&part).min(size);
            e.progress = if size > 0 {
                e.bytes as f64 / size as f64
            } else {
                0.0
            };
        });
        if file_len(&part) > size {
            let _ = fs::remove_file(&part);
        }
        let mut moved = false;
        let mut refreshed = false;
        while file_len(&part) < size {
            let before = file_len(&part);
            let url = job.url.clone().unwrap_or_default();
            let mut request = self.engine.get(&url);
            if before > 0 {
                request = request.header("Range", format!("bytes={before}-"));
            }
            let Ok(mut response) = request.send().await else {
                return Err(Stop::Retry(moved));
            };
            let status = response.status().as_u16();
            match status {
                206 => {}
                200 => {
                    if before > 0 {
                        fs::remove_file(&part).map_err(io_stop)?;
                        self.update(key, |e| {
                            e.bytes = 0;
                            e.progress = 0.0;
                        });
                    }
                }
                403 | 404 if !refreshed => {
                    refreshed = true;
                    job = self.prepare(entry, dir, Some(&job.id)).await?;
                    self.update(key, |e| e.state = State::Downloading);
                    continue;
                }
                _ => return Err(Stop::Retry(moved)),
            }
            refreshed = false;
            let mut writer = (self.cfg.open_part)(&part).map_err(io_stop)?;
            let start = file_len(&part);
            loop {
                let chunk = tokio::time::timeout(self.cfg.stall, response.chunk()).await;
                match chunk {
                    Err(_) => break,
                    Ok(Err(_)) | Ok(Ok(None)) => break,
                    Ok(Ok(Some(bytes))) => {
                        blocking(|| writer.write_all(&bytes)).map_err(io_stop)?;
                        self.arrived(key, bytes.len() as u64);
                    }
                }
            }
            blocking(|| writer.flush()).map_err(io_stop)?;
            drop(writer);
            let now = file_len(&part);
            moved |= now > start.max(before);
            if now > size {
                let _ = fs::remove_file(&part);
                return Err(Stop::Retry(false));
            }
            if now < size && now <= before {
                return Err(Stop::Retry(moved));
            }
        }
        if let Ok(file) = fs::File::open(&part) {
            let _ = blocking(|| file.sync_all());
        }
        let ext = job
            .container
            .as_deref()
            .filter(|c| CONTAINERS.contains(c))
            .unwrap_or("bin");
        fs::rename(&part, dir.join(format!("video.{ext}"))).map_err(io_stop)?;
        self.update(key, |e| {
            e.bytes = size;
            e.progress = 1.0;
        });
        Ok(())
    }

    /// Fetches a small file from the engine into `dest`. `Ok(false)` when it could not be had.
    async fn small_file(&self, url: &str, dest: &Path) -> Result<bool, Stop> {
        if dest.is_file() {
            return Ok(true);
        }
        let got = async {
            self.engine
                .get(url)
                .send()
                .await?
                .error_for_status()?
                .bytes()
                .await
        };
        let Ok(bytes) = got.await else {
            return Ok(false);
        };
        match write_atomic(dest, &bytes) {
            Ok(()) => Ok(true),
            Err(e) if out_of_space(&e) => Err(Stop::Fail(Cause::NoSpace)),
            Err(_) => Ok(false),
        }
    }

    async fn side_files(&self, entry: &DownloadEntry, dir: &Path) -> Result<(), Stop> {
        let answer = self
            .server
            .call(
                Method::GET,
                format!("/playback/media/{}/tracks", entry.media_id),
                None,
            )
            .await
            .map_err(|e| call_stop(&e))?;
        let mut tracks = answer;
        let picked =
            |index: &Value, from: &[i64]| index.as_i64().is_some_and(|i| from.contains(&i));
        let audio: Vec<i64> = entry.audio.iter().map(|a| a.index).collect();
        let subtitles: Vec<i64> = entry.subtitles.iter().map(|s| s.index).collect();
        let local = |p: &Path| Value::String(p.to_string_lossy().into_owned());

        let kept_audio: Vec<Value> = tracks["audio"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter(|t| picked(&t["index"], &audio))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        let mut kept_subtitles = Vec::new();
        let offered: Vec<Value> = tracks["subtitles"].as_array().cloned().unwrap_or_default();
        for mut track in offered
            .into_iter()
            .filter(|t| picked(&t["index"], &subtitles))
        {
            let index = track["index"].as_i64().unwrap_or_default();
            let mut files = serde_json::Map::new();
            let remote = track["files"].as_object().cloned().unwrap_or_default();
            for (format, url) in remote {
                let (Some(url), true) = (url.as_str(), SUBTITLE_FORMATS.contains(&format.as_str()))
                else {
                    continue;
                };
                let dest = dir.join(format!("sub-{index}.{format}"));
                if self.small_file(url, &dest).await? {
                    files.insert(format, local(&dest));
                }
            }
            if !files.is_empty() {
                track["files"] = Value::Object(files);
                kept_subtitles.push(track);
            }
        }
        let mut fonts = Vec::new();
        let offered: Vec<Value> = tracks["fonts"].as_array().cloned().unwrap_or_default();
        for url in offered.iter().filter_map(Value::as_str) {
            let path = url.split(['?', '#']).next().unwrap_or_default();
            let ext = path
                .rsplit('.')
                .next()
                .unwrap_or_default()
                .to_ascii_lowercase();
            let Some(ext) = FONT_FORMATS.iter().find(|f| **f == ext) else {
                continue;
            };
            let dest = dir.join(format!("font-{}.{ext}", fonts.len()));
            if self.small_file(url, &dest).await? {
                fonts.push(local(&dest));
            }
        }
        tracks["preparing"] = json!(false);
        tracks["audio"] = Value::Array(kept_audio);
        tracks["subtitles"] = Value::Array(kept_subtitles);
        tracks["fonts"] = Value::Array(fonts);
        tracks["trickplay"] = Value::Null;
        write_atomic(&dir.join("tracks.json"), tracks.to_string().as_bytes()).map_err(io_stop)?;

        for (name, path) in [("poster", &entry.meta.poster), ("still", &entry.meta.still)] {
            let dest = dir.join(name);
            if path.is_empty() || dest.is_file() {
                continue;
            }
            let picture = self
                .server
                .picture(format!("/{}", path.trim_start_matches('/')))
                .await;
            if let Ok(bytes) = picture
                && let Err(e) = write_atomic(&dest, &bytes)
                && out_of_space(&e)
            {
                return Err(Stop::Fail(Cause::NoSpace));
            }
        }
        Ok(())
    }

    async fn complete(&self, entry: &DownloadEntry, dir: &Path) -> Result<(), Stop> {
        let job_file = dir.join("job");
        if let Ok(id) = fs::read_to_string(&job_file)
            && safe_id(&id)
        {
            let sent = self
                .server
                .call(Method::POST, format!("/downloads/{id}/complete"), None)
                .await;
            if sent.is_err_and(|e| !is_answer(&e)) {
                return Err(Stop::Retry(false));
            }
        }
        let _ = fs::remove_file(job_file);
        let size = find_video(dir).map_or(entry.size, |v| file_len(&v));
        self.update(&entry.key, |e| {
            e.state = State::Done;
            e.error = None;
            e.size = size;
            e.bytes = size;
            e.progress = 1.0;
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        collections::{HashMap, HashSet},
        io::{BufRead, BufReader, Read},
        net::{SocketAddr, TcpListener, TcpStream},
        sync::atomic::{AtomicBool, AtomicUsize, Ordering},
        thread,
    };

    #[derive(Clone, Debug)]
    struct Seen {
        method: String,
        path: String,
        headers: HashMap<String, String>,
        body: String,
    }

    #[derive(Clone, Copy)]
    enum Mode {
        Normal,
        /// Honours Range, then delivers only up to this many bytes in total and stalls.
        CutAndHold(usize),
        /// A 200 for the first bytes only, whatever Range says, ending cleanly.
        Short(usize),
    }

    struct World {
        media: HashMap<String, Vec<u8>>,
        seen: Vec<Seen>,
        events: Vec<String>,
        failing: HashSet<String>,
        missing: HashSet<String>,
        mode: Mode,
        forbid_next: u32,
        sigs: u32,
        valid_from: u32,
        tracks: Value,
    }

    struct Fake {
        addr: SocketAddr,
        world: Arc<Mutex<World>>,
        down: Arc<AtomicBool>,
    }

    fn respond(stream: &mut TcpStream, status: &str, headers: &[(&str, String)], body: &[u8]) {
        let mut head = format!("HTTP/1.1 {status}\r\nConnection: close\r\n");
        for (k, v) in headers {
            head.push_str(&format!("{k}: {v}\r\n"));
        }
        head.push_str("\r\n");
        let _ = stream.write_all(head.as_bytes());
        let _ = stream.write_all(body);
    }

    fn json_reply(stream: &mut TcpStream, status: &str, body: Value) {
        let text = body.to_string();
        respond(
            stream,
            status,
            &[
                ("Content-Type", "application/json".into()),
                ("Content-Length", text.len().to_string()),
            ],
            text.as_bytes(),
        );
    }

    fn query_sig(path: &str) -> Option<u32> {
        path.split("sig=").nth(1)?.split('&').next()?.parse().ok()
    }

    impl Fake {
        fn start(media: &[(&str, Vec<u8>)]) -> Fake {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let addr = listener.local_addr().unwrap();
            let world = Arc::new(Mutex::new(World {
                media: media
                    .iter()
                    .map(|(k, v)| (k.to_string(), v.clone()))
                    .collect(),
                seen: vec![],
                events: vec![],
                failing: HashSet::new(),
                missing: HashSet::new(),
                mode: Mode::Normal,
                forbid_next: 0,
                sigs: 0,
                valid_from: 0,
                tracks: json!({
                    "preparing": false, "container": "mkv", "video": null, "chapters": [],
                    "markers": { "intro": null, "credits": null },
                    "audio": [{ "index": 1 }, { "index": 2 }],
                    "subtitles": [], "fonts": [], "trickplay": { "url": "x" },
                }),
            }));
            let down = Arc::new(AtomicBool::new(false));
            let (w, d) = (world.clone(), down.clone());
            thread::spawn(move || {
                for stream in listener.incoming().flatten() {
                    if d.load(Ordering::Relaxed) {
                        continue;
                    }
                    let w = w.clone();
                    thread::spawn(move || Fake::serve(stream, addr, w));
                }
            });
            Fake { addr, world, down }
        }

        fn base(&self) -> String {
            format!("http://{}", self.addr)
        }

        fn serve(mut stream: TcpStream, addr: SocketAddr, world: Arc<Mutex<World>>) {
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            if reader.read_line(&mut line).unwrap_or(0) == 0 {
                return;
            }
            let mut parts = line.split_whitespace();
            let (method, path) = (
                parts.next().unwrap().to_owned(),
                parts.next().unwrap().to_owned(),
            );
            let mut headers = HashMap::new();
            loop {
                let mut h = String::new();
                reader.read_line(&mut h).unwrap();
                let h = h.trim_end();
                if h.is_empty() {
                    break;
                }
                if let Some((k, v)) = h.split_once(':') {
                    headers.insert(k.to_lowercase(), v.trim().to_owned());
                }
            }
            let length: usize = headers
                .get("content-length")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            let mut body = vec![0; length];
            reader.read_exact(&mut body).unwrap();
            let body = String::from_utf8_lossy(&body).into_owned();
            let seen = Seen {
                method: method.clone(),
                path: path.clone(),
                headers: headers.clone(),
                body: body.clone(),
            };
            world.lock().unwrap().seen.push(seen);
            let base = format!("http://{addr}");
            let route = path.split('?').next().unwrap().to_owned();

            if let Some(rest) = route.strip_prefix("/api/v1") {
                Fake::streamline(&mut stream, &world, &base, &method, rest, &body);
            } else if let Some(job) = route.strip_prefix("/dl/") {
                Fake::engine(&mut stream, &world, job, &path, &headers);
            } else if route.ends_with(".exe") {
                respond(
                    &mut stream,
                    "200 OK",
                    &[("Content-Length", "2".into())],
                    b"MZ",
                );
            } else {
                respond(
                    &mut stream,
                    "200 OK",
                    &[("Content-Length", "9".into())],
                    b"file data",
                );
            }
        }

        fn streamline(
            stream: &mut TcpStream,
            world: &Arc<Mutex<World>>,
            base: &str,
            method: &str,
            rest: &str,
            body: &str,
        ) {
            let mut w = world.lock().unwrap();
            let mut mint = |w: &mut World, id: &str| {
                w.sigs += 1;
                format!("{base}/dl/{id}?exp=1&sig={}", w.sigs)
            };
            let view = |w: &mut World,
                        media: &str,
                        ready: bool,
                        mint: &mut dyn FnMut(&mut World, &str) -> String| {
                let id = format!("j{media}");
                if w.failing.contains(media) {
                    return json!({ "id": id, "media_id": media, "state": "failed", "progress": 0, "size": null, "container": null, "url": null, "error": { "code": "prepare_failed" } });
                }
                if !ready {
                    return json!({ "id": id, "media_id": media, "state": "preparing", "progress": 0.5, "size": null, "container": null, "url": null });
                }
                let size = w.media[media].len();
                let url = mint(w, &id);
                json!({ "id": id, "media_id": media, "state": "ready", "progress": 1, "size": size, "container": "mkv", "url": url })
            };
            match (method, rest) {
                ("POST", "/downloads") => {
                    let b: Value = serde_json::from_str(body).unwrap();
                    let media = b["media_id"].as_str().unwrap().to_owned();
                    w.events.push(format!("post:{media}"));
                    if w.missing.contains(&media) {
                        return json_reply(
                            stream,
                            "404 Not Found",
                            json!({ "error": { "code": "not_found" } }),
                        );
                    }
                    let v = view(&mut w, &media, false, &mut mint);
                    json_reply(stream, "201 Created", v)
                }
                ("GET", r) if r.starts_with("/downloads/j") => {
                    let media = r.trim_start_matches("/downloads/j").to_owned();
                    w.events.push(format!("get:{media}"));
                    let v = view(&mut w, &media, true, &mut mint);
                    json_reply(stream, "200 OK", v)
                }
                ("POST", r) if r.ends_with("/complete") => {
                    let media = r
                        .trim_start_matches("/downloads/j")
                        .trim_end_matches("/complete")
                        .to_owned();
                    w.events.push(format!("complete:{media}"));
                    respond(stream, "204 No Content", &[], b"")
                }
                ("DELETE", r) if r.starts_with("/downloads/j") => {
                    let media = r.trim_start_matches("/downloads/j").to_owned();
                    w.events.push(format!("delete:{media}"));
                    respond(stream, "204 No Content", &[], b"")
                }
                ("GET", r) if r.starts_with("/playback/media/") => {
                    let tracks = w.tracks.clone();
                    json_reply(stream, "200 OK", tracks)
                }
                ("PUT", r) if r.starts_with("/watchstate/") => {
                    w.events
                        .push(format!("watch:{}", r.trim_start_matches("/watchstate/")));
                    json_reply(stream, "200 OK", json!({}))
                }
                ("GET", r) if r.starts_with("/posters/") => {
                    respond(stream, "200 OK", &[("Content-Length", "3".into())], b"img")
                }
                _ => json_reply(
                    stream,
                    "404 Not Found",
                    json!({ "error": { "code": "not_found" } }),
                ),
            }
        }

        fn engine(
            stream: &mut TcpStream,
            world: &Arc<Mutex<World>>,
            job: &str,
            path: &str,
            headers: &HashMap<String, String>,
        ) {
            let (data, mode, forbidden) = {
                let mut w = world.lock().unwrap();
                let media = job
                    .split('?')
                    .next()
                    .unwrap()
                    .trim_start_matches('j')
                    .to_owned();
                let stale = query_sig(path).is_none_or(|s| s < w.valid_from);
                let forbidden = stale || w.forbid_next > 0;
                w.forbid_next = w.forbid_next.saturating_sub(1);
                (
                    w.media.get(&media).cloned().unwrap_or_default(),
                    w.mode,
                    forbidden,
                )
            };
            if forbidden {
                return respond(
                    stream,
                    "403 Forbidden",
                    &[("Content-Length", "0".into())],
                    b"",
                );
            }
            let start = headers
                .get("range")
                .and_then(|r| r.strip_prefix("bytes="))
                .and_then(|r| r.trim_end_matches('-').parse::<usize>().ok());
            if let Mode::Short(cap) = mode {
                return respond(
                    stream,
                    "200 OK",
                    &[("Content-Length", cap.to_string())],
                    &data[..cap],
                );
            }
            let from = start.unwrap_or(0).min(data.len());
            let status = if start.is_some() {
                "206 Partial Content"
            } else {
                "200 OK"
            };
            let head = [
                ("Content-Length", (data.len() - from).to_string()),
                (
                    "Content-Range",
                    format!("bytes {from}-{}/{}", data.len() - 1, data.len()),
                ),
            ];
            match mode {
                Mode::CutAndHold(cap) => {
                    respond(stream, status, &head, &data[from..cap.max(from)]);
                    thread::sleep(Duration::from_secs(8));
                }
                _ => respond(stream, status, &head, &data[from..]),
            }
        }

        fn events(&self) -> Vec<String> {
            self.world.lock().unwrap().events.clone()
        }

        fn seen(&self) -> Vec<Seen> {
            self.world.lock().unwrap().seen.clone()
        }
    }

    struct Remote {
        base: String,
        client: reqwest::Client,
    }

    impl Server for Remote {
        fn call(
            &self,
            method: Method,
            path: String,
            body: Option<Value>,
        ) -> BoxFuture<Result<Value, String>> {
            let url = format!("{}/api/v1{path}", self.base);
            let mut req = self.client.request(method, url).header("X-API-Key", "key");
            if let Some(b) = body {
                req = req.json(&b);
            }
            Box::pin(async move {
                let resp = req.send().await.map_err(|e| e.to_string())?;
                let status = resp.status();
                let text = resp.text().await.map_err(|e| e.to_string())?;
                let value = if text.is_empty() {
                    Value::Null
                } else {
                    serde_json::from_str(&text).map_err(|e| e.to_string())?
                };
                if status.is_success() {
                    Ok(value)
                } else {
                    Err(value.to_string())
                }
            })
        }

        fn picture(&self, path: String) -> BoxFuture<Result<Vec<u8>, String>> {
            let req = self
                .client
                .get(format!("{}/api/v1/posters{path}", self.base))
                .header("X-API-Key", "key");
            Box::pin(async move {
                let r = req
                    .send()
                    .await
                    .map_err(|e| e.to_string())?
                    .error_for_status()
                    .map_err(|e| e.to_string())?;
                Ok(r.bytes().await.map_err(|e| e.to_string())?.to_vec())
            })
        }
    }

    fn scratch(name: &str) -> PathBuf {
        // tmpfs where there is one: on a loaded build machine one disk write can outlast a test's wait.
        let base = Path::new("/dev/shm");
        let base = if base.is_dir() {
            base.to_owned()
        } else {
            std::env::temp_dir()
        };
        let dir = base.join(format!("downloads-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fast() -> Config {
        Config {
            poll: Duration::from_millis(20),
            retry: vec![Duration::from_millis(60)],
            stall: Duration::from_secs(30),
            ..Config::default()
        }
    }

    fn queue(dir: &Path, fake: &Fake, cfg: Config) -> Queue {
        let server = Arc::new(Remote {
            base: fake.base(),
            client: reqwest::Client::new(),
        });
        Queue::new(dir.to_owned(), server, Arc::new(|_| {}), cfg)
    }

    fn data(n: usize) -> Vec<u8> {
        (0..n).map(|i| (i * 7 % 251) as u8).collect()
    }

    fn request(n: u32, size: usize) -> DownloadRequest {
        DownloadRequest {
            key: format!("movies:{n}"),
            media_id: format!("m{n}"),
            quality: Quality::Original,
            audio: vec![AudioPick {
                index: 1,
                language: "en".into(),
                codec: "eac3".into(),
                converted: false,
            }],
            subtitles: vec![],
            size: size as u64,
            meta: Meta {
                kind: Kind::Movies,
                title_id: n,
                title: format!("Film {n}"),
                year: Some(2020),
                runtime: 100,
                season: None,
                episode: None,
                episode_title: None,
                poster: format!("movies/{n}/poster.jpg"),
                still: String::new(),
            },
            watched: false,
        }
    }

    fn until(what: &str, mut cond: impl FnMut() -> bool) {
        let end = Instant::now() + Duration::from_secs(20);
        while !cond() {
            assert!(Instant::now() < end, "timed out waiting for {what}");
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn state_of(q: &Queue, key: &str) -> Option<State> {
        q.items().iter().find(|e| e.key == key).map(|e| e.state)
    }

    fn done(q: &Queue, key: &str) -> bool {
        state_of(q, key) == Some(State::Done)
    }

    fn video(dir: &Path, folder: &str) -> Vec<u8> {
        fs::read(find_video(&dir.join(folder)).expect("a finished video")).unwrap()
    }

    #[test]
    fn downloads_one_at_a_time_in_order() {
        let fake = Fake::start(&[
            ("m1", data(50_000)),
            ("m2", data(60_000)),
            ("m3", data(70_000)),
        ]);
        let dir = scratch("order");
        let q = queue(&dir, &fake, fast());
        q.start(
            vec![request(1, 50_000), request(2, 60_000), request(3, 70_000)],
            json!({}),
        );
        let end = Instant::now() + Duration::from_secs(20);
        while !(1..=3).all(|n| done(&q, &format!("movies:{n}"))) {
            let states: Vec<_> = q
                .items()
                .iter()
                .map(|e| (e.key.clone(), e.state, e.error))
                .collect();
            assert!(
                Instant::now() < end,
                "timed out waiting for three downloads: {states:?}"
            );
            thread::sleep(Duration::from_millis(10));
        }
        let events: Vec<String> = fake
            .events()
            .into_iter()
            .filter(|e| e.starts_with("post:") || e.starts_with("complete:"))
            .collect();
        assert_eq!(
            events,
            [
                "post:m1",
                "complete:m1",
                "post:m2",
                "complete:m2",
                "post:m3",
                "complete:m3"
            ]
        );
        for (n, len) in [(1, 50_000), (2, 60_000), (3, 70_000)] {
            assert_eq!(video(&dir, &format!("movies-{n}")), data(len));
        }
        assert_eq!(q.items().len(), 3);
    }

    #[test]
    fn resumes_after_restart_with_fresh_url() {
        let source = data(100_000);
        let fake = Fake::start(&[("m1", source.clone())]);
        let dir = scratch("resume");
        let first = queue(&dir, &fake, fast());
        fake.world.lock().unwrap().mode = Mode::CutAndHold(40_000);
        first.start(vec![request(1, 100_000)], json!({}));
        let part = dir.join("movies-1/video.part");
        until("40 % on disk", || file_len(&part) == 40_000);
        first.shutdown();
        drop(first);

        {
            let mut w = fake.world.lock().unwrap();
            w.mode = Mode::Normal;
            w.valid_from = w.sigs + 1;
            w.forbid_next = 1;
        }
        // Read before a queue exists: its worker would move the entry on straight away.
        assert_eq!(load_index(&dir)[0].state, State::Queued);
        let second = queue(&dir, &fake, fast());
        until("the finished file", || done(&second, "movies:1"));
        assert_eq!(video(&dir, "movies-1"), source);
        let ranges: Vec<String> = fake
            .seen()
            .iter()
            .filter(|s| s.path.starts_with("/dl/"))
            .filter_map(|s| s.headers.get("range").cloned())
            .collect();
        assert!(ranges.iter().all(|r| r == "bytes=40000-"), "{ranges:?}");
        assert!(ranges.len() >= 2, "the 403 asked again: {ranges:?}");
        assert!(!dir.join("movies-1/video.part").exists());
    }

    #[test]
    fn short_file_is_not_done() {
        let fake = Fake::start(&[("m1", data(100_000))]);
        fake.world.lock().unwrap().mode = Mode::Short(60_000);
        let dir = scratch("short");
        let q = queue(&dir, &fake, fast());
        q.start(vec![request(1, 100_000)], json!({}));
        until("the wait", || {
            state_of(&q, "movies:1") == Some(State::Waiting)
                && file_len(&dir.join("movies-1/video.part")) == 60_000
        });
        thread::sleep(Duration::from_millis(200));
        assert_ne!(state_of(&q, "movies:1"), Some(State::Done));
        assert!(find_video(&dir.join("movies-1")).is_none());
        // Each retry gets a 200 to its Range and so restarts the part from zero: sample it between attempts.
        until("the wait again", || {
            state_of(&q, "movies:1") == Some(State::Waiting)
                && file_len(&dir.join("movies-1/video.part")) == 60_000
        });
    }

    #[test]
    fn disk_full_keeps_partial() {
        let (small, big) = (data(1_000), data(100_000));
        let fake = Fake::start(&[("m1", small.clone()), ("m2", big.clone())]);
        let dir = scratch("full");
        let room = Arc::new(AtomicUsize::new(1_000 + 30_000));
        let writer_room = room.clone();
        let cfg = Config {
            open_part: Arc::new(move |path| {
                struct Limited(fs::File, Arc<AtomicUsize>);
                impl Write for Limited {
                    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
                        let left = self.1.load(Ordering::Relaxed);
                        if left == 0 {
                            return Err(io::Error::new(
                                io::ErrorKind::StorageFull,
                                "no space left",
                            ));
                        }
                        let n = buf.len().min(left);
                        self.1.fetch_sub(n, Ordering::Relaxed);
                        self.0.write(&buf[..n])
                    }
                    fn flush(&mut self) -> io::Result<()> {
                        self.0.flush()
                    }
                }
                let file = fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(path)?;
                Ok(Box::new(Limited(file, writer_room.clone())))
            }),
            ..fast()
        };
        let q = queue(&dir, &fake, cfg);
        q.start(vec![request(1, 1_000), request(2, 100_000)], json!({}));
        until("the failure", || {
            state_of(&q, "movies:2") == Some(State::Failed)
        });
        let failed = q.items().into_iter().find(|e| e.key == "movies:2").unwrap();
        assert_eq!(failed.error, Some(Cause::NoSpace));
        let kept = file_len(&dir.join("movies-2/video.part"));
        assert_eq!(kept, 30_000);
        assert_eq!(video(&dir, "movies-1"), small);
        assert!(done(&q, "movies:1"));

        room.store(usize::MAX / 2, Ordering::Relaxed);
        q.retry("movies:2");
        until("the finished file", || done(&q, "movies:2"));
        assert_eq!(video(&dir, "movies-2"), big);
        let ranges: Vec<String> = fake
            .seen()
            .iter()
            .filter_map(|s| s.headers.get("range").cloned())
            .collect();
        assert!(ranges.contains(&"bytes=30000-".to_string()), "{ranges:?}");
    }

    #[test]
    fn network_loss_waits() {
        let source = data(20_000);
        let fake = Fake::start(&[("m1", source.clone())]);
        fake.down.store(true, Ordering::Relaxed);
        let dir = scratch("loss");
        let q = queue(&dir, &fake, fast());
        q.start(vec![request(1, 20_000)], json!({}));
        until("waiting", || {
            state_of(&q, "movies:1") == Some(State::Waiting)
        });
        thread::sleep(Duration::from_millis(200));
        assert_eq!(state_of(&q, "movies:1"), Some(State::Waiting));
        fake.down.store(false, Ordering::Relaxed);
        until("the finished file", || done(&q, "movies:1"));
        assert_eq!(video(&dir, "movies-1"), source);
    }

    #[test]
    fn prepare_failure_fails_and_moves_on() {
        let fake = Fake::start(&[("m1", data(1_000)), ("m2", data(2_000))]);
        fake.world.lock().unwrap().failing.insert("m1".into());
        let dir = scratch("prepare");
        let q = queue(&dir, &fake, fast());
        q.start(vec![request(1, 1_000), request(2, 2_000)], json!({}));
        until("the second", || done(&q, "movies:2"));
        let first = q.items().into_iter().find(|e| e.key == "movies:1").unwrap();
        assert_eq!(
            (first.state, first.error),
            (State::Failed, Some(Cause::PrepareFailed))
        );
    }

    #[test]
    fn gone_media_fails_as_gone() {
        let fake = Fake::start(&[("m1", data(1_000))]);
        fake.world.lock().unwrap().missing.insert("m1".into());
        let dir = scratch("gone");
        let q = queue(&dir, &fake, fast());
        q.start(vec![request(1, 1_000)], json!({}));
        until("the failure", || {
            state_of(&q, "movies:1") == Some(State::Failed)
        });
        assert_eq!(q.items()[0].error, Some(Cause::Gone));
    }

    fn with_tracks(fake: &Fake, tracks: Value) {
        fake.world.lock().unwrap().tracks = tracks;
    }

    #[test]
    fn engine_fetch_has_no_credential() {
        let fake = Fake::start(&[("m1", data(5_000))]);
        let base = fake.base();
        with_tracks(
            &fake,
            json!({
                "preparing": false, "container": "mkv", "video": null, "chapters": [],
                "markers": { "intro": null, "credits": null },
                "audio": [{ "index": 1 }],
                "subtitles": [{ "index": 3, "files": { "vtt": format!("{base}/media/j/3.vtt?exp=1&sig=ab") } }],
                "fonts": [format!("{base}/media/j/fonts/A.ttf?exp=1&sig=ab")], "trickplay": null,
            }),
        );
        let dir = scratch("credential");
        let q = queue(&dir, &fake, fast());
        let mut r = request(1, 5_000);
        r.subtitles = vec![SubtitlePick {
            index: 3,
            language: "en".into(),
            codec: "subrip".into(),
        }];
        q.start(vec![r], json!({}));
        until("done", || done(&q, "movies:1"));
        let seen = fake.seen();
        let engine: Vec<&Seen> = seen
            .iter()
            .filter(|s| !s.path.starts_with("/api/v1"))
            .collect();
        assert!(engine.len() >= 3, "{engine:?}");
        for s in engine {
            assert!(
                !s.headers.contains_key("authorization") && !s.headers.contains_key("x-api-key"),
                "{s:?}"
            );
        }
        for s in seen.iter().filter(|s| s.path.starts_with("/api/v1")) {
            assert_eq!(
                s.headers.get("x-api-key").map(String::as_str),
                Some("key"),
                "{s:?}"
            );
        }
    }

    #[test]
    fn server_names_never_reach_paths() {
        let fake = Fake::start(&[("m1", data(5_000))]);
        let base = fake.base();
        with_tracks(
            &fake,
            json!({
                "preparing": false, "container": "mkv", "video": null, "chapters": [],
                "markers": { "intro": null, "credits": null },
                "audio": [{ "index": 1 }],
                "subtitles": [
                    { "index": 3, "files": { "ass": format!("{base}/media/j/../../x.ass?exp=1&sig=ab"), "../evil": format!("{base}/media/j/e.vtt") } },
                ],
                "fonts": [format!("{base}/media/j/fonts/evil.exe"), format!("{base}/media/j/fonts/../../up.ttf")],
                "trickplay": null,
            }),
        );
        let root = scratch("names");
        let dir = root.join("downloads");
        let q = queue(&dir, &fake, fast());
        let mut r = request(1, 5_000);
        r.subtitles = vec![SubtitlePick {
            index: 3,
            language: "en".into(),
            codec: "ass".into(),
        }];
        q.start(vec![r], json!({}));
        until("done", || done(&q, "movies:1"));
        let folder = dir.join("movies-1");
        assert!(folder.join("sub-3.ass").is_file());
        let mut names: Vec<String> = fs::read_dir(&folder)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert!(
            names
                .iter()
                .all(|n| !n.contains("evil") && !n.contains("..")),
            "{names:?}"
        );
        assert!(!names.iter().any(|n| n.ends_with(".exe")), "{names:?}");
        let mut outside: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        outside.sort();
        assert_eq!(outside, ["capabilities.json", "index.json", "movies-1"]);
        let top: Vec<_> = fs::read_dir(&root).unwrap().flatten().collect();
        assert_eq!(top.len(), 1);
    }

    #[test]
    fn tracks_json_is_local() {
        let fake = Fake::start(&[("m1", data(5_000))]);
        let base = fake.base();
        with_tracks(
            &fake,
            json!({
                "preparing": true, "container": "mkv", "video": null, "chapters": [],
                "markers": { "intro": null, "credits": null },
                "audio": [{ "index": 1 }, { "index": 2 }],
                "subtitles": [
                    { "index": 3, "files": { "vtt": format!("{base}/media/j/3.vtt?exp=1&sig=ab") } },
                    { "index": 4, "files": { "vtt": format!("{base}/media/j/4.vtt?exp=1&sig=ab"), "ass": format!("{base}/media/j/4.ass?exp=1&sig=ab") } },
                ],
                "fonts": [format!("{base}/media/j/fonts/A.ttf?exp=1&sig=ab")],
                "trickplay": { "url": format!("{base}/media/j/trickplay.json?sig=ab") },
            }),
        );
        let dir = scratch("local");
        let q = queue(&dir, &fake, fast());
        let mut r = request(1, 5_000);
        r.audio[0].index = 2;
        r.subtitles = vec![SubtitlePick {
            index: 4,
            language: "en".into(),
            codec: "ass".into(),
        }];
        q.start(vec![r], json!({}));
        until("done", || done(&q, "movies:1"));
        let tracks: Value =
            serde_json::from_slice(&fs::read(dir.join("movies-1/tracks.json")).unwrap()).unwrap();
        assert_eq!(tracks["audio"], json!([{ "index": 2 }]));
        assert_eq!(tracks["subtitles"].as_array().unwrap().len(), 1);
        assert_eq!(tracks["subtitles"][0]["index"], 4);
        for format in ["vtt", "ass"] {
            let path = tracks["subtitles"][0]["files"][format].as_str().unwrap();
            assert!(
                path.starts_with(dir.to_str().unwrap()) && Path::new(path).is_file(),
                "{path}"
            );
        }
        assert_eq!(tracks["fonts"].as_array().unwrap().len(), 1);
        assert!(Path::new(tracks["fonts"][0].as_str().unwrap()).is_file());
        assert_eq!(tracks["trickplay"], Value::Null);
        assert_eq!(tracks["preparing"], json!(false));
        let mut all = vec![dir.join("index.json")];
        all.extend(
            fs::read_dir(dir.join("movies-1"))
                .unwrap()
                .flatten()
                .map(|e| e.path()),
        );
        for file in all {
            let text = String::from_utf8_lossy(&fs::read(&file).unwrap()).into_owned();
            assert!(!text.contains("sig="), "{file:?}");
        }
        assert_eq!(
            q.local_artwork("/movies/1/poster.jpg"),
            Some(b"img".to_vec())
        );
        assert_eq!(q.local_artwork("movies/9/poster.jpg"), None);
    }

    #[test]
    fn remove_cancels_and_deletes() {
        let fake = Fake::start(&[("m1", data(100_000)), ("m2", data(10_000))]);
        fake.world.lock().unwrap().mode = Mode::CutAndHold(30_000);
        let dir = scratch("remove");
        let q = queue(&dir, &fake, fast());
        q.start(vec![request(1, 100_000), request(2, 10_000)], json!({}));
        until("the first transfer", || {
            file_len(&dir.join("movies-1/video.part")) == 30_000
        });
        fake.world.lock().unwrap().mode = Mode::Normal;
        tauri::async_runtime::block_on(q.remove(vec!["movies:1".into()]));
        assert!(!dir.join("movies-1").exists());
        assert!(fake.events().contains(&"delete:m1".to_string()));
        assert!(q.items().iter().all(|e| e.key != "movies:1"));
        until("the second", || done(&q, "movies:2"));
        tauri::async_runtime::block_on(q.remove(vec!["movies:2".into()]));
        assert!(!dir.join("movies-2").exists());
        assert!(!fake.events().contains(&"delete:m2".to_string()));
        assert!(q.items().is_empty());
    }

    #[test]
    fn sync_keeps_note_on_failure() {
        let fake = Fake::start(&[("m1", data(5_000)), ("m2", data(5_000))]);
        let dir = scratch("sync");
        let q = queue(&dir, &fake, fast());
        q.start(vec![request(1, 5_000), request(2, 5_000)], json!({}));
        until("both", || done(&q, "movies:1") && done(&q, "movies:2"));
        q.note_offline("movies:1", 600.4, false);
        q.note_offline("movies:2", 12.0, true);

        fake.down.store(true, Ordering::Relaxed);
        assert_eq!(tauri::async_runtime::block_on(q.sync_offline()), 0);
        assert!(q.items().iter().all(|e| e.offline.is_some()));

        fake.down.store(false, Ordering::Relaxed);
        assert_eq!(tauri::async_runtime::block_on(q.sync_offline()), 2);
        assert!(q.items().iter().all(|e| e.offline.is_none()));
        assert!(
            q.items()
                .iter()
                .find(|e| e.key == "movies:2")
                .unwrap()
                .watched
        );
        let puts: Vec<Value> = fake
            .seen()
            .iter()
            .filter(|s| s.method == "PUT")
            .map(|s| serde_json::from_str(&s.body).unwrap())
            .collect();
        assert_eq!(puts.len(), 2);
        let first = puts
            .iter()
            .find(|b| b["position_seconds"] == 600)
            .expect("the position");
        assert_eq!(first["duration_seconds"], 6000);
        assert!(first["at"].as_str().unwrap().ends_with('Z'));
        assert!(
            puts.iter()
                .any(|b| b["position_seconds"] == 6000 && b["duration_seconds"] == 6000)
        );
        assert_eq!(tauri::async_runtime::block_on(q.sync_offline()), 0);
    }

    #[test]
    fn storage_counts_the_folder() {
        let fake = Fake::start(&[("m1", data(5_000))]);
        let dir = scratch("storage");
        let q = queue(&dir, &fake, fast());
        q.start(vec![request(1, 5_000)], json!({}));
        until("done", || done(&q, "movies:1"));
        let files: u64 = fs::read_dir(dir.join("movies-1"))
            .unwrap()
            .flatten()
            .map(|e| e.metadata().unwrap().len())
            .sum();
        let used = q.storage().used;
        assert!(used >= files && files >= 5_000, "{used} {files}");
        assert_eq!(used, dir_size(&dir));
    }

    #[test]
    fn index_survives_a_torn_write() {
        let fake = Fake::start(&[("m1", data(5_000))]);
        let dir = scratch("torn");
        {
            let q = queue(&dir, &fake, fast());
            q.start(vec![request(1, 5_000)], json!({}));
            until("done", || done(&q, "movies:1"));
        }
        fs::write(dir.join("index.tmp"), b"[{\"key\": \"mov").unwrap();
        let q = queue(&dir, &fake, fast());
        assert_eq!(q.items().len(), 1);
        assert_eq!(q.items()[0].state, State::Done);
    }

    #[test]
    fn a_done_entry_without_its_file_is_dropped() {
        let fake = Fake::start(&[("m1", data(5_000))]);
        let dir = scratch("dropped");
        {
            let q = queue(&dir, &fake, fast());
            q.start(vec![request(1, 5_000)], json!({}));
            until("done", || done(&q, "movies:1"));
        }
        fs::remove_file(find_video(&dir.join("movies-1")).unwrap()).unwrap();
        let q = queue(&dir, &fake, fast());
        assert!(q.items().is_empty());
    }

    #[test]
    fn keys_that_could_name_paths_are_refused() {
        let fake = Fake::start(&[]);
        let dir = scratch("keys");
        let q = queue(&dir, &fake, fast());
        let mut bad = request(1, 10);
        bad.key = "movies:../../x".into();
        let mut worse = request(2, 10);
        worse.media_id = "../x".into();
        q.start(vec![bad, worse], json!({}));
        assert!(q.items().is_empty());
        assert_eq!(folder_name("series:1:2:4").as_deref(), Some("series-1-2-4"));
        assert_eq!(folder_name("movies:3").as_deref(), Some("movies-3"));
        assert_eq!(folder_name("series:1:2"), None);
        assert_eq!(folder_name("games:1"), None);
    }

    #[test]
    fn local_text_stays_inside_the_folder() {
        let root = scratch("text");
        let dir = root.join("downloads");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.vtt"), "WEBVTT").unwrap();
        fs::write(root.join("secret"), "no").unwrap();
        assert_eq!(
            read_local_text(&dir, dir.join("a.vtt").to_str().unwrap()).unwrap(),
            "WEBVTT"
        );
        assert!(read_local_text(&dir, root.join("secret").to_str().unwrap()).is_err());
        assert!(read_local_text(&dir, dir.join("../secret").to_str().unwrap()).is_err());
    }

    #[test]
    fn timestamps_are_utc() {
        assert_eq!(iso(1_794_225_600), "2026-11-09T12:00:00Z");
        assert_eq!(iso(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso(951_782_400 + 86_399), "2000-02-29T23:59:59Z");
    }
}
