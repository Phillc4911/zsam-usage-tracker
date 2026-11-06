import type { Lpar, Workload } from './types';
import { INTERVALS_PER_DAY, INTERVALS_PER_HOUR } from './time';
import { createRng, deriveSeed, noise, stringSeed } from './rng';

/** True if the workload is scheduled on this (1-based) day of the month. */
export function workloadOnDay(w: Workload, day1: number): boolean {
  return (w.fromDay === undefined || day1 >= w.fromDay) && (w.toDay === undefined || day1 <= w.toDay);
}

/**
 * Shape of a workload at step k of an n-interval run, as a 0..1 multiplier of peakMsu.
 * - online: a smooth hump (half sine), busiest mid-run.
 * - batch: ramps up over the first 10% of the run, holds, ramps down over the last 10%.
 */
export function workloadShape(kind: Workload['kind'], k: number, n: number): number {
  if (k < 0 || k >= n) return 0;
  if (kind === 'online') return Math.sin((Math.PI * (k + 0.5)) / n);
  const ramp = Math.max(1, Math.round(n * 0.1));
  return Math.min(1, (k + 1) / ramp, (n - k) / ramp);
}

/**
 * MSU a workload adds at a given month interval (before noise). Handles windows that
 * wrap past midnight: a run that starts on day d at 22:00 and lasts 8 hours continues
 * into day d+1, and belongs to day d for fromDay/toDay purposes.
 */
export function workloadMsuAt(w: Workload, interval: number): number {
  const runIntervals = Math.round(w.hours * INTERVALS_PER_HOUR);
  if (runIntervals <= 0) return 0;
  const startOffset = Math.round(w.startHour * INTERVALS_PER_HOUR);
  const day0 = Math.floor(interval / INTERVALS_PER_DAY);
  // The run could have started today or (if it wraps) on an earlier day.
  for (let back = 0; back * INTERVALS_PER_DAY < runIntervals + INTERVALS_PER_DAY; back++) {
    const startDay0 = day0 - back;
    if (startDay0 < 0) break;
    const start = startDay0 * INTERVALS_PER_DAY + startOffset;
    const k = interval - start;
    if (k >= 0 && k < runIntervals && workloadOnDay(w, startDay0 + 1)) {
      return w.peakMsu * workloadShape(w.kind, k, runIntervals);
    }
  }
  return 0;
}

/** True if the workload is active (adds any MSU) at some interval in this clock hour. */
export function workloadActiveInHour(w: Workload, hour: number): boolean {
  const first = hour * INTERVALS_PER_HOUR;
  for (let i = first; i < first + INTERVALS_PER_HOUR; i++) {
    if (workloadMsuAt(w, i) > 0) return true;
  }
  return false;
}

/**
 * Rule: each LPAR's demand per interval = baseline profile (base + online curve +
 * overnight batch) + event modifiers (extra workloads) + seeded noise.
 * `monthIndex` and the LPAR id feed the seed so each LPAR/month has its own stream.
 */
export function lparDemand(
  lpar: Lpar,
  workloads: readonly Workload[],
  days: number,
  seed: number,
  monthIndex = 0,
): number[] {
  const n = days * INTERVALS_PER_DAY;
  const mine = workloads.filter((w) => w.lpar === lpar.id);
  const rng = createRng(deriveSeed(seed, monthIndex, stringSeed(lpar.id)));
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let d = lpar.baseMsu;
    for (const w of mine) d += workloadMsuAt(w, i);
    d *= 1 + lpar.noisePct * noise(rng);
    out[i] = Math.max(0, d);
  }
  return out;
}
