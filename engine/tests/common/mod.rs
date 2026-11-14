#![allow(dead_code)]

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::Router;
use axum::body::Body;
use axum::http::{Request, Response, StatusCode};
use engine::analysis::{Analysis, AudioStream, VideoStream};
use engine::caps::{AudioCaps, Capabilities, HdrCaps, VideoCap};
use engine::config::Config;
use engine::decision::EncoderSet;
use engine::hw::{Backend, Hw};
use engine::jobs::Jobs;
use engine::session::Sessions;
use engine::settings::Settings;
use engine::token::{Scope, sign};
use engine::{AppState, app};
use serde_json::{Value, json};
use tower::ServiceExt;

pub const SECRET: &str = "test-secret-0123456789";

static COUNTER: AtomicUsize = AtomicUsize::new(0);

pub struct Env {
    pub root: PathBuf,
    pub router: Router,
    pub sessions: Sessions,
    pub jobs: Jobs,
    pub settings: Arc<Settings>,
    pub config_file: PathBuf,
}

impl Drop for Env {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

pub fn env() -> Env {
    env_with_hw(Hw::new(
        Backend::Cpu,
        String::new(),
        EncoderSet {
            h264: true,
            hevc: true,
            av1: true,
            hevc_first: false,
            dovi_tool: true,
            av1_pads: false,
        },
        false,
    ))
}

pub fn env_with_hw(hw: Hw) -> Env {
    build_env(hw, None)
}

/// An env whose settings endpoint reads and writes `yaml`, a config file in the env's root.
pub fn env_with_config(yaml: &str) -> Env {
    build_env(
        Hw::new(
            Backend::Cpu,
            String::new(),
            EncoderSet {
                h264: true,
                hevc: true,
                av1: true,
                hevc_first: false,
                dovi_tool: true,
                av1_pads: false,
            },
            false,
        ),
        Some(yaml),
    )
}

fn build_env(hw: Hw, yaml: Option<&str>) -> Env {
    let root = std::env::temp_dir().join(format!(
        "engine-http-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::SeqCst)
    ));
    let bin = root.join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/fake-ffmpeg/ffmpeg"
            ),
            bin.join("ffmpeg"),
        )
        .unwrap();
        std::os::unix::fs::symlink(
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/fake-ffprobe/ffprobe"
            ),
            bin.join("ffprobe"),
        )
        .unwrap();
        std::fs::write(bin.join("fake.env"), "").unwrap();
    }
    let config_file = root.join("engine.yaml");
    let (base, path) = match yaml {
        Some(text) => {
            std::fs::write(&config_file, text).unwrap();
            (
                Config::load(&config_file).unwrap(),
                Some(config_file.clone()),
            )
        }
        None => (
            Config {
                secret: Some(SECRET.into()),
                ..Config::default()
            },
            None,
        ),
    };
    let settings = Arc::new(Settings::new(path, &base));
    let cfg = Arc::new(Config {
        tmp_dir: root.join("live"),
        jobs_dir: root.join("jobs"),
        ffmpeg_dir: bin,
        ..base
    });
    let hw = Arc::new(hw);
    let sessions = Sessions::new(cfg.clone(), hw.clone());
    let jobs = Jobs::new(cfg.clone(), hw.clone());
    let router = app(AppState {
        cfg,
        secret: Arc::new(SECRET.as_bytes().to_vec()),
        hw,
        ffmpeg_version: Some("test".into()),
        sessions: sessions.clone(),
        jobs: jobs.clone(),
        settings: settings.clone(),
    });
    Env {
        root,
        router,
        sessions,
        jobs,
        settings,
        config_file,
    }
}

pub fn id(n: u8) -> String {
    format!("{n:032x}")
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

pub fn token_query(id: &str, exp: u64) -> String {
    format!(
        "exp={exp}&sig={}",
        sign(SECRET.as_bytes(), Scope::Hls, id, exp)
    )
}

pub fn valid_query(id: &str) -> String {
    token_query(id, now() + 3600)
}

impl Env {
    pub async fn send(&self, req: Request<Body>) -> Response<Body> {
        self.router.clone().oneshot(req).await.unwrap()
    }

    pub async fn get(&self, uri: &str) -> Response<Body> {
        self.send(Request::get(uri).body(Body::empty()).unwrap())
            .await
    }

    pub async fn get_authed(&self, uri: &str) -> Response<Body> {
        self.send(
            Request::get(uri)
                .header("authorization", format!("Bearer {SECRET}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
    }

    pub async fn api(&self, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
        let mut b = Request::builder()
            .method(method)
            .uri(uri)
            .header("authorization", format!("Bearer {SECRET}"));
        let body = match body {
            Some(v) => {
                b = b.header("content-type", "application/json");
                Body::from(v.to_string())
            }
            None => Body::empty(),
        };
        let res = self.send(b.body(body).unwrap()).await;
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let v = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        (status, v)
    }
}

pub async fn body_bytes(res: Response<Body>) -> Vec<u8> {
    axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap()
        .to_vec()
}

pub fn analysis() -> Analysis {
    Analysis {
        version: engine::analysis::ANALYSIS_VERSION,
        container: "mkv".into(),
        duration: 200.0,
        bit_rate: 8_000_000,
        video: vec![VideoStream {
            index: 0,
            codec: "hevc".into(),
            profile: "Main".into(),
            level: Some(120),
            bit_depth: 8,
            pix_fmt: "yuv420p".into(),
            width: 1920,
            height: 1080,
            sar: (1, 1),
            fps: 24.0,
            field_order: "progressive".into(),
            ..Default::default()
        }],
        audio: vec![AudioStream {
            index: 1,
            codec: "aac".into(),
            channels: 2,
            layout: "stereo".into(),
            default: true,
            ..Default::default()
        }],
        keyframes: (0..200).map(f64::from).collect(),
        ..Default::default()
    }
}

pub fn caps(codec: &str, container: &str) -> Capabilities {
    Capabilities {
        video: vec![VideoCap {
            codec: codec.into(),
            profiles: vec![],
            max_level: None,
            max_width: 3840,
            max_height: 2160,
            max_fps: 60.0,
        }],
        hdr: HdrCaps {
            formats: vec![],
            dv_profiles: vec![],
        },
        audio: AudioCaps {
            codecs: vec!["aac".into()],
            max_channels: 6,
            passthrough: vec![],
        },
        containers: vec![container.into()],
        subtitles: vec![],
        hls_keyframe_exact: true,
    }
}

pub fn start_body(sid: &str, path: &std::path::Path, codec: &str, container: &str) -> Value {
    json!({
        "session_id": sid,
        "path": path.display().to_string(),
        "capabilities": serde_json::to_value(caps(codec, container)).unwrap(),
        "analysis": serde_json::to_value(analysis()).unwrap(),
        "position": 0.0,
    })
}

/// Spawns the engine binary on `config` (whose `listen` should use port 0) and returns it with
/// the address it bound, read from its "serving" log line. Picking a free port in the test and
/// handing it over races with parallel tests that get the same freed port.
pub fn spawn_engine(config: &std::path::Path) -> (std::process::Child, std::net::SocketAddr) {
    use std::io::BufRead;
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_engine"))
        .arg("--config")
        .arg(config)
        .env("NO_COLOR", "1")
        // The address comes from an info line, which a caller's RUST_LOG could filter out.
        .env("RUST_LOG", "info")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let out = std::io::BufReader::new(child.stdout.take().unwrap());
    let (tx, rx) = std::sync::mpsc::channel();
    // Keeps reading after the address so the engine never blocks on a full pipe.
    std::thread::spawn(move || {
        for line in out.lines().map_while(Result::ok) {
            if let Some(addr) = line.split("listen=").nth(1) {
                let _ = tx.send(addr.split_whitespace().next().unwrap_or("").to_owned());
            }
        }
    });
    let addr = rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .expect("engine never logged its listen address")
        .parse()
        .unwrap();
    (child, addr)
}

/// Writes an executable script for a test. A child `sh` writes it, never this process: a test
/// thread forking at that moment would inherit the open write handle, and running the script
/// while any process holds one fails with ETXTBSY ("Text file busy").
pub fn write_executable(path: &std::path::Path, text: &str) {
    use std::io::Write;
    let mut sh = std::process::Command::new("sh")
        .arg("-c")
        .arg("cat > \"$0\" && chmod 755 \"$0\"")
        .arg(path)
        .stdin(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    sh.stdin.take().unwrap().write_all(text.as_bytes()).unwrap();
    assert!(sh.wait().unwrap().success(), "writing {}", path.display());
}
