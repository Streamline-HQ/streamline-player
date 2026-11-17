//! Pushes a finished job's result to the URL its request named, so the caller need not poll.

use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use serde_json::json;

use super::Shared;
use crate::error::ApiError;

/// Holds one file per finished job whose result is not delivered yet: its content is the URL.
const DIR: &str = "callbacks";
const RETRY_INTERVAL: Duration = Duration::from_secs(60);
const TIMEOUT: Duration = Duration::from_secs(30);
/// A receiver may refuse a result it will take a moment later: the caller records the jobs it
/// queued only after the engine accepted them, and a short job finishes before that.
const REFUSED_RETRY_FOR: Duration = Duration::from_secs(600);
const REFUSED_RETRY_INTERVAL: Duration = Duration::from_secs(5);
pub const SIGNATURE_HEADER: &str = "x-engine-signature";

pub(super) fn check(url: &str) -> Result<(), ApiError> {
    match reqwest::Url::parse(url) {
        Ok(u) if matches!(u.scheme(), "http" | "https") => Ok(()),
        _ => Err(ApiError::invalid_request(
            "callback must be an http or https URL",
        )),
    }
}

pub(super) fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
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

    pub(super) async fn deliver_forever(&self) {
        let client = client();
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
