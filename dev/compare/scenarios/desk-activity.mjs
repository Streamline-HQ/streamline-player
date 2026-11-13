import { feed, targets } from "./activity-lib.mjs";

export const target = targets.desktop.target;
export const mockArgs = ["--demo-activity"];
export default (ctx) => feed(ctx, targets.desktop);
