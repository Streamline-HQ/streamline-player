import type { TextId, Words } from "#lib/core/server-view.ts";
import { m as i18n } from "#lib/paraglide/messages.js";

const TEXT: Record<TextId, () => string> = {
	sec_overview: i18n.server_sec_overview,
	sec_streams: i18n.server_sec_streams,
	sec_devices: i18n.server_sec_devices,
	sec_transcoding: i18n.server_sec_transcoding,
	sec_library: i18n.server_sec_library,
	sec_logs: i18n.server_sec_logs,
	sec_overview_intro: i18n.server_sec_overview_intro,
	sec_streams_intro: i18n.server_sec_streams_intro,
	sec_devices_intro: i18n.server_sec_devices_intro,
	sec_transcoding_intro: i18n.server_sec_transcoding_intro,
	sec_library_intro: i18n.server_sec_library_intro,
	sec_logs_intro: i18n.server_sec_logs_intro,
	group_streaming: i18n.server_group_streaming,
	group_library: i18n.server_sec_library,
	group_system: i18n.server_group_system,
	cap_now: i18n.server_cap_now,
	cap_engine: i18n.server_cap_engine,
	blk_build: i18n.server_blk_build,
	blk_config: i18n.server_blk_config,
	blk_config_desc: i18n.server_blk_config_desc,
	blk_telemetry: i18n.server_blk_telemetry,
	blk_restart: i18n.server_blk_restart,
	blk_waiting: i18n.server_blk_waiting,
	blk_waiting_desc: i18n.server_blk_waiting_desc,
	blk_apps: i18n.server_blk_apps,
	blk_browsers: i18n.server_blk_browsers,
	blk_browsers_desc: i18n.server_blk_browsers_desc,
	blk_hw: i18n.server_blk_hw,
	blk_live: i18n.server_blk_live,
	blk_cache: i18n.server_blk_cache,
	blk_cache_desc: i18n.server_blk_cache_desc,
	blk_folders: i18n.server_blk_folders,
	blk_scanning: i18n.server_blk_scanning,
	blk_recent: i18n.server_blk_recent,
	blk_applog: i18n.server_blk_applog,
	blk_accesslog: i18n.server_blk_accesslog,
	blk_rotation: i18n.server_blk_rotation,
	act_restart_title: i18n.server_act_restart_title,
	act_restart_desc: i18n.server_act_restart_desc,
	act_restart: i18n.server_act_restart,
	act_cache_title: i18n.server_act_cache_title,
	act_clear: i18n.keyboard_clear,
	btn_restart_now: i18n.server_btn_restart_now,
	btn_scan_all: i18n.server_btn_scan_all,
	btn_scan: i18n.server_btn_scan,
	btn_scanning: i18n.server_btn_scanning,
	btn_download: i18n.server_btn_download,
	btn_revoke: i18n.server_btn_revoke,
	btn_end: i18n.server_btn_end,
	tile_streams: i18n.server_tile_streams,
	tile_pairing: i18n.server_tile_pairing,
	tile_storage: i18n.server_tile_storage,
	tile_health: i18n.server_tile_health,
	tile_url: i18n.server_tile_url,
	tile_data: i18n.server_tile_data,
	tile_db: i18n.server_tile_db,
	tile_cache: i18n.server_tile_cache,
	tile_nobody: i18n.server_tile_nobody,
	tile_no_requests: i18n.server_tile_no_requests,
	tile_https: i18n.server_tile_https,
	tile_http: i18n.server_tile_http,
	tile_same_disk: i18n.server_tile_same_disk,
	tile_empty: i18n.server_tile_empty,
	tile_ffmpeg_missing: i18n.server_tile_ffmpeg_missing,
	health_ok: i18n.server_health_ok,
	health_restart: i18n.server_health_restart,
	status_restarting: i18n.server_status_restarting,
	hw_software: i18n.server_hw_software,
	hw_status_desc: i18n.server_hw_status_desc,
	kv_version: i18n.server_kv_version,
	kv_go: i18n.server_kv_go,
	kv_platform: i18n.settings_platform,
	kv_commit: i18n.server_kv_commit,
	kv_built: i18n.server_kv_built,
	kv_running: i18n.server_kv_running,
	kv_bind: i18n.server_kv_bind,
	kv_proxies: i18n.server_kv_proxies,
	kv_secret: i18n.server_kv_secret,
	kv_sink: i18n.server_kv_sink,
	kv_status: i18n.server_kv_status,
	kv_ffmpeg: i18n.server_kv_ffmpeg,
	kv_location: i18n.server_kv_location,
	kv_last_scan: i18n.server_kv_last_scan,
	kv_writes: i18n.server_kv_writes,
	pill_off: i18n.common_off,
	pill_ready: i18n.server_pill_ready,
	pill_not_ready: i18n.server_pill_not_ready,
	pill_found: i18n.server_pill_found,
	pill_not_found: i18n.server_pill_not_found,
	pill_this_device: i18n.settings_this_device,
	pill_this_browser: i18n.settings_this_browser,
	note_nobody: i18n.server_note_nobody,
	note_no_apps: i18n.server_note_no_apps,
	note_no_browsers: i18n.server_note_no_browsers,
	note_cache_cleared: i18n.server_note_cache_cleared,
	mode_copy: i18n.server_mode_copy,
	mode_audio: i18n.server_mode_audio,
	mode_transcode: i18n.server_mode_transcode,
	net_home: i18n.server_net_home,
	net_remote: i18n.server_net_remote,
	sent_as_is: i18n.server_sent_as_is,
	video_as_is: i18n.server_video_as_is,
	kind_browser: i18n.server_kind_browser,
	kind_tablet: i18n.server_kind_tablet,
	kind_phone: i18n.server_kind_phone,
	kind_tv: i18n.server_kind_tv,
	kind_desktop: i18n.server_kind_desktop,
	aside_streaming: i18n.server_aside_streaming,
	ago_now: i18n.server_ago_now,
	ago_yesterday: i18n.activity_yesterday,
	vaapi: i18n.server_vaapi,
};

const LABELS: Record<string, () => string> = {
	"transcoding.hw_accel": i18n.server_set_hw_accel,
	"transcoding.hw_device": i18n.server_set_hw_device,
	"stream.tonemap": i18n.server_set_tonemap,
	"stream.max_live": i18n.server_set_max_live,
	"library.watch": i18n.server_set_watch,
	"library.scan_every": i18n.server_set_scan_every,
	"ffmpeg.enabled": i18n.server_set_ffprobe,
	"log.app.level": i18n.server_set_level,
	"log.app.format": i18n.server_set_format,
	"log.http.format": i18n.server_set_format,
	"log.rotate.max_size": i18n.server_set_rotate_size,
	"log.rotate.max_backups": i18n.server_set_rotate_keep,
	"log.rotate.compress": i18n.server_set_compress,
	"otel.endpoint": i18n.server_set_otlp,
	"events.retention": i18n.server_set_retention,
};

const DESCS: Record<string, () => string> = {
	"transcoding.hw_accel": i18n.server_desc_hw_accel,
	"transcoding.hw_device": i18n.server_desc_hw_device,
	"stream.tonemap": i18n.server_desc_tonemap,
	"stream.max_live": i18n.server_desc_max_live,
	"library.watch": i18n.server_desc_watch,
	"ffmpeg.enabled": i18n.server_desc_ffprobe,
	"otel.endpoint": i18n.server_desc_otlp,
	"events.retention": i18n.server_desc_retention,
};

const CHOICES: Record<string, () => string> = {
	auto: i18n.value_auto,
	none: i18n.common_off,
	vaapi: i18n.server_vaapi,
	"1h": i18n.server_choice_1h,
	"6h": i18n.server_choice_6h,
	"24h": i18n.server_choice_24h,
	debug: i18n.server_choice_debug,
	info: i18n.server_choice_info,
	warn: i18n.server_choice_warn,
	error: i18n.server_choice_error,
	text: i18n.server_choice_text,
	json: i18n.server_choice_json,
	combined: i18n.server_choice_combined,
};

const SIZES = {
	B: i18n.server_size_b,
	KB: i18n.server_size_kb,
	MB: i18n.library_size_mb,
	GB: i18n.library_size_gb,
	TB: i18n.server_size_tb,
};

const one = (n: number) => n === 1;

export const serverWords = (): Words => ({
	t: (id) => TEXT[id](),
	label: (key) => LABELS[key]?.() ?? key,
	desc: (key) => DESCS[key]?.(),
	choice: (_key, value) => CHOICES[value]?.() ?? value,
	size: (n, unit) => SIZES[unit]({ n }),
	streamCount: (count) =>
		one(count)
			? i18n.server_stream_count_one({ count })
			: i18n.server_stream_count_other({ count }),
	appsDesc: (count) =>
		one(count) ? i18n.server_apps_desc_one({ count }) : i18n.server_apps_desc_other({ count }),
	changeCount: (count) =>
		one(count)
			? i18n.server_changes_waiting_one({ count })
			: i18n.server_changes_waiting_other({ count }),
	changesWaiting: (count) =>
		one(count)
			? i18n.server_changes_waiting_one({ count })
			: i18n.server_changes_waiting_other({ count }),
	restartNote: (count, keys) =>
		one(count)
			? i18n.server_restart_note_one({ count, keys })
			: i18n.server_restart_note_other({ count, keys }),
	streamSummary: (count, mbps) => i18n.server_stream_summary({ count, mbps }),
	mbps: (n) => i18n.server_mbps({ n }),
	you: (name) => i18n.server_you({ name }),
	cannotDecode: (kind, codec) => i18n.server_cannot_decode({ kind, codec }),
	realtime: (speed) => i18n.player_stat_realtime({ speed }),
	runtime: (min) =>
		min >= 60
			? i18n.common_runtime_hm({ h: Math.floor(min / 60), m: min % 60 })
			: i18n.common_runtime_m({ m: min }),
	healthSub: (ffmpeg, software) =>
		software ? i18n.server_health_sub_soft({ ffmpeg }) : i18n.server_health_sub_hw({ ffmpeg }),
	freeOf: (free, total) => i18n.server_free_of({ free, total }),
	cacheUsed: (size, count) =>
		one(count)
			? i18n.server_cache_used_one({ size, count })
			: i18n.server_cache_used_other({ size, count }),
	uptime: (n, unit) => (unit === "h" ? i18n.server_uptime_h({ n }) : i18n.server_uptime_d({ n })),
	minutesAgo: (n) => i18n.server_minutes_ago({ n }),
	hoursAgo: (n) => i18n.server_hours_ago({ n }),
	daysAgo: (n) => i18n.server_days_ago({ n }),
	expiresIn: (count) =>
		one(count) ? i18n.server_expires_one({ count }) : i18n.server_expires_other({ count }),
	folderCount: (kind, count) =>
		kind === "movies"
			? one(count)
				? i18n.person_movies_one({ count })
				: i18n.person_movies_other({ count })
			: one(count)
				? i18n.server_shows_one({ count })
				: i18n.server_shows_other({ count }),
	scanProgress: (pct, left) => i18n.server_scan_progress({ pct, left }),
	lastScan: (when, added, replaced, errors) =>
		i18n.server_last_scan({
			when,
			added: one(added)
				? i18n.server_new_files_one({ count: added })
				: i18n.server_new_files_other({ count: added }),
			replaced: i18n.server_replaced({ count: replaced }),
			errors: one(errors)
				? i18n.activity_errors_one({ count: errors })
				: i18n.activity_errors_other({ count: errors }),
		}),
});
