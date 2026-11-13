import { empty, targets } from "./activity-lib.mjs";

export const target = targets.desktop.target;
export const mockArgs = ["--empty"];
export default (ctx) => empty(ctx, targets.desktop);
