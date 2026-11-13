import { actions, targets } from "./server-actions-lib.mjs";

export const target = targets.web.target;
export const mockArgs = ["--demo-admin"];
export default (ctx) => actions(ctx, targets.web);
