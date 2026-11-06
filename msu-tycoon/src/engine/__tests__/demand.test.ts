import { describe, expect, it } from 'vitest';
import { lparDemand, workloadMsuAt, workloadShape } from '../demand';
import type { Lpar, Workload } from '../types';

const quiet: Lpar = { id: 'A', name: 'A', baseMsu: 10, capacityMsu: 500, noisePct: 0, alwaysOn: [] };

describe('demand profile', () => {
  it('base load only when no workload is active', () => {
    expect(lparDemand(quiet, [], 28, 1).every((d) => d === 10)).toBe(true);
  });

  it('batch plateau holds at peak and ramps at the ends', () => {
    // 10-interval run: ramp is 1 interval, so first and last are 1/1 = full too
    expect(workloadShape('batch', 0, 100)).toBeCloseTo(0.1, 9);
    expect(workloadShape('batch', 50, 100)).toBe(1);
    expect(workloadShape('batch', 99, 100)).toBeCloseTo(0.1, 9);
    expect(workloadShape('batch', 100, 100)).toBe(0);
  });

  it('online curve peaks mid-run', () => {
    expect(workloadShape('online', 49, 100)).toBeGreaterThan(workloadShape('online', 10, 100));
    expect(workloadShape('online', 49, 100)).toBeCloseTo(1, 3);
  });

  it('a batch window that starts at 22:00 runs past midnight into the next day', () => {
    const w: Workload = { id: 'b', lpar: 'A', kind: 'batch', peakMsu: 100, startHour: 22, hours: 4, products: [], fromDay: 1, toDay: 1 };
    expect(workloadMsuAt(w, 22 * 12 + 24)).toBe(100); // day 1, 00:00 (+2h into run)
    expect(workloadMsuAt(w, 288 + 12)).toBe(100); // day 2, 01:00
    expect(workloadMsuAt(w, 288 + 2 * 12)).toBe(0); // day 2, 02:00: run over
    expect(workloadMsuAt(w, 288 + 22 * 12 + 12)).toBe(0); // day 2's 22:00 run not scheduled
  });

  it('event workloads only add load on their days', () => {
    const w: Workload = { id: 'qe', lpar: 'A', kind: 'batch', peakMsu: 50, startHour: 0, hours: 24, products: [], fromDay: 28, toDay: 30 };
    const d = lparDemand(quiet, [w], 30, 1);
    expect(d[26 * 288 + 100]).toBe(10); // day 27
    expect(d[27 * 288 + 100]).toBe(60); // day 28
  });

  it('noise is reproducible from the seed and differs between seeds', () => {
    const noisy = { ...quiet, noisePct: 0.1 };
    expect(lparDemand(noisy, [], 28, 123)).toEqual(lparDemand(noisy, [], 28, 123));
    expect(lparDemand(noisy, [], 28, 123)).not.toEqual(lparDemand(noisy, [], 28, 124));
    const d = lparDemand(noisy, [], 28, 123);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...d)).toBeLessThanOrEqual(11);
  });
});
