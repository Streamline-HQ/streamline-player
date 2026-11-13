import { server, targets } from "./server-lib.mjs";

export const target = targets.desktop.target;
export const mockArgs = ["--demo-admin"];
export default (ctx) => server(ctx, targets.desktop);
