const DATE_LOCALE: Record<string, string> = { en: "en-GB" };

/** The locale dates are written in: English is day-first. */
export const dateLocale = (locale: string) => DATE_LOCALE[locale] ?? locale;
