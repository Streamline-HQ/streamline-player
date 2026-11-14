import type { Words } from "#lib/core/downloads-view.ts";
import { runtime } from "#lib/core/format.ts";
import {
	audioName,
	clock,
	languageLabel,
	originalName,
	subInfo,
	subName,
} from "#lib/core/playback/names.ts";
import { m as i18n } from "#lib/paraglide/messages.js";

export const downloadWords = (): Words => ({
	language: languageLabel,
	quality: (q) => (q === "original" ? i18n.dl_quality_original() : q),
	runtime,
	clock,
	audioName,
	subName,
	subKind: (t) => subInfo(t).label,
	videoName: (v) => originalName(v),
	summary: (ready, progress) => i18n.dl_summary({ ready, progress }),
	movies: i18n.nav_movies(),
	episodes: (n) =>
		n === 1 ? i18n.activity_episodes_one() : i18n.activity_episodes_other({ count: n }),
	season: (n, episodes, size) => i18n.dl_season({ n, episodes, size }),
	starting: i18n.dl_starting(),
	preparing: (pct) => i18n.dl_preparing({ pct }),
	queued: (n) => i18n.dl_queued({ n }),
	waiting: i18n.dl_waiting(),
	queuedShort: i18n.dl_queued_short(),
	cause: (code) =>
		({
			prepare_failed: i18n.dl_cause_prepare_failed(),
			no_space: i18n.dl_cause_no_space(),
			gone: i18n.dl_cause_gone(),
		})[code],
	kept: (size) => i18n.dl_kept({ size }),
	perSecond: (speed, eta) => i18n.dl_per_second({ speed, eta }),
	seconds: (value) => i18n.player_unit_seconds({ value }),
	minutes: (n) => i18n.dl_minutes({ n }),
	hoursMinutes: (h, m) => i18n.dl_hours_minutes({ h, m }),
	watched: i18n.dl_watched(),
	tracks: (audio, subs) => i18n.dl_tracks({ audio, subs }),
	none: i18n.dl_none(),
	finishedOffline: i18n.dl_finished_offline(),
	watchedTo: (time) => i18n.dl_watched_to({ time }),
	meterUsed: (size) => i18n.dl_meter_used({ size }),
	meterOther: (size) => i18n.dl_meter_other({ size }),
	meterFree: (size) => i18n.dl_meter_free({ size }),
	download: (label) => i18n.dl_download({ label }),
	downloadShort: i18n.dl_download_short(),
	removeDownload: (label) => i18n.dl_remove_download_of({ label }),
	onDevice: i18n.dl_on_device_short(),
	cancelDownload: (label) => i18n.dl_cancel_download_of({ label }),
	seasonOnDevice: i18n.dl_season_on_device(),
	seriesOnDevice: i18n.dl_series_on_device(),
	downloadSeason: i18n.dl_download_season(),
	downloadSeries: i18n.dl_download_series(),
	downloadMore: (n) => i18n.dl_download_more({ n }),
	downloadingName: (name, pct) => i18n.dl_downloading_name({ name, pct }),
	removeFromDevice: (name) => i18n.dl_remove_from_device({ name }),
	downloadNameEpisodes: (name, count) =>
		count === 1
			? i18n.dl_download_name_episode({ name })
			: i18n.dl_download_name_episodes({ name, count }),
	pickTitle: (label) => i18n.dl_pick_title({ label }),
	noteOriginal: (video) => i18n.dl_note_original({ video }),
	noteConverted: (quality, many) =>
		many ? i18n.dl_note_converted_many({ quality }) : i18n.dl_note_converted_one({ quality }),
	originalSuffix: i18n.dl_original_suffix(),
	cantShow: i18n.dl_cant_show(),
});
