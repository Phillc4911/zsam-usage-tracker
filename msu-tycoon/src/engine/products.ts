import type { Enablement, Lpar, LparId, ProductId, Workload } from './types';
import { INTERVALS_PER_HOUR, lastIntervalOfHour } from './time';
import { workloadActiveInHour } from './demand';
import { isEnabled } from './enablement';

/**
 * Rule: a product "runs" on an LPAR in an hour if it is enabled there and the LPAR's
 * workload uses it that hour (or it is always on, like z/OS).
 * Returns runs[lparIndex][hour].
 */
export function productRunsMatrix(
  product: ProductId,
  lpars: readonly Lpar[],
  workloads: readonly Workload[],
  enablement: Enablement,
  hours: number,
): boolean[][] {
  return lpars.map((lpar) => {
    const row = new Array<boolean>(hours).fill(false);
    if (!isEnabled(enablement, lpar.id, product)) return row;
    if (lpar.alwaysOn.includes(product)) return row.fill(true);
    const users = workloads.filter((w) => w.lpar === lpar.id && w.products.includes(product));
    for (let h = 0; h < hours; h++) row[h] = users.some((w) => workloadActiveInHour(w, h));
    return row;
  });
}

export interface Contributor {
  lpar: LparId;
  r4ha: number;
}

export interface HourlyValue {
  hour: number;
  value: number;
  contributors: Contributor[];
}

/**
 * Rule: for each clock hour, a product's value = sum of the R4HA (at the end of that
 * hour) of every LPAR where the product ran during that hour.
 */
export function productHourlyValues(
  lparIds: readonly LparId[],
  r4ha: readonly (readonly number[])[],
  runs: readonly (readonly boolean[])[],
): HourlyValue[] {
  const n = r4ha[0]?.length ?? 0;
  const hours = Math.floor(n / INTERVALS_PER_HOUR);
  const out: HourlyValue[] = [];
  for (let h = 0; h < hours; h++) {
    const at = lastIntervalOfHour(h);
    const contributors: Contributor[] = [];
    let value = 0;
    for (let j = 0; j < lparIds.length; j++) {
      if (runs[j][h]) {
        value += r4ha[j][at];
        contributors.push({ lpar: lparIds[j], r4ha: r4ha[j][at] });
      }
    }
    out.push({ hour: h, value, contributors });
  }
  return out;
}

export interface ProductPeak {
  /** Billed MSU: the month's highest hourly value, rounded to whole MSU. */
  billedMsu: number;
  peakValue: number;
  /** First hour that reached the peak, or -1 if the product never ran. */
  peakHour: number;
  contributors: Contributor[];
}

/** Rule: billed MSU (MLC sub-capacity) = highest hourly value in the month, rounded. */
export function billedMsu(hourly: readonly HourlyValue[]): ProductPeak {
  let best: HourlyValue | undefined;
  for (const hv of hourly) if (hv.value > 0 && (!best || hv.value > best.value)) best = hv;
  if (!best) return { billedMsu: 0, peakValue: 0, peakHour: -1, contributors: [] };
  return { billedMsu: Math.round(best.value), peakValue: best.value, peakHour: best.hour, contributors: best.contributors };
}
