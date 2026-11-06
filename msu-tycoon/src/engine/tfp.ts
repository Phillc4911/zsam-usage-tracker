import { INTERVALS_PER_HOUR } from './time';
import { TFP_BASELINE_RATE, TFP_GROWTH_RATE } from './prices';

/**
 * Consumed MSU per clock hour, summed across LPARs. An LPAR running at X MSU for a
 * 5-minute interval consumes X/12 MSU-hours, so an hour's value is the mean of its
 * 12 intervals.
 */
export function hourlyConsumedMsu(consumed: readonly (readonly number[])[]): number[] {
  const n = consumed[0]?.length ?? 0;
  const hours = Math.floor(n / INTERVALS_PER_HOUR);
  const out = new Array<number>(hours).fill(0);
  for (const series of consumed) {
    for (let i = 0; i < hours * INTERVALS_PER_HOUR; i++) {
      out[Math.floor(i / INTERVALS_PER_HOUR)] += series[i] / INTERVALS_PER_HOUR;
    }
  }
  return out;
}

/** Consumed MSU for a period = sum of hourly MSU. */
export function totalConsumedMsu(consumed: readonly (readonly number[])[]): number {
  return hourlyConsumedMsu(consumed).reduce((a, b) => a + b, 0);
}

/** Rule: each month under TFP Software Consumption, bill = annual baseline / 12 at a fixed rate. */
export function tfpMonthlyCredits(annualBaselineMsu: number, rate = TFP_BASELINE_RATE): number {
  return (annualBaselineMsu / 12) * rate;
}

/**
 * Rule: at year end, consumed MSU above the baseline is billed at the lower growth rate.
 * Consumption below the baseline is not refunded.
 */
export function tfpYearEndTrueUp(
  annualBaselineMsu: number,
  consumedAnnualMsu: number,
  growthRate = TFP_GROWTH_RATE,
): { overMsu: number; credits: number } {
  const overMsu = Math.max(0, consumedAnnualMsu - annualBaselineMsu);
  return { overMsu, credits: overMsu * growthRate };
}
