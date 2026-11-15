use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, RwLock},
};
use tauri::{AppHandle, Emitter, Manager};

mod auth;
#[cfg(desktop)]
mod downloads;

#[derive(Clone, Default)]
struct Conn {
    server: Option<String>,
    key: Option<String>,
    /// Why the key could not go into secure storage: it then lasts until the app closes.
    store_error: Option<String>,
    loaded: bool,
}

enum Body {
    None,
    Json(Value),
    Raw(Vec<u8>, String),
}

pub struct Api {
    http: reqwest::Client,
    app: AppHandle,
    conn: RwLock<Conn>,
    /// The device code of the pairing in progress: a credential, so it never reaches the page.
    pairing: Mutex<Option<String>>,
}

fn host_of(url: &str) -> &str {
    url.split_once("://").map_or(url, |(_, host)| host)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum Kind {
    Movies,
    Series,
}

impl Kind {
    fn path(&self) -> &'static str {
        match self {
            Kind::Movies => "/movies",
            Kind::Series => "/series",
        }
    }
}

// Images load through <img>, which can't carry the device key, so they pass through here.
async fn artwork(app: AppHandle, path: String) -> tauri::http::Response<Vec<u8>> {
    #[cfg(desktop)]
    if let Some(bytes) = app.state::<Downloads>().0.local_artwork(&path) {
        return jpeg(Ok(bytes));
    }
    jpeg(app.state::<Api>().picture(&path).await)
}

fn jpeg(bytes: Result<Vec<u8>, String>) -> tauri::http::Response<Vec<u8>> {
    match bytes {
        Ok(bytes) => tauri::http::Response::builder()
            .header("Content-Type", "image/jpeg")
            .body(bytes),
        Err(_) => tauri::http::Response::builder()
            .status(404)
            .body(Vec::new()),
    }
    .expect("static response parts are valid")
}

impl Api {
    /// A picture of the server's, fetched with the device key.
    async fn picture(&self, path: &str) -> Result<Vec<u8>, String> {
        let conn = self.conn().await;
        let mut req = self.http.get(format!(
            "{}/api/v1/posters{path}",
            conn.server.unwrap_or_default()
        ));
        if let Some(key) = &conn.key {
            req = req.header("X-API-Key", key);
        }
        let bytes = async { req.send().await?.error_for_status()?.bytes().await };
        bytes.await.map(|b| b.to_vec()).map_err(|e| e.to_string())
    }

    /// Reads the server address and the key on first use: the key store can block, and on
    /// Android it answers on the main thread, so never during setup.
    async fn conn(&self) -> Conn {
        let conn = self.conn.read().unwrap().clone();
        if conn.loaded {
            return conn;
        }
        let app = self.app.clone();
        let (server, key) = tauri::async_runtime::spawn_blocking(move || {
            (auth::read_server(&app), auth::load_key(&app))
        })
        .await
        .expect("key store read panicked");
        let mut c = self.conn.write().unwrap();
        if !c.loaded {
            *c = Conn {
                server,
                key: key.unwrap_or_else(|e| {
                    eprintln!("device key unreadable: {e}");
                    None
                }),
                store_error: None,
                loaded: true,
            };
        }
        c.clone()
    }

    /// A call whose answer is a file: the bytes and the name its `Content-Disposition` gives.
    async fn call_file(&self, path: &str) -> Result<(Vec<u8>, Option<String>), String> {
        let conn = self.conn().await;
        let Some(server) = conn.server else {
            return Err(json!({ "error": { "code": "no_server" } }).to_string());
        };
        let mut req = self.http.get(format!("{server}/api/v1{path}"));
        if let Some(key) = &conn.key {
            req = req.header("X-API-Key", key);
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status();
        let disposition = resp
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        if status == reqwest::StatusCode::UNAUTHORIZED && conn.key.is_some() {
            self.forget_key().await;
            let _ = self.app.emit("signed-out", ());
        }
        if status.is_success() {
            Ok((bytes.to_vec(), disposition))
        } else {
            Err(String::from_utf8_lossy(&bytes).into_owned())
        }
    }

    fn set_server(&self, url: String) {
        self.conn.write().unwrap().server = Some(url);
    }

    fn set_key(&self, key: String, store_error: Option<String>) {
        let mut c = self.conn.write().unwrap();
        c.key = Some(key);
        c.store_error = store_error;
    }

    async fn forget_key(&self) {
        self.conn.write().unwrap().key = None;
        let app = self.app.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || auth::delete_key(&app)).await;
    }

    async fn call(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, String> {
        self.call_with(method, path, body.map_or(Body::None, Body::Json))
            .await
    }

    async fn call_with(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Body,
    ) -> Result<Value, String> {
        let conn = self.conn().await;
        let Some(server) = conn.server else {
            return Err(json!({ "error": { "code": "no_server" } }).to_string());
        };
        let mut req = self.http.request(method, format!("{server}/api/v1{path}"));
        if let Some(key) = &conn.key {
            req = req.header("X-API-Key", key);
        }
        req = match body {
            Body::None => req,
            Body::Json(b) => req.json(&b),
            Body::Raw(bytes, content_type) => req.header("Content-Type", content_type).body(bytes),
        };
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        let value = if text.is_empty() {
            Value::Null
        } else {
            serde_json::from_str(&text).map_err(|e| e.to_string())?
        };
        // The key was revoked from the account page, or a password change dropped every key.
        if status == reqwest::StatusCode::UNAUTHORIZED && conn.key.is_some() {
            self.forget_key().await;
            let _ = self.app.emit("signed-out", ());
        }
        if status.is_success() {
            Ok(value)
        } else {
            Err(value.to_string())
        }
    }
}

#[tauri::command]
async fn server_host(api: tauri::State<'_, Api>) -> Result<String, String> {
    Ok(api
        .conn()
        .await
        .server
        .as_deref()
        .map(host_of)
        .unwrap_or_default()
        .to_owned())
}

#[tauri::command]
async fn library(api: tauri::State<'_, Api>, kind: Kind) -> Result<Value, String> {
    api.call(reqwest::Method::GET, kind.path(), None).await
}

#[tauri::command]
async fn title(api: tauri::State<'_, Api>, kind: Kind, id: u32) -> Result<Value, String> {
    api.call(reqwest::Method::GET, &format!("{}/{id}", kind.path()), None)
        .await
}

#[tauri::command]
async fn person(api: tauri::State<'_, Api>, id: String) -> Result<Value, String> {
    // A slug from the server, but it lands in a URL path: refuse anything that could leave it.
    if !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        return Err(json!({ "error": { "code": "not_found" } }).to_string());
    }
    api.call(reqwest::Method::GET, &format!("/people/{id}"), None)
        .await
}

#[tauri::command]
async fn watch_state(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/watchstate", None).await
}

#[tauri::command]
async fn set_watched(
    api: tauri::State<'_, Api>,
    media_id: String,
    watched: bool,
) -> Result<Value, String> {
    api.call(
        reqwest::Method::PUT,
        &format!("/watchstate/{media_id}"),
        Some(json!({ "watched": watched })),
    )
    .await
}

#[tauri::command]
async fn me(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/me", None).await
}

#[tauri::command]
async fn home(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/home", None).await
}

#[tauri::command]
async fn update_me(
    api: tauri::State<'_, Api>,
    name: Option<String>,
    email: Option<String>,
) -> Result<Value, String> {
    let mut body = serde_json::Map::new();
    if let Some(name) = name {
        body.insert("display_name".into(), name.into());
    }
    if let Some(email) = email {
        body.insert("email".into(), email.into());
    }
    api.call(reqwest::Method::PATCH, "/me", Some(body.into()))
        .await
}

/// The image travels as the raw body of the call, its type in `x-picture-type`.
#[tauri::command]
async fn set_picture(
    api: tauri::State<'_, Api>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(json!({ "error": { "code": "invalid_request" } }).to_string());
    };
    let content_type = request
        .headers()
        .get("x-picture-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    api.call_with(
        reqwest::Method::PUT,
        "/me/picture",
        Body::Raw(bytes.clone(), content_type),
    )
    .await
    .map(drop)
}

#[tauri::command]
async fn remove_picture(api: tauri::State<'_, Api>) -> Result<(), String> {
    api.call(reqwest::Method::DELETE, "/me/picture", None)
        .await
        .map(drop)
}

#[tauri::command]
async fn revoke_device(api: tauri::State<'_, Api>, id: String) -> Result<(), String> {
    if !id
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(json!({ "error": { "code": "not_found" } }).to_string());
    }
    api.call(reqwest::Method::DELETE, &format!("/devices/{id}"), None)
        .await
        .map(drop)
}

#[tauri::command]
async fn devices(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/devices", None).await
}

#[tauri::command]
async fn activity(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/activity", None).await
}

#[tauri::command]
async fn activity_read(api: tauri::State<'_, Api>, ids: Vec<String>) -> Result<(), String> {
    api.call(
        reqwest::Method::POST,
        "/activity/read",
        Some(json!({ "ids": ids })),
    )
    .await
    .map(drop)
}

fn safe_id(id: &str) -> Result<(), String> {
    if !id.is_empty()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        Ok(())
    } else {
        Err(json!({ "error": { "code": "not_found" } }).to_string())
    }
}

fn with_message(message: Option<String>) -> Value {
    message.map_or_else(|| json!({}), |m| json!({ "message": m }))
}

#[tauri::command]
async fn admin_overview(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/admin/overview", None)
        .await
}

#[tauri::command]
async fn admin_settings(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/admin/settings", None)
        .await
}

#[tauri::command]
async fn save_admin_settings(api: tauri::State<'_, Api>, patch: Value) -> Result<Value, String> {
    api.call(reqwest::Method::PATCH, "/admin/settings", Some(patch))
        .await
}

#[tauri::command]
async fn admin_restart(api: tauri::State<'_, Api>, message: Option<String>) -> Result<(), String> {
    api.call(
        reqwest::Method::POST,
        "/admin/restart",
        Some(with_message(message)),
    )
    .await
    .map(drop)
}

#[tauri::command]
async fn admin_streams(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/admin/streams", None).await
}

#[tauri::command]
async fn stop_stream(
    api: tauri::State<'_, Api>,
    id: String,
    message: Option<String>,
) -> Result<(), String> {
    safe_id(&id)?;
    api.call(
        reqwest::Method::POST,
        &format!("/admin/streams/{id}/stop"),
        Some(with_message(message)),
    )
    .await
    .map(drop)
}

#[tauri::command]
async fn admin_pairings(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/admin/pairings", None)
        .await
}

#[tauri::command]
async fn admin_devices(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/admin/devices", None).await
}

#[tauri::command]
async fn admin_resolve_pairing(
    api: tauri::State<'_, Api>,
    code: String,
    approve: bool,
) -> Result<(), String> {
    safe_id(&code)?;
    let verb = if approve { "approve" } else { "deny" };
    api.call(
        reqwest::Method::POST,
        &format!("/admin/pairings/{code}/{verb}"),
        None,
    )
    .await
    .map(drop)
}

#[tauri::command]
async fn admin_revoke_device(api: tauri::State<'_, Api>, id: String) -> Result<(), String> {
    safe_id(&id)?;
    api.call(
        reqwest::Method::DELETE,
        &format!("/admin/devices/{id}"),
        None,
    )
    .await
    .map(drop)
}

#[tauri::command]
async fn admin_library(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/admin/library", None).await
}

#[tauri::command]
async fn admin_scan(api: tauri::State<'_, Api>, folder_id: Option<String>) -> Result<(), String> {
    let body = folder_id.map_or_else(|| json!({}), |id| json!({ "folder_id": id }));
    api.call(reqwest::Method::POST, "/admin/library/scan", Some(body))
        .await
        .map(drop)
}

#[tauri::command]
async fn admin_clear_cache(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::POST, "/admin/cache/clear", None)
        .await
}

#[tauri::command]
async fn admin_logs(
    api: tauri::State<'_, Api>,
    level: String,
    after: Option<u64>,
) -> Result<Value, String> {
    if !matches!(level.as_str(), "all" | "warn" | "error") {
        return Err(json!({ "error": { "code": "invalid_request" } }).to_string());
    }
    let after = after.map_or_else(String::new, |id| format!("&after={id}"));
    api.call(
        reqwest::Method::GET,
        &format!("/admin/logs?level={level}{after}"),
        None,
    )
    .await
}

/// The file name a `Content-Disposition` offers, cut down to a plain name so it can never leave the folder.
fn download_name(disposition: Option<&str>) -> String {
    const FALLBACK: &str = "streamline-logs.zip";
    let offered = disposition
        .and_then(|d| d.split("filename=").nth(1))
        .map(|rest| {
            rest.split(';')
                .next()
                .unwrap_or_default()
                .trim()
                .trim_matches('"')
        })
        .and_then(|name| name.rsplit(['/', '\\']).next())
        .unwrap_or_default();
    if offered.is_empty() || offered.starts_with('.') {
        FALLBACK.to_owned()
    } else {
        offered.to_owned()
    }
}

/// `name` in `dir`, or `name (2)`, `name (3)`... before the extension when that is taken.
fn free_path(dir: &std::path::Path, name: &str) -> PathBuf {
    let (stem, ext) = name.rsplit_once('.').map_or((name, ""), |(s, e)| (s, e));
    let ext = if ext.is_empty() {
        String::new()
    } else {
        format!(".{ext}")
    };
    let mut path = dir.join(name);
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    path
}

#[tauri::command]
async fn admin_logs_download(app: AppHandle, api: tauri::State<'_, Api>) -> Result<String, String> {
    let (bytes, disposition) = api.call_file("/admin/logs/download").await?;
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = download_name(disposition.as_deref());
    // `create_new` closes the gap between the exists check and the write.
    loop {
        let path = free_path(&dir, &name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut file) => {
                std::io::Write::write_all(&mut file, &bytes).map_err(|e| e.to_string())?;
                return Ok(path
                    .file_name()
                    .map_or(name, |n| n.to_string_lossy().into_owned()));
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
}

#[tauri::command]
async fn playback_status(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/playback/status", None)
        .await
}

/// The session this device has open, on disk so that a launch after a crash, or a page reload,
/// can stop it: both skip `stop_session`, and the dead session would hold its conversion slot
/// until Streamline's heartbeat timeout.
fn open_session_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("open-session"))
}

fn record_open_session(app: &AppHandle, id: &str) {
    if let Some(file) = open_session_file(app) {
        let _ = file.parent().map(fs::create_dir_all);
        let _ = fs::write(file, id);
    }
}

fn forget_open_session(app: &AppHandle, id: &str) {
    if let Some(file) = open_session_file(app)
        && fs::read_to_string(&file).is_ok_and(|open| open == id)
    {
        let _ = fs::remove_file(file);
    }
}

fn stop_left_over_session(app: &AppHandle) {
    let Some(file) = open_session_file(app) else {
        return;
    };
    let Ok(id) = fs::read_to_string(&file) else {
        return;
    };
    // Removed before the DELETE is sent, so a session started meanwhile is never the one forgotten.
    let _ = fs::remove_file(file);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let path = format!("/playback/sessions/{id}");
        let _ = app
            .state::<Api>()
            .call(reqwest::Method::DELETE, &path, None)
            .await;
    });
}

#[tauri::command]
async fn start_session(
    app: AppHandle,
    api: tauri::State<'_, Api>,
    media_id: String,
    capabilities: Value,
    position: f64,
    tracks: Value,
) -> Result<Value, String> {
    let mut body = json!({
        "media_id": media_id,
        "capabilities": capabilities,
        "position": position,
    });
    if let (Some(body), Some(tracks)) = (body.as_object_mut(), tracks.as_object()) {
        body.extend(tracks.clone());
    }
    let session = api
        .call(reqwest::Method::POST, "/playback/sessions", Some(body))
        .await?;
    if let Some(id) = session["session_id"].as_str() {
        record_open_session(&app, id);
    }
    Ok(session)
}

#[tauri::command]
async fn decisions(
    api: tauri::State<'_, Api>,
    media_id: String,
    capabilities: Value,
    options: Value,
) -> Result<Value, String> {
    api.call(
        reqwest::Method::POST,
        "/playback/decisions",
        Some(json!({
            "media_id": media_id,
            "capabilities": capabilities,
            "options": options,
        })),
    )
    .await
}

#[tauri::command]
async fn media_tracks(api: tauri::State<'_, Api>, media_id: String) -> Result<Value, String> {
    api.call(
        reqwest::Method::GET,
        &format!("/playback/media/{media_id}/tracks"),
        None,
    )
    .await
}

/// The engine authorises a media file by its signed URL alone; the device key stays out of this request.
async fn fetch_text(http: &reqwest::Client, url: &str) -> Result<String, String> {
    http.get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn media_text(
    app: AppHandle,
    api: tauri::State<'_, Api>,
    url: String,
) -> Result<String, String> {
    #[cfg(desktop)]
    if downloads::is_local(&url) {
        let dir = downloads_dir(&app)?;
        return downloads::read_local_text(&dir, &url);
    }
    let _ = &app;
    fetch_text(&api.http, &url).await
}

#[tauri::command]
async fn patch_session(
    api: tauri::State<'_, Api>,
    id: String,
    changes: Value,
) -> Result<Value, String> {
    api.call(
        reqwest::Method::PATCH,
        &format!("/playback/sessions/{id}"),
        Some(changes),
    )
    .await
}

#[tauri::command]
async fn session_info(api: tauri::State<'_, Api>, id: String) -> Result<Value, String> {
    api.call(
        reqwest::Method::GET,
        &format!("/playback/sessions/{id}"),
        None,
    )
    .await
}

#[tauri::command]
async fn stop_session(
    app: AppHandle,
    api: tauri::State<'_, Api>,
    id: String,
) -> Result<(), String> {
    forget_open_session(&app, &id);
    api.call(
        reqwest::Method::DELETE,
        &format!("/playback/sessions/{id}"),
        None,
    )
    .await
    .map(drop)
}

#[tauri::command]
async fn heartbeat(
    api: tauri::State<'_, Api>,
    id: String,
    position: f64,
    paused: bool,
) -> Result<(), String> {
    let body = json!({ "position": position, "paused": paused });
    api.call(
        reqwest::Method::POST,
        &format!("/playback/sessions/{id}/progress"),
        Some(body),
    )
    .await
    .map(drop)
}

#[tauri::command]
async fn reachable(api: tauri::State<'_, Api>) -> Result<bool, String> {
    let answer = api
        .call(reqwest::Method::GET, "/playback/status", None)
        .await;
    Ok(answer.as_ref().err().is_none_or(|e| downloads_is_answer(e)))
}

#[cfg(desktop)]
fn downloads_is_answer(e: &str) -> bool {
    downloads::is_answer(e)
}

#[cfg(not(desktop))]
fn downloads_is_answer(e: &str) -> bool {
    serde_json::from_str::<Value>(e).is_ok()
}

#[cfg(desktop)]
struct Downloads(downloads::Queue);

#[cfg(desktop)]
fn downloads_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("downloads"))
        .map_err(|e| e.to_string())
}

#[cfg(desktop)]
struct AppServer(AppHandle);

#[cfg(desktop)]
impl downloads::Server for AppServer {
    fn call(
        &self,
        method: reqwest::Method,
        path: String,
        body: Option<Value>,
    ) -> downloads::BoxFuture<Result<Value, String>> {
        let app = self.0.clone();
        Box::pin(async move { app.state::<Api>().call(method, &path, body).await })
    }

    fn picture(&self, path: String) -> downloads::BoxFuture<Result<Vec<u8>, String>> {
        let app = self.0.clone();
        Box::pin(async move { app.state::<Api>().picture(&path).await })
    }
}

#[cfg(desktop)]
#[tauri::command]
fn list_downloads(queue: tauri::State<'_, Downloads>) -> Vec<downloads::DownloadEntry> {
    queue.0.items()
}

#[cfg(desktop)]
#[tauri::command]
fn start_downloads(
    queue: tauri::State<'_, Downloads>,
    items: Vec<downloads::DownloadRequest>,
    capabilities: Value,
) {
    queue.0.start(items, capabilities);
}

#[cfg(desktop)]
#[tauri::command]
async fn remove_downloads(
    queue: tauri::State<'_, Downloads>,
    keys: Vec<String>,
) -> Result<(), String> {
    queue.0.remove(keys).await;
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn retry_download(queue: tauri::State<'_, Downloads>, key: String) {
    queue.0.retry(&key);
}

#[cfg(desktop)]
#[tauri::command]
async fn download_storage(
    queue: tauri::State<'_, Downloads>,
) -> Result<downloads::Storage, String> {
    Ok(queue.0.storage())
}

#[cfg(desktop)]
#[tauri::command]
fn local_playback(queue: tauri::State<'_, Downloads>, key: String) -> Option<downloads::Local> {
    queue.0.local_playback(&key)
}

#[cfg(desktop)]
#[tauri::command]
fn note_offline(queue: tauri::State<'_, Downloads>, key: String, position: f64, done: bool) {
    queue.0.note_offline(&key, position, done);
}

#[cfg(desktop)]
#[tauri::command]
async fn sync_offline(queue: tauri::State<'_, Downloads>) -> Result<usize, String> {
    Ok(queue.0.sync_offline().await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_player::init())
        .setup(|app| {
            app.manage(Api {
                http: reqwest::Client::builder()
                    .connect_timeout(std::time::Duration::from_secs(10))
                    .read_timeout(std::time::Duration::from_secs(30))
                    .build()
                    .expect("the default TLS backend builds"),
                app: app.handle().clone(),
                conn: RwLock::default(),
                pairing: Mutex::default(),
            });
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                let emitter = handle.clone();
                app.manage(Downloads(downloads::Queue::new(
                    downloads_dir(&handle)?,
                    std::sync::Arc::new(AppServer(handle)),
                    std::sync::Arc::new(move |snapshot| {
                        let _ = emitter.emit("downloads", snapshot);
                    }),
                    downloads::Config::default(),
                )));
            }
            #[cfg(target_os = "linux")]
            // WebKitGTK (seen on 2.54.1) zooms pages by gtk-xft-dpi / 96, and GTK reports -1
            // when no XSETTINGS daemon runs (Hyprland, sway): pages get a zoom of -1/96, a
            // negative innerWidth and devicePixelRatio, a collapsed layout and clicks that
            // miss. Drop this once WebKitGTK ignores an unset DPI.
            if let Some(settings) = gtk::Settings::default() {
                use gtk::prelude::GtkSettingsExt;
                if settings.gtk_xft_dpi() <= 0 {
                    settings.set_gtk_xft_dpi(96 * 1024);
                }
            }
            Ok(())
        })
        // On each load, not only at launch: a reload drops the page without `stop_session`
        // while this process, and the file naming the session, live on.
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                stop_left_over_session(webview.app_handle());
            }
        })
        .register_asynchronous_uri_scheme_protocol("artwork", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_owned();
            tauri::async_runtime::spawn(async move {
                responder.respond(artwork(app, path).await);
            });
        })
        .invoke_handler(tauri::generate_handler![
            auth::auth_state,
            auth::connect,
            auth::pair_start,
            auth::pair_poll,
            auth::open_external,
            auth::sign_out,
            server_host,
            library,
            title,
            person,
            watch_state,
            set_watched,
            me,
            home,
            update_me,
            set_picture,
            remove_picture,
            revoke_device,
            devices,
            activity,
            activity_read,
            admin_overview,
            admin_settings,
            save_admin_settings,
            admin_restart,
            admin_streams,
            stop_stream,
            admin_pairings,
            admin_devices,
            admin_resolve_pairing,
            admin_revoke_device,
            admin_library,
            admin_scan,
            admin_clear_cache,
            admin_logs,
            admin_logs_download,
            playback_status,
            decisions,
            media_tracks,
            media_text,
            start_session,
            patch_session,
            session_info,
            stop_session,
            heartbeat,
            reachable,
            #[cfg(desktop)]
            list_downloads,
            #[cfg(desktop)]
            start_downloads,
            #[cfg(desktop)]
            remove_downloads,
            #[cfg(desktop)]
            retry_download,
            #[cfg(desktop)]
            download_storage,
            #[cfg(desktop)]
            local_playback,
            #[cfg(desktop)]
            note_offline,
            #[cfg(desktop)]
            sync_offline
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn download_name_is_a_plain_file_name() {
        let name = |d| download_name(Some(d));
        assert_eq!(
            name("attachment; filename=\"streamline-logs.zip\""),
            "streamline-logs.zip"
        );
        assert_eq!(name("attachment; filename=../../etc/passwd"), "passwd");
        assert_eq!(name("attachment; filename=\"..\\evil.zip\""), "evil.zip");
        assert_eq!(
            name("attachment; filename=\".hidden\""),
            "streamline-logs.zip"
        );
        assert_eq!(download_name(None), "streamline-logs.zip");
    }

    #[test]
    fn free_path_never_overwrites() {
        let dir = std::env::temp_dir().join(format!("free-path-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(free_path(&dir, "logs.zip"), dir.join("logs.zip"));
        fs::write(dir.join("logs.zip"), b"x").unwrap();
        assert_eq!(free_path(&dir, "logs.zip"), dir.join("logs (2).zip"));
        fs::write(dir.join("logs (2).zip"), b"x").unwrap();
        assert_eq!(free_path(&dir, "logs.zip"), dir.join("logs (3).zip"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn media_text_sends_no_credential() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/media/job/2.vtt", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut conn, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let n = conn.read(&mut buf).unwrap();
            conn.write_all(
                b"HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nWEBVTT",
            )
            .unwrap();
            String::from_utf8_lossy(&buf[..n]).to_lowercase()
        });
        let text = tauri::async_runtime::block_on(fetch_text(&reqwest::Client::new(), &url));
        assert_eq!(text.unwrap(), "WEBVTT");
        let request = server.join().unwrap();
        assert!(request.starts_with("get /media/job/2.vtt"), "{request}");
        assert!(!request.contains("authorization"), "{request}");
        assert!(!request.contains("x-api-key"), "{request}");
    }
}
