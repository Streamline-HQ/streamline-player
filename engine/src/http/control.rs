use axum::Json;
use axum::body::Bytes;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use serde::de::DeserializeOwned;
use tower::ServiceExt;
use tower_http::services::ServeFile;

use crate::AppState;
use crate::analysis::ANALYSIS_VERSION;
use crate::decision::EncoderSet;
use crate::error::{ApiError, ErrorBody};
use crate::http::Params;
use crate::jobs::{JobState, JobStatus, Priority};
use crate::session::{
    DecisionsRequest, DecisionsResponse, PatchRequest, SessionInfo, SessionResponse, StartRequest,
};
use crate::settings::SettingsView;

fn parse<T: DeserializeOwned>(body: &Bytes) -> Result<T, ApiError> {
    serde_json::from_slice(body).map_err(|e| ApiError::invalid_request(e.to_string()))
}

#[derive(Serialize)]
pub struct Health {
    api_version: u32,
    version: &'static str,
    analysis_version: u32,
    ffmpeg_version: Option<String>,
    backend: &'static str,
    untested: bool,
    vaapi: bool,
    libplacebo: bool,
    dovi_tool: bool,
    encoders: Vec<&'static str>,
    decoders: Vec<&'static str>,
}

fn encoder_names(set: &EncoderSet) -> Vec<&'static str> {
    [("h264", set.h264), ("hevc", set.hevc), ("av1", set.av1)]
        .into_iter()
        .filter_map(|(name, on)| on.then_some(name))
        .collect()
}

pub async fn health(State(s): State<AppState>) -> Json<Health> {
    Json(Health {
        api_version: 1,
        version: env!("CARGO_PKG_VERSION"),
        analysis_version: ANALYSIS_VERSION,
        ffmpeg_version: s.ffmpeg_version.clone(),
        backend: crate::session::backend_name(s.hw.backend),
        untested: s.hw.untested,
        vaapi: s.hw.backend == crate::hw::Backend::Vaapi,
        libplacebo: s.hw.libplacebo || s.hw.libplacebo_sw,
        dovi_tool: s.hw.encoders.dovi_tool,
        encoders: encoder_names(&s.hw.encoders),
        decoders: s.hw.decoders(),
    })
}

pub async fn decisions(
    State(s): State<AppState>,
    body: Bytes,
) -> Result<Json<DecisionsResponse>, ApiError> {
    let req: DecisionsRequest = parse(&body)?;
    Ok(Json(s.sessions.decisions(req).await?))
}

pub async fn start_session(
    State(s): State<AppState>,
    body: Bytes,
) -> Result<Json<SessionResponse>, ApiError> {
    Ok(Json(s.sessions.start(parse::<StartRequest>(&body)?).await?))
}

pub async fn patch_session(
    State(s): State<AppState>,
    Params(id): Params<String>,
    body: Bytes,
) -> Result<Json<SessionResponse>, ApiError> {
    let req: PatchRequest = parse(&body)?;
    Ok(Json(s.sessions.patch(&id, req).await?))
}

pub async fn delete_session(
    State(s): State<AppState>,
    Params(id): Params<String>,
) -> Result<StatusCode, ApiError> {
    s.sessions.delete(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
pub struct SessionList {
    sessions: Vec<SessionInfo>,
}

pub async fn list_sessions(State(s): State<AppState>) -> Json<SessionList> {
    Json(SessionList {
        sessions: s.sessions.list(),
    })
}

/// One job, or a list of them answered one result each, in order: a list never fails as a whole.
pub async fn submit_job(State(s): State<AppState>, body: Bytes) -> Result<Response, ApiError> {
    match parse::<serde_json::Value>(&body)? {
        serde_json::Value::Array(items) => {
            let results: Vec<_> = items
                .into_iter()
                .map(|v| {
                    let job_id = v.get("job_id").cloned().unwrap_or_default();
                    let error = s.jobs.submit(v).err().map(ErrorBody::from);
                    serde_json::json!({ "job_id": job_id, "error": error })
                })
                .collect();
            Ok((
                StatusCode::ACCEPTED,
                Json(serde_json::json!({ "results": results })),
            )
                .into_response())
        }
        v => {
            s.jobs.submit(v)?;
            Ok(StatusCode::ACCEPTED.into_response())
        }
    }
}

#[derive(serde::Deserialize)]
struct Continuation {
    url: String,
}

/// Asks the engine to call `url` until the caller says its work is done.
pub async fn keep_calling(
    State(s): State<AppState>,
    Params(id): Params<String>,
    body: Bytes,
) -> Result<StatusCode, ApiError> {
    let c: Continuation = parse(&body)?;
    s.jobs.keep_calling(&id, &c.url)?;
    Ok(StatusCode::ACCEPTED)
}

pub async fn job_status(
    State(s): State<AppState>,
    Params(id): Params<String>,
) -> Result<Json<JobStatus>, ApiError> {
    Ok(Json(s.jobs.status(&id)?))
}

pub async fn job_file(
    State(s): State<AppState>,
    Params((id, name)): Params<(String, String)>,
    req: Request,
) -> Result<Response, ApiError> {
    let path = s.jobs.file(&id, &name)?;
    let Ok(res) = ServeFile::new(path).oneshot(req).await;
    Ok(res.into_response())
}

pub async fn cancel_job(
    State(s): State<AppState>,
    Params(id): Params<String>,
) -> Result<StatusCode, ApiError> {
    s.jobs.cancel(&id)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
struct JobEntry {
    job_id: String,
    state: JobState,
    priority: Priority,
}

#[derive(Serialize)]
pub struct JobList {
    jobs: Vec<JobEntry>,
}

pub async fn list_jobs(State(s): State<AppState>) -> Json<JobList> {
    Json(JobList {
        jobs: s
            .jobs
            .list()
            .into_iter()
            .map(|(job_id, state, priority)| JobEntry {
                job_id,
                state,
                priority,
            })
            .collect(),
    })
}

pub async fn get_settings(State(s): State<AppState>) -> Result<Json<SettingsView>, ApiError> {
    Ok(Json(s.settings.view()?))
}

pub async fn patch_settings(
    State(s): State<AppState>,
    body: Bytes,
) -> Result<Json<SettingsView>, ApiError> {
    let body = parse(&body).map_err(|e| ApiError::invalid_setting(e.message))?;
    Ok(Json(s.settings.patch(body).await?))
}

pub async fn restart(State(s): State<AppState>) -> StatusCode {
    s.settings.request_restart();
    StatusCode::ACCEPTED
}

pub async fn clear_cache(State(s): State<AppState>) -> Json<serde_json::Value> {
    let (sessions, jobs) = (s.sessions.clone(), s.jobs.clone());
    let freed =
        tokio::task::spawn_blocking(move || sessions.clear_orphans() + jobs.sweep_ttl_once())
            .await
            .unwrap_or(0);
    Json(serde_json::json!({ "freed": freed }))
}

pub async fn cache_usage(State(s): State<AppState>) -> Json<serde_json::Value> {
    let dirs = [s.cfg.tmp_dir.clone(), s.cfg.jobs_dir.clone()];
    let size = tokio::task::spawn_blocking(move || dirs.iter().map(|d| crate::disk::size(d)).sum())
        .await
        .unwrap_or(0_u64);
    Json(serde_json::json!({ "size": size, "streams": s.sessions.list().len() }))
}
