import { server, targets } from "./server-lib.mjs";

export const target = targets.web.target;
export const mockArgs = ["--demo-admin"];
export default (ctx) => server(ctx, targets.web);
