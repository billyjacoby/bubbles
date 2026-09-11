const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });

const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  month: "numeric",
  day: "numeric",
  year: "2-digit",
});

const FULL = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Compact timestamp for the chat list: time today, weekday this week, else date. */
export function formatListTimestamp(ms: number | null | undefined): string {
  if (!ms) return "";
  const today = startOfDay(Date.now());
  const day = startOfDay(ms);
  if (day === today) return TIME.format(ms);
  if (today - day < 7 * DAY_MS) return WEEKDAY.format(ms);
  return SHORT_DATE.format(ms);
}

/** Full timestamp for the divider between groups of messages. */
export function formatDivider(ms: number | null | undefined): string {
  if (!ms) return "";
  const today = startOfDay(Date.now());
  const day = startOfDay(ms);
  if (day === today) return `Today ${TIME.format(ms)}`;
  if (today - day === DAY_MS) return `Yesterday ${TIME.format(ms)}`;
  return FULL.format(ms);
}

export function formatTime(ms: number | null | undefined): string {
  return ms ? TIME.format(ms) : "";
}

/** Insert a divider when more than an hour passes between messages. */
export const DIVIDER_THRESHOLD_MS = 60 * 60 * 1000;
