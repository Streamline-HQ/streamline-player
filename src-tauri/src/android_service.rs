//! Keeps the Android foreground service in step with the download queue, so transfers go on and
//! show a notification while the app is in the background. Kotlin only shows what it is told;
//! the queue stays in Rust.

use crate::downloads::{Snapshot, State};
use std::collections::HashSet;

#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct ServiceState {
    pub active: bool,
    pub count: usize,
    pub done: usize,
    pub title: String,
    pub percent: i64,
}

/// The items seen working since the queue was last idle, so a notification can say "2 of 5".
#[derive(Default)]
pub struct Batch {
    seen: HashSet<String>,
    finished: HashSet<String>,
}

fn working(state: State) -> bool {
    matches!(
        state,
        State::Queued | State::Preparing | State::Downloading | State::Waiting
    )
}

pub fn summarize(snapshot: &Snapshot, batch: &mut Batch) -> ServiceState {
    let items = &snapshot.items;
    let active = items.iter().any(|i| working(i.state));
    if !active {
        *batch = Batch::default();
        return ServiceState::default();
    }
    for item in items {
        if working(item.state) {
            batch.seen.insert(item.key.clone());
        } else if item.state == State::Done && batch.seen.contains(&item.key) {
            batch.finished.insert(item.key.clone());
        }
    }
    let current = items
        .iter()
        .find(|i| i.state == State::Downloading)
        .or_else(|| items.iter().find(|i| working(i.state)));
    let (title, percent) = current.map_or((String::new(), -1), |i| {
        let percent = if i.state == State::Downloading && i.size > 0 {
            (i.bytes.saturating_mul(100) / i.size).min(100) as i64
        } else {
            -1
        };
        (i.meta.title.clone(), percent)
    });
    ServiceState {
        active,
        count: batch.seen.len(),
        done: batch.finished.len(),
        title,
        percent,
    }
}

#[cfg(target_os = "android")]
pub use pump::{ServicePump, metered};

#[cfg(target_os = "android")]
mod pump {
    use super::{Batch, ServiceState, summarize};
    use crate::downloads::Snapshot;
    use serde_json::{Value, json};
    use std::{
        sync::Mutex,
        time::{Duration, Instant},
    };
    use tauri::{AppHandle, Manager};
    use tokio::sync::watch;

    const MIN_GAP: Duration = Duration::from_secs(1);

    pub struct ServicePump {
        state: watch::Sender<ServiceState>,
        batch: Mutex<Batch>,
    }

    impl ServicePump {
        pub fn new(app: AppHandle) -> ServicePump {
            let (state, mut changes) = watch::channel(ServiceState::default());
            tauri::async_runtime::spawn(async move {
                let mut was_active = false;
                while changes.changed().await.is_ok() {
                    let state = changes.borrow_and_update().clone();
                    let flipped = state.active != was_active;
                    was_active = state.active;
                    let app = app.clone();
                    let sent = tauri::async_runtime::spawn_blocking(move || call(&app, &state));
                    if let Ok(Err(e)) = sent.await {
                        eprintln!("downloads: the service did not take the update: {e}");
                    }
                    if !flipped {
                        tokio::time::sleep(MIN_GAP).await;
                    }
                }
            });
            ServicePump {
                state,
                batch: Mutex::default(),
            }
        }

        pub fn push(&self, snapshot: &Snapshot) {
            let next = summarize(snapshot, &mut self.batch.lock().unwrap());
            self.state.send_if_modified(|state| {
                let changed = *state != next;
                if changed {
                    *state = next;
                }
                changed
            });
        }
    }

    /// Whether the connection in use is billed by volume, asked of Android at most every 2 s.
    // ponytail: a blocking plugin call on a runtime thread; a network callback pushing the state
    // into an atomic if it ever shows in a profile.
    pub fn metered(app: &AppHandle) -> bool {
        static LAST: Mutex<Option<(Instant, bool)>> = Mutex::new(None);
        let mut last = LAST.lock().unwrap();
        if let Some((at, value)) = *last
            && at.elapsed() < Duration::from_secs(2)
        {
            return value;
        }
        let value = app
            .state::<tauri_plugin_player::Android<tauri::DynRuntime>>()
            .0
            .run_mobile_plugin::<Value>("metered", json!({}))
            .ok()
            .and_then(|v| v["metered"].as_bool())
            .unwrap_or(false);
        *last = Some((Instant::now(), value));
        value
    }

    fn call(app: &AppHandle, state: &ServiceState) -> Result<Value, String> {
        app.state::<tauri_plugin_player::Android<tauri::DynRuntime>>()
            .0
            .run_mobile_plugin::<Value>(
                "downloadsService",
                json!({
                    "active": state.active,
                    "count": state.count,
                    "done": state.done,
                    "title": state.title,
                    "percent": state.percent,
                }),
            )
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::downloads::{DownloadEntry, Kind, Meta, Quality};

    fn item(key: &str, state: State, bytes: u64, size: u64) -> DownloadEntry {
        DownloadEntry {
            key: key.into(),
            media_id: key.into(),
            quality: Quality::Original,
            audio: vec![],
            subtitles: vec![],
            state,
            progress: 0.0,
            bytes,
            size,
            error: None,
            added_at: String::new(),
            meta: Meta {
                kind: Kind::Movies,
                title_id: 1,
                title: format!("title {key}"),
                year: None,
                runtime: 0,
                season: None,
                episode: None,
                episode_title: None,
                poster: String::new(),
                still: String::new(),
            },
            watched: false,
            offline: None,
        }
    }

    fn snap(items: Vec<DownloadEntry>) -> Snapshot {
        Snapshot { items, rate: 0.0 }
    }

    #[test]
    fn idle_is_inactive() {
        let s = summarize(
            &snap(vec![item("a", State::Done, 1, 1)]),
            &mut Batch::default(),
        );
        assert_eq!(s, ServiceState::default());
    }

    #[test]
    fn downloading_item_gives_title_and_percent() {
        let s = summarize(
            &snap(vec![item("a", State::Downloading, 25, 100)]),
            &mut Batch::default(),
        );
        assert!(s.active);
        assert_eq!(
            (s.title.as_str(), s.percent, s.count, s.done),
            ("title a", 25, 1, 0)
        );
    }

    #[test]
    fn batch_counts_across_items() {
        let mut b = Batch::default();
        summarize(
            &snap(vec![
                item("a", State::Downloading, 0, 10),
                item("b", State::Queued, 0, 10),
                item("c", State::Queued, 0, 10),
            ]),
            &mut b,
        );
        let s = summarize(
            &snap(vec![
                item("a", State::Done, 10, 10),
                item("b", State::Downloading, 5, 10),
                item("c", State::Queued, 0, 10),
            ]),
            &mut b,
        );
        assert_eq!(
            (s.count, s.done, s.title.as_str(), s.percent),
            (3, 1, "title b", 50)
        );
    }

    #[test]
    fn preparing_is_indeterminate() {
        let s = summarize(
            &snap(vec![item("a", State::Preparing, 0, 100)]),
            &mut Batch::default(),
        );
        assert!(s.active);
        assert_eq!(s.percent, -1);
    }

    #[test]
    fn only_failed_is_inactive_and_resets() {
        let mut b = Batch::default();
        summarize(&snap(vec![item("a", State::Downloading, 1, 10)]), &mut b);
        let s = summarize(&snap(vec![item("a", State::Failed, 1, 10)]), &mut b);
        assert!(!s.active);
        let s = summarize(&snap(vec![item("b", State::Queued, 0, 10)]), &mut b);
        assert_eq!((s.count, s.done), (1, 0));
    }
}
