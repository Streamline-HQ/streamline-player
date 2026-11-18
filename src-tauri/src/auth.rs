use crate::Api;
use serde_json::{Value, json};
use std::{
    fs,
    hash::{BuildHasher, Hasher},
    path::PathBuf,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

const KEY_NAME: &str = "device-key";
const HEALTH_TIMEOUT: Duration = Duration::from_secs(5);

#[cfg(target_os = "android")]
pub const KEYSTORE: &str = "Android Keystore";
#[cfg(target_os = "linux")]
pub const KEYSTORE: &str = "Secret Service";
#[cfg(target_os = "windows")]
pub const KEYSTORE: &str = "Windows Credential Manager";

/// Where the server address and this install's id live: plain app data, unlike the key.
fn data_file(app: &AppHandle, name: &str) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(name))
}

pub fn read_server(app: &AppHandle) -> Option<String> {
    data_file(app, "server")
        .and_then(|f| fs::read_to_string(f).ok())
        .filter(|s| !s.is_empty())
}

fn write_data(app: &AppHandle, name: &str, value: &str) {
    if let Some(file) = data_file(app, name) {
        let _ = file.parent().map(fs::create_dir_all);
        let _ = fs::write(file, value);
    }
}

/// Stable per install: approving a pairing with a known `client_id` replaces that device's old key.
fn client_id(app: &AppHandle) -> String {
    if let Some(id) = data_file(app, "client-id").and_then(|f| fs::read_to_string(f).ok()) {
        return id;
    }
    // RandomState is seeded from the OS's randomness: two draws make 128 random bits.
    let draw = || {
        std::collections::hash_map::RandomState::new()
            .build_hasher()
            .finish()
    };
    let id = format!("{:016x}{:016x}", draw(), draw());
    write_data(app, "client-id", &id);
    id
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn entry() -> Result<keyring_core::Entry, String> {
    #[cfg(target_os = "windows")]
    use windows_native_keyring_store::Store;
    #[cfg(target_os = "linux")]
    use zbus_secret_service_keyring_store::Store;
    static STORE: std::sync::Once = std::sync::Once::new();
    STORE.call_once(|| {
        if let Ok(store) = Store::new() {
            keyring_core::set_default_store(store);
        }
    });
    keyring_core::Entry::new("streamline-player", KEY_NAME).map_err(|e| e.to_string())
}

#[cfg(target_os = "android")]
fn vault(app: &AppHandle, command: &str, value: Option<&str>) -> Result<Value, String> {
    app.state::<tauri_plugin_player::Android<tauri::Wry>>()
        .0
        .run_mobile_plugin::<Value>(command, json!({ "name": KEY_NAME, "value": value }))
        .map_err(|e| e.to_string())
}

// Only Android reaches its key store through the app.
#[cfg_attr(not(target_os = "android"), allow(unused_variables))]
pub fn load_key(app: &AppHandle) -> Result<Option<String>, String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    return match entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    };
    #[cfg(target_os = "android")]
    return Ok(vault(app, "vaultGet", None)?["value"]
        .as_str()
        .map(str::to_owned));
}

#[cfg_attr(not(target_os = "android"), allow(unused_variables))]
fn store_key(app: &AppHandle, key: &str) -> Result<(), String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    return entry()?.set_password(key).map_err(|e| e.to_string());
    #[cfg(target_os = "android")]
    return vault(app, "vaultSet", Some(key)).map(drop);
}

#[cfg_attr(not(target_os = "android"), allow(unused_variables))]
pub fn delete_key(app: &AppHandle) {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    let _ = entry().and_then(|e| e.delete_credential().map_err(|e| e.to_string()));
    #[cfg(target_os = "android")]
    let _ = vault(app, "vaultDelete", None);
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .expect("blocking task panicked")
}

/// Typed as "streamline.home.arpa", meaning https; an explicit http:// is kept for servers
/// on the LAN without TLS.
fn normalize(typed: &str) -> String {
    let t = typed.trim().trim_end_matches('/');
    if t.contains("://") {
        t.to_owned()
    } else {
        format!("https://{t}")
    }
}

#[tauri::command]
pub async fn auth_state(api: tauri::State<'_, Api>) -> Result<Value, String> {
    let c = api.conn().await;
    Ok(json!({
        "server": c.server,
        "paired": c.key.is_some(),
        "keystore": KEYSTORE,
        "store_error": c.store_error,
    }))
}

/// Asks the address for the sign-in card's extras, which only the player extension answers.
/// `/health` is no proof: the web player's own host answers it too, and so does a Streamline
/// without the extension.
async fn answers_as_player(http: &reqwest::Client, url: &str) -> Result<(), &'static str> {
    let resp = http
        .get(format!("{url}/extensions/player/auth/methods"))
        .timeout(HEALTH_TIMEOUT)
        .send()
        .await
        .map_err(|_| "unreachable")?;
    let known = resp.status().is_success()
        && resp
            .json::<Value>()
            .await
            .is_ok_and(|v| v.get("register_url").is_some());
    if known { Ok(()) } else { Err("not_streamline") }
}

/// Checks the address answers as Streamline before keeping it. Returns the round trip in ms,
/// or an error code the page words: `unreachable`, `not_streamline`.
#[tauri::command]
pub async fn connect(
    app: AppHandle,
    api: tauri::State<'_, Api>,
    url: String,
) -> Result<u64, String> {
    let url = normalize(&url);
    let started = Instant::now();
    answers_as_player(&api.http, &url).await?;
    let ms = started.elapsed().as_millis() as u64;
    if api.conn().await.server.as_deref() != Some(url.as_str()) {
        write_data(&app, "server", &url);
        api.forget_key().await;
        api.set_server(url);
    }
    Ok(ms)
}

fn device(app: &AppHandle) -> (String, &'static str) {
    #[cfg(target_os = "android")]
    {
        let info = app
            .state::<tauri_plugin_player::Android<tauri::Wry>>()
            .0
            .run_mobile_plugin::<Value>("deviceInfo", json!({}))
            .unwrap_or_default();
        let tv = info["platform"] == "Android TV";
        let name = info["name"].as_str().unwrap_or("Android TV").to_owned();
        (name, if tv { "android-tv" } else { "android" })
    }
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        let name =
            fs::read_to_string("/etc/hostname").map_or("Linux".to_owned(), |h| h.trim().to_owned());
        (name, "linux")
    }
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        (
            std::env::var("COMPUTERNAME").unwrap_or("Windows".to_owned()),
            "windows",
        )
    }
}

fn qr_svg(data: &str) -> Result<String, String> {
    use qrcode::render::svg;
    let code = qrcode::QrCode::new(data).map_err(|e| e.to_string())?;
    Ok(code
        .render::<svg::Color>()
        .quiet_zone(false)
        .dark_color(svg::Color("#0b0b10"))
        .light_color(svg::Color("transparent"))
        .build())
}

/// Starts a pairing; the device code stays in Rust, the page only gets what it shows.
#[tauri::command]
pub async fn pair_start(app: AppHandle, api: tauri::State<'_, Api>) -> Result<Value, String> {
    let (name, platform) = {
        let app = app.clone();
        blocking(move || device(&app)).await
    };
    let started = api
        .call(
            reqwest::Method::POST,
            "/auth/device/code",
            Some(json!({ "client_id": client_id(&app), "name": name, "platform": platform })),
        )
        .await?;
    let device_code = started["device_code"]
        .as_str()
        .ok_or("no device_code")?
        .to_owned();
    *api.pairing.lock().unwrap() = Some(device_code);
    let complete = started["verification_uri_complete"]
        .as_str()
        .unwrap_or_default();
    Ok(json!({
        "code": started["user_code"],
        "name": name,
        "uri": started["verification_uri"],
        "uri_complete": complete,
        "expires_in": started["expires_in"],
        "interval": started["interval"],
        "qr": qr_svg(complete)?,
    }))
}

/// Opens a web page in the system browser; anything but http(s) is refused.
#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("not a web address: {url}"));
    }
    blocking(move || {
        app.opener()
            .open_url(parsed.as_str(), None::<&str>)
            .map_err(|e| e.to_string())
    })
    .await
}

/// One poll: "pending", "slow_down", "denied", "expired" or "paired".
#[tauri::command]
pub async fn pair_poll(app: AppHandle, api: tauri::State<'_, Api>) -> Result<&'static str, String> {
    let Some(device_code) = api.pairing.lock().unwrap().clone() else {
        return Ok("expired");
    };
    let answer = api
        .call(
            reqwest::Method::POST,
            "/auth/device/token",
            Some(json!({ "device_code": device_code })),
        )
        .await;
    let key = match answer {
        Ok(v) => v["api_key"].as_str().ok_or("no api_key")?.to_owned(),
        Err(e) => {
            let code = serde_json::from_str::<Value>(&e)
                .ok()
                .and_then(|v| v["error"]["code"].as_str().map(str::to_owned));
            return match code.as_deref() {
                Some("authorization_pending") => Ok("pending"),
                Some("slow_down") => Ok("slow_down"),
                Some("access_denied") => Ok("denied"),
                Some("expired_token") => Ok("expired"),
                _ => Err(e),
            };
        }
    };
    *api.pairing.lock().unwrap() = None;
    let stored = {
        let (app, key) = (app.clone(), key.clone());
        blocking(move || store_key(&app, &key)).await
    };
    api.set_key(key, stored.err());
    Ok("paired")
}

const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(600);
const CALLBACK_PAGE: &str = "<!doctype html><meta charset=\"utf-8\"><title>Streamline Player</title>\
<body style=\"font:16px system-ui;padding:48px;background:#0b0b10;color:#e8e8ee\">\
<p>You can close this tab and go back to Streamline Player.</p>";

/// The sign-in a newer click replaced ends here, so only one browser round trip waits at a time.
static PENDING_SIGN_IN: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>> =
    std::sync::Mutex::new(None);

fn random_token() -> Result<String, String> {
    use base64::Engine;
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

fn challenge(verifier: &str) -> String {
    use base64::Engine;
    use sha2::Digest;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sha2::Sha256::digest(verifier))
}

/// Answers the browser's requests to the loopback address until one is the callback, and
/// returns that one's query.
async fn callback(listener: &tokio::net::TcpListener) -> Result<String, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    loop {
        let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 8192];
        let n = stream.read(&mut buf).await.unwrap_or(0);
        let head = String::from_utf8_lossy(&buf[..n]);
        let target = head.split(' ').nth(1).unwrap_or_default().to_owned();
        let Some(query) = target.strip_prefix("/callback?").map(str::to_owned) else {
            let _ = stream
                .write_all(
                    b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await;
            continue;
        };
        let reply = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{CALLBACK_PAGE}",
            CALLBACK_PAGE.len()
        );
        let _ = stream.write_all(reply.as_bytes()).await;
        return Ok(query);
    }
}

/// Signs in through Streamline's own page in the system browser (RFC 8252: authorization code
/// with PKCE, back to a loopback address) and keeps the device key the exchange answers.
/// Errors are the codes the sign-in page words: `denied`, `state`, `invalid_grant`, `network`,
/// and `replaced` when a newer sign-in took over.
#[tauri::command]
pub async fn sign_in(app: AppHandle, api: tauri::State<'_, Api>) -> Result<Value, String> {
    let server = api.conn().await.server.ok_or("network")?;
    let (name, platform) = {
        let app = app.clone();
        blocking(move || device(&app)).await
    };
    let (cancel, cancelled) = tokio::sync::oneshot::channel();
    if let Some(older) = PENDING_SIGN_IN.lock().unwrap().replace(cancel) {
        let _ = older.send(());
    }
    let device = json!({ "client_id": client_id(&app), "name": name, "platform": platform });
    let key = sign_in_flow(
        &api.http,
        &server,
        device,
        |url| open_external(app.clone(), url),
        cancelled,
    )
    .await?;
    let stored = {
        let (app, key) = (app.clone(), key.clone());
        blocking(move || store_key(&app, &key)).await
    };
    api.set_key(key, stored.err());
    Ok(json!({ "name": name }))
}

/// The browser round trip and the code exchange, apart from the app: `open` shows the person
/// the authorize page, and `device` (`client_id`, `name`, `platform`) names the app to the server.
/// Answers the device key.
async fn sign_in_flow(
    http: &reqwest::Client,
    server: &str,
    device: Value,
    open: impl AsyncFnOnce(String) -> Result<(), String>,
    cancelled: tokio::sync::oneshot::Receiver<()>,
) -> Result<String, String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| "network")?;
    let port = listener.local_addr().map_err(|_| "network")?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let (verifier, state) = (random_token()?, random_token()?);
    let authorize = reqwest::Url::parse_with_params(
        &format!("{server}/extensions/player/authorize"),
        [
            ("redirect_uri", redirect_uri.as_str()),
            ("state", state.as_str()),
            ("code_challenge", challenge(&verifier).as_str()),
            ("code_challenge_method", "S256"),
        ],
    )
    .map_err(|_| "network")?;
    open(authorize.to_string()).await?;
    let query = tokio::select! {
        q = tokio::time::timeout(SIGN_IN_TIMEOUT, callback(&listener)) => q.map_err(|_| "state")??,
        _ = cancelled => return Err("replaced".into()),
    };
    let params: std::collections::HashMap<String, String> =
        reqwest::Url::parse(&format!("http://loopback/?{query}"))
            .map_err(|_| "state")?
            .query_pairs()
            .into_owned()
            .collect();
    if params.get("state") != Some(&state) {
        return Err("state".into());
    }
    if params.get("error").map(String::as_str) == Some("access_denied") {
        return Err("denied".into());
    }
    let mut body = json!({
        "grant_type": "authorization_code",
        "code": params.get("code").ok_or("state")?,
        "code_verifier": verifier,
        "redirect_uri": redirect_uri,
    });
    if let (Some(body), Value::Object(device)) = (body.as_object_mut(), device) {
        body.extend(device);
    }
    let resp = http
        .post(format!("{server}/extensions/player/auth/token"))
        .json(&body)
        .send()
        .await
        .map_err(|_| "network")?;
    if !resp.status().is_success() {
        return Err("invalid_grant".into());
    }
    let answer: Value = resp.json().await.map_err(|_| "invalid_grant")?;
    answer["api_key"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| "invalid_grant".into())
}

#[tauri::command]
pub async fn auth_methods(api: tauri::State<'_, Api>) -> Result<Value, String> {
    api.call(reqwest::Method::GET, "/auth/methods", None).await
}

/// Drops this device's key on the server (best effort) and here.
#[tauri::command]
pub async fn sign_out(api: tauri::State<'_, Api>) -> Result<(), String> {
    let _ = api
        .call(reqwest::Method::DELETE, "/devices/current", None)
        .await;
    api.forget_key().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn challenge_is_rfc7636_s256() {
        assert_eq!(
            super::challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    use serde_json::{Value, json};
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[derive(Clone, Copy)]
    enum Answer {
        Code,
        Deny,
        RefuseExchange,
    }

    fn params(url: &str) -> HashMap<String, String> {
        reqwest::Url::parse(url)
            .unwrap()
            .query_pairs()
            .into_owned()
            .collect()
    }

    async fn read_request(s: &mut tokio::net::TcpStream) -> (String, Vec<u8>) {
        let mut buf = Vec::new();
        let mut chunk = [0u8; 4096];
        let end = loop {
            let n = s.read(&mut chunk).await.unwrap();
            buf.extend_from_slice(&chunk[..n]);
            if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                break i + 4;
            }
        };
        let head = String::from_utf8_lossy(&buf[..end]).into_owned();
        let len: usize = head
            .lines()
            .find_map(|l| {
                l.to_ascii_lowercase()
                    .strip_prefix("content-length:")
                    .map(|v| v.trim().parse().unwrap())
            })
            .unwrap_or(0);
        while buf.len() < end + len {
            let n = s.read(&mut chunk).await.unwrap();
            buf.extend_from_slice(&chunk[..n]);
        }
        let target = head.split(' ').nth(1).unwrap_or_default().to_owned();
        (target, buf[end..end + len].to_vec())
    }

    #[tokio::test]
    async fn only_the_player_extension_passes_for_a_server() {
        let (url, _) = fake_streamline(Answer::Code).await;
        let http = reqwest::Client::new();
        assert_eq!(super::answers_as_player(&http, &url).await, Ok(()));
        // The web player's host: every path answers 200 with the app's page.
        assert_eq!(
            super::answers_as_player(&http, &format!("{url}/web")).await,
            Err("not_streamline")
        );
        assert_eq!(
            super::answers_as_player(&http, &format!("{url}/nothing")).await,
            Err("not_streamline")
        );
        assert_eq!(
            super::answers_as_player(&http, "http://127.0.0.1:1").await,
            Err("unreachable")
        );
    }

    /// Streamline's two sign-in endpoints as the mock answers them: authorize sends the browser
    /// back with a code or the denial, the exchange checks the code, the redirect and PKCE.
    /// Returns the server's address and the last exchange body it received.
    async fn fake_streamline(answer: Answer) -> (String, Arc<Mutex<Option<Value>>>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(None));
        let kept = seen.clone();
        tokio::spawn(async move {
            let mut pending: Option<(String, String)> = None;
            loop {
                let (mut s, _) = listener.accept().await.unwrap();
                let (target, body) = read_request(&mut s).await;
                let reply = if target.starts_with("/extensions/player/authorize?") {
                    let p = params(&format!("http://x{target}"));
                    assert_eq!(p["code_challenge_method"], "S256");
                    pending = Some((p["code_challenge"].clone(), p["redirect_uri"].clone()));
                    let back = match answer {
                        Answer::Deny => format!(
                            "{}?error=access_denied&state={}",
                            p["redirect_uri"], p["state"]
                        ),
                        _ => format!("{}?code=c1&state={}", p["redirect_uri"], p["state"]),
                    };
                    format!(
                        "HTTP/1.1 302 Found\r\nLocation: {back}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    )
                } else if target == "/extensions/player/auth/methods" {
                    let body = json!({ "register_url": null }).to_string();
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    )
                } else if target.starts_with("/web/") {
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 6\r\nConnection: close\r\n\r\n<html>"
                        .to_owned()
                } else if target == "/extensions/player/auth/token" {
                    let b: Value = serde_json::from_slice(&body).unwrap();
                    let (challenge, redirect) = pending.take().unwrap_or_default();
                    let ok = matches!(answer, Answer::Code)
                        && b["code"] == "c1"
                        && b["redirect_uri"] == redirect.as_str()
                        && super::challenge(b["code_verifier"].as_str().unwrap_or_default())
                            == challenge;
                    *kept.lock().unwrap() = Some(b);
                    let (status, body) = if ok {
                        ("200 OK", json!({ "api_key": "k1", "key_id": 1 }))
                    } else {
                        (
                            "400 Bad Request",
                            json!({ "error": { "code": "invalid_grant" } }),
                        )
                    };
                    let body = body.to_string();
                    format!(
                        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    )
                } else {
                    "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        .to_owned()
                };
                let _ = s.write_all(reply.as_bytes()).await;
            }
        });
        (url, seen)
    }

    /// The person's browser: loads the page and follows its redirect back to the app. Spawned,
    /// because the app only reads its callback once `open` has returned.
    async fn browser(url: String) -> Result<(), String> {
        tokio::spawn(async move {
            let _ = reqwest::get(url).await;
        });
        Ok(())
    }

    fn device() -> Value {
        json!({ "client_id": "c-1", "name": "framework-13", "platform": "linux" })
    }

    async fn run(
        server: &str,
        open: impl AsyncFnOnce(String) -> Result<(), String>,
    ) -> Result<String, String> {
        let (_keep, cancelled) = tokio::sync::oneshot::channel();
        super::sign_in_flow(&reqwest::Client::new(), server, device(), open, cancelled).await
    }

    #[tokio::test]
    async fn signs_in_through_the_browser_and_keeps_the_key() {
        let (server, seen) = fake_streamline(Answer::Code).await;
        assert_eq!(run(&server, browser).await.unwrap(), "k1");
        let sent = seen.lock().unwrap().clone().unwrap();
        assert_eq!(sent["grant_type"], "authorization_code");
        assert_eq!(sent["client_id"], "c-1");
        assert_eq!(sent["name"], "framework-13");
        assert_eq!(sent["platform"], "linux");
        assert!(
            sent["redirect_uri"]
                .as_str()
                .unwrap()
                .starts_with("http://127.0.0.1:")
        );
    }

    #[tokio::test]
    async fn a_refusal_on_streamlines_page_is_denied() {
        let (server, seen) = fake_streamline(Answer::Deny).await;
        assert_eq!(run(&server, browser).await.unwrap_err(), "denied");
        assert!(seen.lock().unwrap().is_none());
    }

    #[tokio::test]
    async fn a_return_with_another_state_is_refused_before_any_exchange() {
        let (server, seen) = fake_streamline(Answer::Code).await;
        let forged = async |url: String| {
            let back = format!("{}?code=c1&state=forged", params(&url)["redirect_uri"]);
            tokio::spawn(async move {
                let _ = reqwest::get(back).await;
            });
            Ok(())
        };
        assert_eq!(run(&server, forged).await.unwrap_err(), "state");
        assert!(seen.lock().unwrap().is_none());
    }

    #[tokio::test]
    async fn a_refused_exchange_is_invalid_grant() {
        let (server, _) = fake_streamline(Answer::RefuseExchange).await;
        assert_eq!(run(&server, browser).await.unwrap_err(), "invalid_grant");
    }

    #[tokio::test]
    async fn a_newer_sign_in_replaces_a_waiting_one() {
        let (server, _) = fake_streamline(Answer::Code).await;
        let (cancel, cancelled) = tokio::sync::oneshot::channel();
        let nobody = async |_: String| Ok(());
        let http = reqwest::Client::new();
        let waiting = super::sign_in_flow(&http, &server, device(), nobody, cancelled);
        let _ = cancel.send(());
        assert_eq!(waiting.await.unwrap_err(), "replaced");
    }

    #[tokio::test]
    async fn callback_skips_other_requests_and_answers_the_page() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let browser = tokio::spawn(async move {
            let mut answers = Vec::new();
            for target in ["/favicon.ico", "/callback?code=c&state=s"] {
                let mut s = tokio::net::TcpStream::connect(addr).await.unwrap();
                s.write_all(format!("GET {target} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes())
                    .await
                    .unwrap();
                let mut out = String::new();
                s.read_to_string(&mut out).await.unwrap();
                answers.push(out);
            }
            answers
        });
        assert_eq!(super::callback(&listener).await.unwrap(), "code=c&state=s");
        let answers = browser.await.unwrap();
        assert!(answers[0].starts_with("HTTP/1.1 404"));
        assert!(answers[1].contains("You can close this tab"));
    }
}
