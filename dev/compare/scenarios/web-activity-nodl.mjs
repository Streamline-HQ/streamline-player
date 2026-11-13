import { feed, targets } from "./activity-lib.mjs";

export const target = targets.web.target;
export const mockArgs = ["--demo-activity=no-downloads"];
export default (ctx) => feed(ctx, targets.web, { noDownloads: true });
