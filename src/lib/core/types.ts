export type Kind = "movies" | "series";
export type FileSummary = {
	resolution?: string;
	codec?: string;
	hdr?: string;
	audio?: string;
	channels?: string;
	/** Bytes on disk; a show's is the sum of its episode files. */
	size?: number;
};
export type Episode = {
	id: number;
	number: number;
	title: string;
	overview: string;
	runtime: number;
	has_file: boolean;
	media_file_id: string;
};
export type Season = { number: number; name: string; episodes: Episode[] };
export type Title = {
	id: number;
	title: string;
	year: number;
	overview: string;
	genres: string[];
	rating: number;
	added_at: string;
	file_summary?: FileSummary;
	runtime?: number;
	/** Age rating as printed on the box: "PG-13", "R", "12". */
	certification?: string;
	media_files?: { id: string }[];
	network?: string;
	total_seasons?: number;
	first_aired?: string;
	seasons?: Season[];
	/** Principal cast in billing order; on a series, `seasons` says which seasons each appears in. */
	cast?: CastMember[];
};
export type CastMember = { id: string; name: string; character: string; seasons?: number[] };
export type Credit = {
	kind: Kind;
	id: number;
	title: string;
	year: number;
	character: string;
	seasons?: number[];
	total_seasons?: number;
};
export type Person = {
	id: string;
	name: string;
	department: string;
	credits: Credit[];
	known_for: { title: string; year: number; kind?: Kind; id?: number }[];
};
export type Watch = {
	media_id: string;
	movie_id?: number;
	series_id?: number;
	season?: number;
	episode_id?: number;
	position_seconds: number;
	duration_seconds: number;
	watched: boolean;
};

export type Reason = { code: string; text: string };
export type Mode = "direct" | "remux" | "audio_transcode" | "transcode";
export type VideoOut = {
	action: string;
	codec: string;
	width: number;
	height: number;
	hdr: string;
	dv_profile?: number;
};
export type AudioOut = { action: string; codec: string; channels: number };
export type Decision =
	| {
			mode: Mode;
			video: VideoOut;
			audio: AudioOut;
			video_reasons: Reason[];
			audio_reasons: Reason[];
			needs_slot: boolean;
			bandwidth: number;
			error?: undefined;
	  }
	| { error: { code: string; message: string } };
export type DecisionOption = {
	audio_index?: number | null;
	burn_in_subtitle?: number | null;
	max_bitrate?: number | null;
};

export type Me = {
	name: string;
	email: string;
	role: string;
	library_language?: string;
	picture: boolean;
	initials: string;
};
export type Featured = {
	kind: Kind;
	id: number;
	reason: "continue" | "new_episodes" | "added";
	season?: number;
	episodes?: number[];
};
/** `season` and `episodes` are set when episodes arrived, absent when the whole title did. */
export type Arrival = { kind: Kind; id: number; at: string; season?: number; episodes?: number[] };
export type ArrivalDay = { date: string; items: Arrival[] };
export type HomeFeed = { featured: Featured[]; arrivals: ArrivalDay[] };
export type Device = {
	id: string;
	name: string;
	platform: string;
	last_seen: string;
	streaming: boolean;
	current: boolean;
};
export type ActivityKind =
	| "episodes"
	| "season"
	| "movie"
	| "upgrade"
	| "download"
	| "device"
	| "server"
	| "scan";
export type ActivityEvent = {
	id: string;
	kind: ActivityKind;
	/** ISO 8601, UTC. */
	at: string;
	read: boolean;
	title?: { kind: Kind; id: number };
	season?: number;
	/** The numbers added; a download's is the one episode. */
	episodes?: number[];
	episode_count?: number;
	file?: FileSummary;
	previous?: FileSummary;
	device?: { name: string; platform: string; location?: string };
	server?: { version: string; restart_seconds?: number };
	scan?: { added: number; upgraded: number; errors: number };
};
export type DeviceInfo = {
	name: string;
	model: string;
	platform: string;
	player: string;
	display: { name: string; width: number; height: number; refresh_hz: number; hdr: string[] };
};
export type Pairing = {
	code: string;
	name: string;
	uri: string;
	uri_complete: string;
	expires_in: number;
	interval: number;
	qr: string;
};
export type PairRequest = {
	user_code: string;
	name: string;
	platform: string;
	requested_at: string;
	ip: string;
};
export type AuthMethods = {
	sso: { id: string; label: string }[];
	email: boolean;
	register_url: string | null;
};
export type AuthState = {
	paired: boolean;
	server: string | null;
	keystore: string;
	store_error: string | null;
};

export type SettingValue = string | number | boolean;
export type SettingOwner = "streamline" | "engine";
export type AdminSettings = {
	values: Record<string, SettingValue>;
	owners: Record<string, SettingOwner>;
	read_only: { streamline: boolean; engine: boolean };
	/** Saved, applied after a restart. */
	pending: string[];
	restart_keys: string[];
};
/** Sizes are bytes. */
export type AdminOverview = {
	server: {
		version: string;
		go: string;
		platform: string;
		commit: string;
		built_at: string;
		started_at: string;
		config_path: string;
		public_url: string;
		https: boolean;
		bind_address: string;
		trusted_proxies: string[];
		session_secret: string;
	};
	storage: {
		media: { free: number; total: number };
		data: { path: string; free: number; total: number };
		database: { path: string; size: number };
		cache: { path: string; size: number; streams: number };
	};
	health: {
		ffmpeg: { path: string; version: string } | null;
		hw: { mode: "vaapi" | "software"; device?: string; ready: boolean };
		folders: { reachable: number; total: number };
		errors_today: number;
		errors_source?: string;
	};
	logs: { app_path: string; http_path: string };
};
export type AdminStream = {
	id: string;
	user: { name: string; you: boolean };
	title: { kind: Kind; id: number };
	season?: number;
	episode?: number;
	device: { name: string; kind: "browser" | "tablet" | "phone" | "tv" | "desktop" };
	network: "home" | "remote";
	/** Seconds. */
	position: number;
	duration: number;
	playing: boolean;
	mode: "copy" | "audio" | "transcode";
	video?: string;
	audio?: string;
	from?: string;
	to?: string;
	hw?: string;
	/** Times realtime. */
	speed?: number;
	cannot_decode?: string;
	/** Bits per second. */
	bitrate: number;
};
export type AdminPairing = {
	user_code: string;
	name: string;
	platform: string;
	created_at: string;
	expires_at: string;
};
export type AdminDevice = Device & {
	kind: "app" | "browser";
	user: { name: string };
	key_store?: string;
	location?: string;
	expires_at?: string;
};
export type AdminLibrary = {
	folders: {
		id: string;
		name: string;
		path: string;
		kind: Kind;
		count: number;
		size: number;
		scan?: { progress: number; eta_seconds: number };
	}[];
	last_scan?: { at: string; added: number; replaced: number; errors: number };
};
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogLine = {
	id: number;
	at: string;
	level: LogLevel;
	source: string;
	message: string;
};
