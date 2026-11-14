import { targets, web } from "./downloads-lib.mjs";

export const target = targets.web.target;
export default (ctx) => web(ctx);
