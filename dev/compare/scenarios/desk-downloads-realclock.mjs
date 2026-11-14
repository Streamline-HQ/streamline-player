import { realTime } from "./downloads-lib.mjs";

export const target = "desktop";
export const realClock = true;
export default (ctx) => realTime(ctx);
