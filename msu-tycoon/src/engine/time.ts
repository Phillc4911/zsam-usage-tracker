/** Time constants for the simulation. One interval = 5 minutes. */
export const MINUTES_PER_INTERVAL = 5;
export const INTERVALS_PER_HOUR = 12;
export const HOURS_PER_DAY = 24;
export const INTERVALS_PER_DAY = INTERVALS_PER_HOUR * HOURS_PER_DAY; // 288
/** The rolling four-hour average covers 4 h x 12 = 48 intervals. */
export const R4HA_WINDOW = 4 * INTERVALS_PER_HOUR; // 48

export function intervalsInMonth(days: number): number {
  if (!Number.isInteger(days) || days < 28 || days > 31) {
    throw new RangeError(`A month has 28 to 31 days, got ${days}`);
  }
  return days * INTERVALS_PER_DAY;
}

/** Hour index (0-based, across the month) that an interval belongs to. */
export function hourOfInterval(interval: number): number {
  return Math.floor(interval / INTERVALS_PER_HOUR);
}

/** Last interval of a clock hour: the R4HA "at the end of that hour" is read here. */
export function lastIntervalOfHour(hour: number): number {
  return hour * INTERVALS_PER_HOUR + INTERVALS_PER_HOUR - 1;
}

export function hourOfDay(hour: number): number {
  return hour % HOURS_PER_DAY;
}

export function dayOfHour(hour: number): number {
  return Math.floor(hour / HOURS_PER_DAY);
}
