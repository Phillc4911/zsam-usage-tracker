import { describe, expect, it } from 'vitest';
import { runMonth, type MonthInput } from '../month';
import { DEFAULT_LPARS, DEFAULT_WORKLOADS, NO_CAPS } from '../scenario';
import { IPLA_PRODUCTS, MONTHLY_PRODUCTS } from '../catalog';
import { billedMsu, productHourlyValues, productRunsMatrix } from '../products';

const base: MonthInput = {
  days: 30,
  seed: 20261106,
  monthIndex: 0,
  lpars: DEFAULT_LPARS,
  workloads: DEFAULT_WORKLOADS,
  plan: NO_CAPS,
  enablement: {},
  products: MONTHLY_PRODUCTS,
  ipla: IPLA_PRODUCTS,
  iplaLicensed: { db2util: 300, perfmon: 100, secext: 600 },
};

describe('one month end to end', () => {
  const free = runMonth(base);
  const capped = runMonth({ ...base, plan: { definedCapacity: { PROD1: 180 }, groups: [] } });

  it('is deterministic for a seed', () => {
    expect(runMonth(base).mlcCredits).toBe(free.mlcCredits);
  });

  it('billed MSU traces back to the hourly R4HA sums', () => {
    const zos = free.lines.find((l) => l.product.id === 'zos')!;
    const runs = productRunsMatrix('zos', DEFAULT_LPARS, DEFAULT_WORKLOADS, {}, 30 * 24);
    expect(zos.peak).toEqual(billedMsu(productHourlyValues(free.cap.lparIds, free.cap.r4ha, runs)));
    const sum = zos.peak.contributors.reduce((s, c) => s + c.r4ha, 0);
    expect(zos.peak.billedMsu).toBe(Math.round(sum));
    expect(zos.tierLines.reduce((s, t) => s + t.credits, 0)).toBe(zos.credits);
  });

  it('a defined capacity lowers MLC billed MSU and costs some SLA', () => {
    const z0 = free.lines.find((l) => l.product.id === 'zos')!.peak.billedMsu;
    const z1 = capped.lines.find((l) => l.product.id === 'zos')!.peak.billedMsu;
    expect(z1).toBeLessThan(z0);
    expect(capped.mlcCredits).toBeLessThan(free.mlcCredits);
    // While capped, PROD1 never consumes more than its defined capacity.
    const p1 = capped.cap.capReason[0];
    expect(p1.some((r) => r === 'definedCapacity')).toBe(true);
    p1.forEach((r, i) => r === 'definedCapacity' && expect(capped.cap.consumed[0][i]).toBeLessThanOrEqual(180));
    // Its peak R4HA is lower than uncapped, though it can overshoot the DC: the cap only
    // engages after the R4HA crosses it, and capped intervals still replace lower ones.
    expect(Math.max(...capped.cap.r4ha[0])).toBeLessThan(Math.max(...free.cap.r4ha[0]));
    expect(capped.slaPointsLost).toBeGreaterThanOrEqual(free.slaPointsLost);
  });

  it('flat-charge products ignore MSU', () => {
    const f0 = free.lines.find((l) => l.product.id === 'rptw')!;
    const f1 = capped.lines.find((l) => l.product.id === 'rptw')!;
    expect(f0.credits).toBe(1500);
    expect(f1.credits).toBe(1500);
  });

  it('disabling Db2 on DEV1 removes DEV1 from the Db2 peak', () => {
    const r = runMonth({ ...base, enablement: { DEV1: { db2: false } } });
    const db2 = r.lines.find((l) => l.product.id === 'db2')!;
    expect(db2.peak.contributors.map((c) => c.lpar)).not.toContain('DEV1');
  });

  it('IPLA usage above licence shows as shortfall (exposure), not a charge', () => {
    const r = runMonth({ ...base, iplaLicensed: { db2util: 10 } });
    const tool = r.ipla.find((l) => l.product.id === 'db2util')!;
    const db2 = r.lines.find((l) => l.product.id === 'db2')!;
    expect(tool.scope).toBe('db2');
    expect(tool.requiredMsu).toBe(db2.peak.billedMsu);
    expect(tool.shortfallMsu).toBe(db2.peak.billedMsu - 10);
    expect(r.mlcCredits).toBe(free.mlcCredits);
  });
});
