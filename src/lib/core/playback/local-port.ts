import type { PlaybackPort, Session, Tracks } from "#lib/core/playback/port.ts";
import type { Decision, DecisionOption } from "#lib/core/types.ts";

/** Streamline marks a title watched from about here; a download's note follows the same rule. */
const WATCHED_AT = 0.9;

export type LocalFile = {
	key: string;
	url: string;
	tracks: Tracks;
	position: number;
	duration: number;
	/** The file's size in bytes, for the bit rate the panels show. */
	size?: number;
};

/**
 * The controller's server calls, answered from a downloaded file. The player's own commands and
 * the text of a subtitle still go through `base`, because mpv and the Rust side do not care where
 * the file came from.
 */
export function localPort(
	base: PlaybackPort,
	local: LocalFile,
	note: (key: string, position: number, done: boolean) => Promise<unknown>,
): PlaybackPort {
	const { tracks } = local;
	const bitRate = local.size && local.duration > 0 ? (local.size * 8) / local.duration : 0;
	const video = {
		action: "copy",
		codec: tracks.video?.codec ?? "",
		width: tracks.video?.width ?? 0,
		height: tracks.video?.height ?? 0,
		hdr: tracks.video?.hdr ?? "sdr",
	};
	const first = tracks.audio[0];
	const audio = { action: "copy", codec: first?.codec ?? "", channels: first?.channels ?? 2 };
	const session: Session = {
		session_id: `local-${local.key}`,
		mode: "direct",
		url: local.url,
		bandwidth: bitRate,
		video,
		audio,
		video_reasons: [],
		audio_reasons: [],
		hw: "",
	};
	const decision: Decision = {
		mode: "direct",
		video,
		audio,
		video_reasons: [],
		audio_reasons: [],
		needs_slot: false,
		bandwidth: bitRate,
	};
	return {
		playerName: base.playerName,
		drawsStyled: base.drawsStyled,
		command: (cmd, args) => base.command(cmd, args),
		on: (event, cb) => base.on(event, cb),
		capabilities: () => base.capabilities(),
		mediaText: (url) => base.mediaText(url),
		decisions: async (_mediaId: string, options: DecisionOption[]) => ({
			bit_rate: bitRate,
			decisions: options.map(() => decision),
		}),
		startSession: async () => session,
		patchSession: async () => session,
		sessionInfo: async () => ({ speed: null }),
		stopSession: async () => {},
		mediaTracks: async () => tracks,
		network: async () => "home",
		serverHost: async () => "",
		heartbeat: (_id, position) =>
			note(local.key, position, local.duration > 0 && position / local.duration >= WATCHED_AT),
	};
}
