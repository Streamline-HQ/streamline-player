import { actions, targets } from "./server-actions-lib.mjs";

export const target = targets.desktop.target;
export const mockArgs = ["--demo-admin", "--player-url", "http://localhost:1430"];
export default (ctx) => actions(ctx, targets.desktop);
