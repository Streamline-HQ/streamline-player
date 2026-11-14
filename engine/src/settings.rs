use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Map, Value};
use tokio::sync::{Mutex, Notify};

use crate::config::{Config, HwAccel};
use crate::error::ApiError;

const KEYS: [&str; 4] = ["hw_accel", "hw_device", "max_transcodes", "tonemap"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Values {
    pub hw_accel: HwAccel,
    pub hw_device: String,
    pub max_transcodes: usize,
    pub tonemap: bool,
}

impl Values {
    fn of(cfg: &Config) -> Self {
        Self {
            hw_accel: cfg.hw_accel,
            hw_device: cfg.hw_device.clone(),
            max_transcodes: cfg.max_transcodes,
            tonemap: cfg.tonemap,
        }
    }

    fn differing(&self, other: &Values) -> Vec<&'static str> {
        let changed = [
            self.hw_accel != other.hw_accel,
            self.hw_device != other.hw_device,
            self.max_transcodes != other.max_transcodes,
            self.tonemap != other.tonemap,
        ];
        KEYS.into_iter()
            .zip(changed)
            .filter_map(|(key, changed)| changed.then_some(key))
            .collect()
    }
}

#[derive(Debug, Serialize)]
pub struct SettingsView {
    pub read_only: bool,
    pub values: Values,
    pub pending: Vec<&'static str>,
    pub restart_keys: [&'static str; 4],
}

/// The engine reads its config once at boot, so a written key only takes effect after a restart:
/// `booted` is what the process runs with and the file is what the next boot will see.
pub struct Settings {
    path: Option<PathBuf>,
    booted: Values,
    config_read_only: bool,
    write: Mutex<()>,
    restart: Notify,
}

impl Settings {
    pub fn new(path: Option<PathBuf>, cfg: &Config) -> Self {
        Self {
            path,
            booted: Values::of(cfg),
            config_read_only: cfg.read_only,
            write: Mutex::new(()),
            restart: Notify::new(),
        }
    }

    pub fn request_restart(&self) {
        self.restart.notify_one();
    }

    pub async fn restart_requested(&self) {
        self.restart.notified().await;
    }

    fn writable_path(&self) -> Option<&Path> {
        let path = self.path.as_deref()?;
        (!self.config_read_only && can_replace(path)).then_some(path)
    }

    pub fn view(&self) -> Result<SettingsView, ApiError> {
        let values = match &self.path {
            Some(path) => read_values(path)?,
            None => self.booted.clone(),
        };
        Ok(SettingsView {
            read_only: self.writable_path().is_none(),
            pending: values.differing(&self.booted),
            values,
            restart_keys: KEYS,
        })
    }

    pub async fn patch(&self, body: Map<String, Value>) -> Result<SettingsView, ApiError> {
        let _guard = self.write.lock().await;
        let path = self.writable_path().ok_or_else(ApiError::read_only)?;
        if let Some(key) = body.keys().find(|k| !KEYS.contains(&k.as_str())) {
            return Err(ApiError::invalid_setting(format!(
                "unknown setting `{key}`"
            )));
        }
        let text = fs::read_to_string(path).map_err(io_error)?;
        let mut doc: serde_yaml_ng::Mapping =
            serde_yaml_ng::from_str(&text).map_err(|e| ApiError::invalid_setting(e.to_string()))?;
        for (key, value) in body {
            let value = serde_yaml_ng::to_value(value)
                .map_err(|e| ApiError::invalid_setting(e.to_string()))?;
            doc.insert(key.into(), value);
        }
        let out = serde_yaml_ng::to_string(&doc).map_err(io_error)?;
        Config::parse(&out).map_err(|e| ApiError::invalid_setting(format!("{e:#}")))?;
        replace(path, &out).map_err(io_error)?;
        self.view()
    }
}

fn io_error(e: impl std::fmt::Display) -> ApiError {
    ApiError::internal(e.to_string())
}

fn read_values(path: &Path) -> Result<Values, ApiError> {
    let text = fs::read_to_string(path).map_err(io_error)?;
    Config::parse(&text)
        .map(|cfg| Values::of(&cfg))
        .map_err(io_error)
}

fn sibling(path: &Path) -> PathBuf {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    path.with_file_name(format!(".{name}.{}.tmp", std::process::id()))
}

/// Whether the file's directory takes a new file, which is what a replace needs: a Nix store
/// path or a read-only mount does not.
fn can_replace(path: &Path) -> bool {
    let tmp = sibling(path);
    let ok = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp)
        .is_ok();
    let _ = fs::remove_file(&tmp);
    ok
}

fn replace(path: &Path, text: &str) -> std::io::Result<()> {
    let tmp = sibling(path);
    let result = (|| {
        fs::write(&tmp, text)?;
        fs::set_permissions(&tmp, fs::metadata(path)?.permissions())?;
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}
