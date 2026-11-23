export const PHONE_MAX_SHORT_SIDE = 600;

export const isPhoneSize = (width: number, height: number) =>
	Math.min(width, height) < PHONE_MAX_SHORT_SIDE;

// LG webOS, Samsung Tizen, Hisense VIDAA, Vizio SmartCast and Philips/TitanOS name themselves here.
const TV_AGENT = /Web0S|SMART-TV|Tizen|VIDAA|Hisense|VIZIO SmartCast|TitanOS/;

export const isTvAgent = (userAgent: string) => TV_AGENT.test(userAgent);
