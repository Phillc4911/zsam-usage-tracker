import { describe, expect, it } from 'vitest';
import { hourlyConsumedMsu, tfpMonthlyCredits, tfpYearEndTrueUp, totalConsumedMsu } from '../tfp';
import { simulateCapping } from '../capping';

describe('TFP Software Consumption', () => {
  it('aggregates consumed MSU hourly across LPARs', () => {
    // LPAR A: 60 MSU for hour 0, 120 for hour 1. LPAR B: 30 for both.
    const a = [...Array(12).fill(60), ...Array(12).fill(120)];
    const b = Array(24).fill(30);
    expect(hourlyConsumedMsu([a, b])).toEqual([90, 150]);
    expect(totalConsumedMsu([a, b])).toBe(240);
  });

  it('bills baseline / 12 each month at the fixed rate', () => {
    // 1,200,000 / 12 x 0.3
    expect(tfpMonthlyCredits(1_200_000)).toBeCloseTo(30000, 6);
  });

  it('bills consumption above the baseline at year end at the growth rate', () => {
    // 100,000 MSU over x 0.18
    const t = tfpYearEndTrueUp(1_200_000, 1_300_000);
    expect(t.overMsu).toBe(100000);
    expect(t.credits).toBeCloseTo(18000, 6);
  });

  it('charges nothing extra (and refunds nothing) under the baseline', () => {
    expect(tfpYearEndTrueUp(1_200_000, 900_000)).toEqual({ overMsu: 0, credits: 0 });
  });

  it('capping gives no cost benefit: deferred work is still consumed', () => {
    const demand = [[...Array(48).fill(60), ...Array(12).fill(0)]];
    const lp = [{ id: 'A', capacityMsu: 1000 }];
    const uncapped = simulateCapping(lp, demand, { definedCapacity: {}, groups: [] }, []);
    const capped = simulateCapping(lp, demand, { definedCapacity: { A: 50 }, groups: [] }, []);
    expect(totalConsumedMsu(capped.consumed)).toBeCloseTo(totalConsumedMsu(uncapped.consumed), 9);
  });
});
