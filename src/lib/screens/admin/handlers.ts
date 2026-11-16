import type { Act, Row, SectionKey } from "#lib/core/server-view.ts";

type Editable = Extract<Row, { t: "toggle" | "choice" | "text" | "num" }>;
type Value = string | number | boolean | string[];

/** What a row can do. Every member is optional: a control whose handler is absent is drawn but changes nothing. */
export type Handlers = {
	go?: (to: SectionKey) => void;
	act?: (a: Act) => void;
	/** Resolves to false when the value was refused or lost. */
	save?: (key: string, value: Value) => Promise<boolean> | undefined;
	draft?: (key: string, raw: string) => void;
	commit?: (row: Editable) => void;
	pick?: (code: string, userId: number) => void;
	busy?: (key: string) => boolean;
};
