//! Calls back the engine's caller, which only runs while it answers a request: a finished job's
//! result goes to the URL its request named, and a caller with unfinished work is called until
//! it says it is done.

use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use serde_json::json;

use super::Shared;
use crate::error::ApiError;

/// Holds one file per finished job whose result is not delivered yet: its content is the URL.
pub(super) const DIR: &str = "callbacks";
const RETRY_INTERVAL: Duration = Duration::from_secs(60);
pub(super) const TIMEOUT: Duration = Duration::from_secs(30);
/// A receiver may refuse a result it will take a moment later: the caller records the jobs it
/// queued only after the engine accepted them, and a short job finishes before that.
const REFUSED_RETRY_FOR: Duration = Duration::from_secs(600);
const REFUSED_RETRY_INTERVAL: Duration = Duration::from_secs(5);
pub const SIGNATURE_HEADER: &str = "x-engine-signature";

/// Holds one file per caller that asked to be called until its work is done: its content is the
/// URL.
const CONTINUATIONS_DIR: &str = "continuations";
/// A continuation call does a slice of the caller's work, which may take most of the 30 s the
/// caller's host allows it.
const CONTINUATION_TIMEOUT: Duration = Duration::from_secs(45);
const CONTINUATION_PAUSE: Duration = Duration::from_millis(100);

pub(super) fn check_continuation_id(id: &str) -> Result<(), ApiError> {
    let ok = (1..=64).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    if ok {
        Ok(())
    } else {
        Err(ApiError::invalid_request(
            "id must be 1 to 64 lowercase letters, digits and dashes",
        ))
    }
}

pub(super) fn check(url: &str) -> Result<(), ApiError> {
    match reqwest::Url::parse(url) {
        Ok(u) if matches!(u.scheme(), "http" | "https") => Ok(()),
        _ => Err(ApiError::invalid_request(
            "callback must be an http or https URL",
        )),
    }
}

pub(super) fn client(timeout: Duration) -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .expect("the HTTP client builds from static settings")
}

impl Shared {
    fn callback_file(&self, id: &str) -> PathBuf {
        self.cfg.jobs_dir.join(DIR).join(id)
    }

    pub(super) fn keep_callback(&self, id: &str, url: &str) {
        let file = self.callback_file(id);
        let kept = file
            .parent()
            .map_or(Ok(()), std::fs::create_dir_all)
            .and_then(|()| std::fs::write(&file, url));
        if let Err(e) = kept {
            tracing::warn!(job = %id, error = %e, "cannot keep the callback; the result waits to be fetched");
        }
    }

    /// One pass over the results not delivered yet. It stops at the first receiver that does
    /// not answer or answers 5xx: the others are most likely the same server. It says whether a
    /// refused result still waits, which is worth asking again soon.
    pub(super) async fn deliver_pending(&self, client: &reqwest::Client) -> bool {
        let mut refused = false;
        let Ok(entries) = std::fs::read_dir(self.cfg.jobs_dir.join(DIR)) else {
            return refused;
        };
        for entry in entries.flatten() {
            let file = entry.path();
            let id = entry.file_name().to_string_lossy().into_owned();
            // No record: the job was released or swept while its result waited.
            let (Ok(url), Some(status)) = (std::fs::read_to_string(&file), self.read_record(&id))
            else {
                let _ = std::fs::remove_file(&file);
                continue;
            };
            let body = json!({
                "job_id": id,
                "state": status.state,
                "result": status.result,
                "error": status.error,
            })
            .to_string();
            let sent = client
                .post(&url)
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .header(
                    SIGNATURE_HEADER,
                    crate::token::sign_body(&self.secret, body.as_bytes()),
                )
                .body(body)
                .send()
                .await;
            match sent.map(|r| r.status()) {
                Ok(s) if s.is_success() => {
                    let _ = std::fs::remove_file(&file);
                }
                Ok(s) if s.is_client_error() => {
                    let waited = entry
                        .metadata()
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(|at| SystemTime::now().duration_since(at).ok())
                        .unwrap_or_default();
                    if waited > REFUSED_RETRY_FOR {
                        tracing::warn!(job = %id, status = %s, "the callback was refused; the result waits to be fetched");
                        let _ = std::fs::remove_file(&file);
                    } else {
                        refused = true;
                    }
                }
                Ok(s) => {
                    tracing::warn!(job = %id, status = %s, "the callback failed; trying again later");
                    return refused;
                }
                Err(e) => {
                    tracing::warn!(job = %id, error = %e, "the callback did not get through; trying again later");
                    return refused;
                }
            }
        }
        refused
    }

    pub(super) fn keep_continuation(&self, id: &str, url: &str) -> std::io::Result<()> {
        let dir = self.cfg.jobs_dir.join(CONTINUATIONS_DIR);
        std::fs::create_dir_all(&dir)?;
        std::fs::write(dir.join(id), url)?;
        self.continuing.notify_one();
        Ok(())
    }

    /// Calls every continuation once. `true` when one answered 202: its caller has more to do
    /// and wants the next call at once. A continuation is dropped when its caller answers
    /// anything else below 500, and kept while the caller is down.
    pub(super) async fn continue_pending(&self, client: &reqwest::Client) -> bool {
        let mut more = false;
        let Ok(entries) = std::fs::read_dir(self.cfg.jobs_dir.join(CONTINUATIONS_DIR)) else {
            return more;
        };
        for entry in entries.flatten() {
            let file = entry.path();
            let id = entry.file_name().to_string_lossy().into_owned();
            let Ok(url) = std::fs::read_to_string(&file) else {
                continue;
            };
            let body = json!({ "id": id }).to_string();
            let sent = client
                .post(&url)
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .header(
                    SIGNATURE_HEADER,
                    crate::token::sign_body(&self.secret, body.as_bytes()),
                )
                .body(body)
                .send()
                .await;
            match sent.map(|r| r.status()) {
                Ok(reqwest::StatusCode::ACCEPTED) => more = true,
                Ok(s) if s.is_server_error() => {
                    tracing::warn!(continuation = %id, status = %s, "the caller failed; trying again later");
                }
                Ok(s) => {
                    if !s.is_success() {
                        tracing::warn!(continuation = %id, status = %s, "the caller refused its continuation; dropped");
                    }
                    let _ = std::fs::remove_file(&file);
                }
                Err(e) => {
                    tracing::warn!(continuation = %id, error = %e, "the caller did not answer; trying again later");
                }
            }
        }
        more
    }

    pub(super) async fn continue_forever(&self) {
        let client = client(CONTINUATION_TIMEOUT);
        loop {
            let wait = if self.continue_pending(&client).await {
                CONTINUATION_PAUSE
            } else {
                RETRY_INTERVAL
            };
            tokio::select! {
                () = self.continuing.notified() => {}
                () = tokio::time::sleep(wait) => {}
            }
        }
    }

    pub(super) async fn deliver_forever(&self) {
        let client = client(TIMEOUT);
        loop {
            let wait = if self.deliver_pending(&client).await {
                REFUSED_RETRY_INTERVAL
            } else {
                RETRY_INTERVAL
            };
            tokio::select! {
                () = self.finished.notified() => {}
                () = tokio::time::sleep(wait) => {}
            }
        }
    }
}
