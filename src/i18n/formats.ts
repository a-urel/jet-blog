import type { Formats } from "next-intl";

// Dates are shown in the publication's time zone, the same for every reader
// and every interface locale, so a prerendered page never disagrees with the
// client. Only the language of the formatted date follows the interface.
export const timeZone = "Europe/Istanbul";

// Named formats: format.dateTime(date, "date") on the server, the same name
// in client components.
export const formats = {
  dateTime: {
    // 24 October 2026
    date: { day: "numeric", month: "long", year: "numeric" },
    // 24 October 2026, 14:05
    dateTimeLong: {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
    // 24 Oct 2026, 14:05 (admin tables)
    dateTimeShort: { dateStyle: "medium", timeStyle: "short" },
  },
} satisfies Formats;
