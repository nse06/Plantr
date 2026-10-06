import { addDays, parseISO } from "./dates";

// Daily values interpolated from NOAA monthly normals. Each monthly normal is treated as the
// value at mid-month and we interpolate linearly between months (wrapping Dec -> Jan).

const MID_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

function dayOfYear(iso: string): number {
  const d = parseISO(iso);
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
}

/** Normal temperature (°F) on a calendar day, from 12 monthly normals. */
export function normalOn(monthly: number[], iso: string): number {
  const doy = dayOfYear(iso);
  for (let i = 0; i < 12; i++) {
    const a = MID_DOY[i];
    const b = i === 11 ? MID_DOY[0] + 365 : MID_DOY[i + 1];
    const day = doy < MID_DOY[0] ? doy + 365 : doy;
    if (day >= a && day < b) {
      const next = monthly[(i + 1) % 12];
      return monthly[i] + ((next - monthly[i]) * (day - a)) / (b - a);
    }
  }
  return monthly[0];
}

/** First day in [from, to] whose normal satisfies the test, or null. */
export function firstDayWhere(monthly: number[], from: string, to: string, test: (t: number) => boolean): string | null {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (test(normalOn(monthly, d))) return d;
  }
  return null;
}
