import { errors, targets } from "./activity-lib.mjs";

export const target = targets.desktop.target;
export const mockArgs = ["--demo-activity"];
export default (ctx) => errors(ctx, targets.desktop);
