import type { Component, Snippet } from "svelte";
import { getContext, setContext } from "svelte";

export type DialogSurfaceProps = {
	title: string;
	closeLabel: string;
	shown: boolean;
	onclose: () => void;
	children: Snippet;
	footer?: Snippet;
};

const KEY = Symbol("dialog-surface");

/** A shell gives the surface its dialogs are drawn on, as the phone shell does with a bottom sheet. */
export const provideDialogSurface = (surface: Component<DialogSurfaceProps>) =>
	setContext(KEY, surface);
/** Call during component setup. */
export const useDialogSurface = () => getContext<Component<DialogSurfaceProps> | undefined>(KEY);
