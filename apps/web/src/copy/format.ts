// Locale-dependent formatting of times, numbers and distances. Words live in strings.ts.

const time = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });

const DAY = { today: "Today", tomorrow: "Tomorrow" };

/** "Today", "Tomorrow", or the short weekday. */
export function dayLabel(t: number, now = Date.now()): string {
  const day = (ms: number) => new Date(ms).toDateString();
  if (day(t) === day(now)) return DAY.today;
  if (day(t) === day(now + 86_400_000)) return DAY.tomorrow;
  return weekday.format(t);
}

/** "08:15" later today, otherwise "Tue 06:00". */
export function formatMoment(t: number, now = Date.now()): string {
  const label = dayLabel(t, now);
  return label === DAY.today ? time.format(t) : `${label} ${time.format(t)}`;
}

/** "06:30" in the device's time zone. */
export function formatTime(t: number): string {
  return time.format(t);
}

/** "Today 18:00–20:15", "Tue 06:30–08:30", in the device's own time zone. */
export function formatWindow(start: number, end: number, now = Date.now()): string {
  return `${dayLabel(start, now)} ${time.format(start)}–${time.format(end)}`;
}

/** "420 m", "3.9 km", "18 km"; the non-breaking space keeps number and unit together. */
export function formatDistance(km: number): string {
  return km < 1
    ? `${Math.round(km * 1000)}\u00a0m`
    : `${km < 10 ? km.toFixed(1) : Math.round(km)}\u00a0km`;
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** "+0.8", "−1.2": a true minus sign, and a plus for positives. */
export function formatSigned(n: number, digits = 0): string {
  const text = formatNumber(Math.abs(n), digits);
  return n > 0 ? `+${text}` : n < 0 ? `\u2212${text}` : text;
}
