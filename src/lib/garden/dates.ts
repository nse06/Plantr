// Date helpers. Every date in the domain is an ISO "YYYY-MM-DD" string interpreted as a
// calendar day (UTC midnight), which keeps the math free of time-zone surprises.

const DAY_MS = 86_400_000;

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toISO(new Date(parseISO(iso).getTime() + Math.round(days) * DAY_MS));
}

export function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, weeks * 7);
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY_MS);
}

export function mmddToISO(year: number, mmdd: string): string {
  return `${year}-${mmdd}`;
}

export function minISO(...dates: string[]): string {
  return dates.reduce((a, b) => (a < b ? a : b));
}

export function maxISO(...dates: string[]): string {
  return dates.reduce((a, b) => (a > b ? a : b));
}

/** Today's date in U.S. Eastern-ish terms is close enough; we use the server's local date. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Apr 15" */
export function fmtShort(iso: string): string {
  const d = parseISO(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Thu, Apr 15" */
export function fmtDay(iso: string): string {
  const d = parseISO(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Apr 15, 2027" */
export function fmtLong(iso: string): string {
  const d = parseISO(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "April 2027" */
export function fmtMonth(iso: string): string {
  const d = parseISO(iso);
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "MM-DD" -> "Apr 15" */
export function fmtMMDD(mmdd: string): string {
  return fmtShort(`2001-${mmdd}`);
}

/** Monday-based start of the week containing iso. */
export function startOfWeek(iso: string): string {
  const day = parseISO(iso).getUTCDay(); // 0 = Sunday
  const offset = (day + 6) % 7;
  return addDays(iso, -offset);
}

/** A Saturday on or after iso, the day most people garden. */
export function nextSaturday(iso: string): string {
  const day = parseISO(iso).getUTCDay();
  return addDays(iso, (6 - day + 7) % 7);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
