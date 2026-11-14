import type { PlaybackPort, Session, Tracks } from "#lib/core/playback/port.ts";
import { reportUnreachable } from "#lib/core/online.svelte.ts";
import { decodeHere } from "#lib/core/prefs.svelte.ts";
import type {
	AuthMethods,
	AuthState,
	Decision,
	DecisionOption,
	ActivityEvent,
	AdminDevice,
	AdminLibrary,
	AdminOverview,
	AdminPairing,
	AdminSettings,
	AdminStream,
	Device,
	DeviceInfo,
	DownloadEntry,
	DownloadRequest,
	DownloadStorage,
	DownloadsEvent,
	HomeFeed,
	Kind,
	LogLine,
	Me,
	Pairing,
	PairRequest,
	Person,
	SettingValue,
	Title,
	Watch,
} from "#lib/core/types.ts";
import { addPluginListener, convertFileSrc, invoke as rawInvoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Rust gives a server's error as JSON and anything else when the request never got an answer. */
const noAnswer = (e: unknown) => {
	if (typeof e !== "string") return false;
	try {
		JSON.parse(e);
		return false;
	} catch {
		return true;
	}
};

const invoke = <T = unknown>(...args: Parameters<typeof rawInvoke>): Promise<T> =>
	rawInvoke<T>(...args).catch((e) => {
		const [cmd] = args;
		if (cmd !== "reachable" && !cmd.startsWith("plugin:") && noAnswer(e)) reportUnreachable();
		throw e;
	});

const webOnly = () => Promise.reject(new Error("not on this target"));

export const init = () => Promise.resolve();
export const authMethods = (): Promise<AuthMethods> => webOnly();
export const startSso = (_provider: string, _next: string): Promise<void> => webOnly();
export const finishSso = (_query: URLSearchParams): Promise<string> => webOnly();
export const signInEmail = (_email: string, _password: string): Promise<void> => webOnly();

export const windowControls = {
	minimize: () => getCurrentWindow().minimize(),
	toggleMaximize: () => getCurrentWindow().toggleMaximize(),
	close: () => getCurrentWindow().close(),
};

export const setFullscreen = (on: boolean): Promise<unknown> =>
	getCurrentWindow().setFullscreen(on);
export const isFullscreen = (): Promise<boolean> => getCurrentWindow().isFullscreen();

let capabilities: { decode: string; value: Promise<unknown> } | null = null;
// ponytail: mpv is the only desktop backend so far (Linux); macOS and Windows will need their own name.
export const PLAYER_NAME: string = /Android/.test(navigator.userAgent) ? "ExoPlayer" : "mpv";
/** What this device plays, as the server needs it; it changes with the pass-through settings. */
export function playerCapabilities() {
	const decode = decodeHere();
	if (capabilities?.decode !== decode.join())
		capabilities = {
			decode: decode.join(),
			value: invoke("plugin:player|capabilities", { decode }),
		};
	return capabilities.value;
}

/** What the engine would do for each option, without starting anything. */
export const decisions = async (mediaId: string, options: DecisionOption[]) =>
	invoke<{ bit_rate: number; decisions: Decision[] }>("decisions", {
		mediaId,
		capabilities: await playerCapabilities(),
		options,
	});

/** Where Streamline places this device right now; anything but a clear "home" is away. */
export const network = () =>
	playbackStatus()
		.then((st) => (st.network === "home" ? "home" : "away") as "home" | "away")
		.catch(() => "away" as const);

const listOf = <T>(page: { items: T[] }) => page.items;

export const library = (kind: Kind) => invoke<{ items: Title[] }>("library", { kind }).then(listOf);
export const title = (kind: Kind, id: number) => invoke<Title>("title", { kind, id });
export const person = (id: string) => invoke<Person>("person", { id });
export const watchState = () => invoke<{ items: Watch[] }>("watch_state").then(listOf);
export const setWatched = (mediaId: string, watched: boolean) =>
	invoke("set_watched", { mediaId, watched });

// `convertFileSrc` would percent-encode the slashes of a whole path.
const ARTWORK = convertFileSrc("", "artwork");
export const artwork = (kind: Kind, id: number, name: "poster" | "backdrop") =>
	`${ARTWORK}${kind}/${id}/${name}.jpg`;
/** A picture by the path a download saved it under, as the `artwork` scheme takes it. */
export const artworkAt = (path: string) => `${ARTWORK}${path.replace(/^\//, "")}`;
export const myPicture = (version: number) => `${ARTWORK}users/me/photo.jpg?v=${version}`;
export const headshot = (person: string) => `${ARTWORK}people/${person}/photo.jpg`;

/** Movies and shows together; ids are only unique within a kind. */
export const everything = async () => {
	const [movies, shows] = await Promise.all([library("movies"), library("series")]);
	return [
		...movies.map((t) => ({ ...t, kind: "movies" as Kind })),
		...shows.map((t) => ({ ...t, kind: "series" as Kind })),
	];
};

export const authState = () => invoke<AuthState>("auth_state");
export const connect = (url: string) => invoke("connect", { url });
export const pairStart = () => invoke<Pairing>("pair_start");
export const pairPoll = () => invoke<string>("pair_poll");
export const signOut = () => invoke("sign_out");
const notOnNative = () => Promise.reject(new Error("not_on_native"));
export const pairRequest = (_code: string): Promise<PairRequest> => notOnNative();
export const approvePairing = (_code: string): Promise<unknown> => notOnNative();
export const denyPairing = (_code: string): Promise<unknown> => notOnNative();
export const openExternal = (url: string) => invoke("open_external", { url });
export const me = () => invoke<Me>("me");
export const home = () => invoke<HomeFeed>("home");
export const updateMe = (patch: { name?: string; email?: string }) =>
	invoke<Me>("update_me", patch);
export const setPicture = async (file: Blob) =>
	invoke<void>("set_picture", new Uint8Array(await file.arrayBuffer()), {
		headers: { "x-picture-type": file.type },
	});
export const removePicture = () => invoke<void>("remove_picture");
export const revokeDevice = (id: string) => invoke<void>("revoke_device", { id });
export const devices = () => invoke<{ items: Device[] }>("devices").then(listOf);
export const activity = () => invoke<{ items: ActivityEvent[] }>("activity").then(listOf);
export const markActivityRead = (ids: string[]) => invoke<void>("activity_read", { ids });
export const adminOverview = () => invoke<AdminOverview>("admin_overview");
export const adminSettings = () => invoke<AdminSettings>("admin_settings");
export const saveAdminSettings = (patch: Record<string, SettingValue>) =>
	invoke<AdminSettings>("save_admin_settings", { patch });
export const adminRestart = (message?: string) => invoke<void>("admin_restart", { message });
export const adminStreams = () => invoke<{ items: AdminStream[] }>("admin_streams").then(listOf);
export const stopStream = (id: string, message?: string) =>
	invoke<void>("stop_stream", { id, message });
export const adminPairings = () => invoke<{ items: AdminPairing[] }>("admin_pairings").then(listOf);
export const adminDevices = () => invoke<{ items: AdminDevice[] }>("admin_devices").then(listOf);
export const adminResolvePairing = (code: string, approve: boolean) =>
	invoke<void>("admin_resolve_pairing", { code, approve });
export const adminRevokeDevice = (id: string) => invoke<void>("admin_revoke_device", { id });
export const adminLibrary = () => invoke<AdminLibrary>("admin_library");
export const adminScan = (folderId?: string) => invoke<void>("admin_scan", { folderId });
export const adminClearCache = () => invoke<{ freed: number }>("admin_clear_cache");
export const adminLogs = (level: "all" | "warn" | "error", after?: number) =>
	invoke<{ items: LogLine[] }>("admin_logs", { level, after }).then(listOf);
/** Saves the log archive in the Downloads folder and resolves to the file's name. */
export const adminLogsDownload = () => invoke<string>("admin_logs_download");
export const playbackStatus = () => invoke<{ network?: string }>("playback_status");
export const serverHost = () => invoke<string>("server_host");
export const deviceInfo = () => invoke<DeviceInfo>("plugin:player|deviceInfo");

/** Rust drops a revoked key on the first 401 and says so with this event. */
export const onSignedOut = (cb: () => void): Promise<() => void> => listen("signed-out", cb);

/** What the TV's microphone heard, in `language`; empty text when nothing was recognized. */
export const voice = (language: string) =>
	invoke<{ text: string }>("plugin:player|voice", { language });

export const onPlayer = <T = undefined>(event: string, cb: (e: T) => void) =>
	addPluginListener<T>("player", event, cb).then((h) => () => h.unregister());

/** Only the desktop app downloads; Android and iOS builds have no queue behind these calls. */
export const canDownload: boolean = !/Android|iPhone|iPad/.test(navigator.userAgent);
export const downloads = () => invoke<DownloadEntry[]>("list_downloads");
export const onDownloads = (cb: (e: DownloadsEvent) => void): Promise<() => void> =>
	listen<DownloadsEvent>("downloads", (e) => cb(e.payload));
export const startDownloads = (items: DownloadRequest[], capabilities: unknown) =>
	invoke("start_downloads", { items, capabilities });
export const removeDownloads = (keys: string[]) => invoke("remove_downloads", { keys });
export const retryDownload = (key: string) => invoke("retry_download", { key });
export const downloadStorage = () => invoke<DownloadStorage>("download_storage");
export const localPlayback = (key: string) =>
	invoke<{ url: string; tracks: Tracks; position: number } | null>("local_playback", { key });
export const noteOffline = (key: string, position: number, done: boolean) =>
	invoke("note_offline", { key, position, done });
export const syncOffline = () => invoke<number>("sync_offline");
export const reachable = () => invoke<boolean>("reachable");

export const playbackPort: PlaybackPort = {
	playerName: PLAYER_NAME,
	command: (cmd, args) => invoke(`plugin:player|${cmd}`, args),
	on: onPlayer,
	capabilities: playerCapabilities,
	decisions,
	network,
	serverHost,
	startSession: (mediaId, capabilities, position, tracks) =>
		invoke<Session>("start_session", { mediaId, capabilities, position, tracks }),
	patchSession: (id, changes) => invoke<Session>("patch_session", { id, changes }),
	sessionInfo: (id) => invoke<{ speed: number | null }>("session_info", { id }),
	stopSession: (id) => invoke("stop_session", { id }),
	heartbeat: (id, position, paused) => invoke("heartbeat", { id, position, paused }),
	mediaTracks: (mediaId) => invoke<Tracks>("media_tracks", { mediaId }),
	mediaText: (url) => invoke<string>("media_text", { url }),
};
