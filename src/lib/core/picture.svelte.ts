/** The signed-in account's picture as an `<img>` can load it. */
export const picture: { url: string | undefined } = $state({ url: undefined });

let latest = 0;

const release = (url: string | undefined) => {
	if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
};

export async function syncPicture(
	load: (version: number) => Promise<string>,
	has: boolean | undefined,
	version: number,
) {
	const run = ++latest;
	if (!has) {
		release(picture.url);
		picture.url = undefined;
		return;
	}
	let next: string;
	try {
		next = await load(version);
	} catch {
		if (run === latest) {
			release(picture.url);
			picture.url = undefined;
		}
		return;
	}
	if (run !== latest) return release(next);
	release(picture.url);
	picture.url = next;
}
