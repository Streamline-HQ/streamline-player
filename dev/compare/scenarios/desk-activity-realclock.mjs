import { realTime, targets } from "./activity-lib.mjs";

export const target = targets.desktop.target;
export const realClock = true;
export const mockArgs = ["--demo-activity"];
export default (ctx) => realTime(ctx, targets.desktop);
