// Paste into the TV's web inspector console (webOS: `pnpm exec ares-inspect -d <tv> -a
// com.datahearth.streamline-player`; Tizen: Tizen Studio's Web Inspector) with the app open, then
// copy the printed JSON back. It answers the same codec strings as browser-caps.ts, from the two
// APIs that disagree on TVs: MediaSource.isTypeSupported, and mediaCapabilities.decodingInfo,
// which Shaka turns off on webOS, Tizen and Hisense as unreliable.
(async () => {
	const mp4 = (c) => `video/mp4; codecs="${c}"`;
	const video = {
		"h264 high 5.1": mp4("avc1.640033"),
		"h264 high 10 5.1": mp4("avc1.6E0033"),
		"hevc main 5.1": mp4("hvc1.1.6.L153.B0"),
		"hevc main 10 5.1": mp4("hvc1.2.4.L153.B0"),
		"hevc main 10 5.1 (hev1)": mp4("hev1.2.4.L153.B0"),
		"av1 main 10 5.1": mp4("av01.0.13M.10"),
		"vp9 profile 2": 'video/webm; codecs="vp09.02.51.10"',
		"dolby vision p5": mp4("dvh1.05.06"),
		"dolby vision p8": mp4("dvh1.08.06"),
	};
	const audio = {
		aac: 'audio/mp4; codecs="mp4a.40.2"',
		ac3: 'audio/mp4; codecs="ac-3"',
		eac3: 'audio/mp4; codecs="ec-3"',
		"eac3 joc (atmos)": 'audio/mp4; codecs="ec-3"; spatialRendering=true',
		dts: 'audio/mp4; codecs="dtsc"',
		truehd: 'audio/mp4; codecs="mlpa"',
		opus: 'audio/mp4; codecs="opus"',
		flac: 'audio/mp4; codecs="flac"',
	};
	const sizes = [
		[1920, 1080, 24],
		[3840, 2160, 24],
		[3840, 2160, 60],
	];
	const mse = (t) => (typeof MediaSource === "undefined" ? null : MediaSource.isTypeSupported(t));
	const info = async (config) => {
		if (!navigator.mediaCapabilities) return "no mediaCapabilities";
		try {
			const r = await navigator.mediaCapabilities.decodingInfo({ type: "media-source", ...config });
			return [r.supported, r.smooth, r.powerEfficient].map(Number).join("");
		} catch (e) {
			return `throws ${e.name}`;
		}
	};
	const out = { userAgent: navigator.userAgent, video: {}, audio: {} };
	for (const [name, type] of Object.entries(video)) {
		const row = { mse: mse(type) };
		for (const [width, height, framerate] of sizes)
			row[`${height}p${framerate} sup/smooth/eff`] = await info({
				video: { contentType: type, width, height, bitrate: 20_000_000, framerate },
			});
		out.video[name] = row;
	}
	for (const [name, type] of Object.entries(audio))
		out.audio[name] = {
			mse: mse(type),
			info: await info({ audio: { contentType: type, channels: "6", bitrate: 640_000 } }),
		};
	out.display = {
		dynamicRangeHigh: matchMedia("(dynamic-range: high)").matches,
		videoDynamicRangeHigh: matchMedia("(video-dynamic-range: high)").matches,
		colorGamutP3: matchMedia("(color-gamut: p3)").matches,
		screen: [screen.width, screen.height, devicePixelRatio],
	};
	const call = (f) => {
		try {
			return f();
		} catch (e) {
			return `throws ${e.message ?? e}`;
		}
	};
	const webapis = globalThis.webapis;
	out.tizen = webapis
		? {
				hdr: call(() => webapis.avinfo.isHdrTvSupport()),
				dolby: call(() => webapis.avinfo.getDolbyDigitalCompMode?.()),
				model: call(() => webapis.productinfo.getRealModel()),
				uhd: call(() => webapis.productinfo.isUdPanelSupported()),
			}
		: null;
	const webOS = globalThis.webOS;
	out.webos = webOS
		? await new Promise((done) => {
				const t = setTimeout(() => done({ deviceInfo: "no answer in 3 s" }), 3000);
				call(() =>
					webOS.deviceInfo((d) => {
						clearTimeout(t);
						done({ deviceInfo: d });
					}),
				);
			})
		: null;
	console.log(JSON.stringify(out, null, 1));
})();
