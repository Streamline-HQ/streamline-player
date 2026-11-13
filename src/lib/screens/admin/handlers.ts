import type { Act, Row, SectionKey } from "#lib/core/server-view.ts";

type Editable = Extract<Row, { t: "toggle" | "choice" | "text" | "num" }>;

/** What a row can do. Every member is optional: a control whose handler is absent is drawn but changes nothing. */
export type Handlers = {
	go?: (to: SectionKey) => void;
	act?: (a: Act) => void;
	save?: (key: string, value: string | number | boolean) => void;
	draft?: (key: string, raw: string) => void;
	commit?: (row: Editable) => void;
	busy?: (key: string) => boolean;
};
