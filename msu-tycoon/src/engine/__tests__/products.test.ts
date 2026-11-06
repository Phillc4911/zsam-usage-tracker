import { describe, expect, it } from 'vitest';
import { billedMsu, productHourlyValues, productRunsMatrix } from '../products';
import { setEnablement } from '../enablement';
import type { Lpar, Workload } from '../types';

/** Build a 1-day R4HA series at `base`, with chosen end-of-hour values overridden. */
function series(base: number, overrides: Record<number, number> = {}): number[] {
  const s = Array(288).fill(base);
  for (const [hour, v] of Object.entries(overrides)) s[Number(hour) * 12 + 11] = v;
  return s;
}

describe('product hourly value', () => {
  // 2 LPARs, 1 day. A runs the product all day, B only in hours 9-11.
  const r4ha = [series(100, { 10: 150 }), series(40, { 10: 60, 12: 500 })];
  const runs = [Array(24).fill(true), Array.from({ length: 24 }, (_, h) => h >= 9 && h <= 11)];
  const hv = productHourlyValues(['A', 'B'], r4ha, runs);

  it('sums the end-of-hour R4HA of LPARs where the product ran', () => {
    expect(hv).toHaveLength(24);
    expect(hv[8].value).toBe(100); // B not running
    expect(hv[9].value).toBe(140); // 100 + 40
    expect(hv[10].value).toBe(210); // 150 + 60
    expect(hv[12].value).toBe(100); // B's 500 doesn't count: product not running on B
  });

  it('reads the R4HA at the end of the hour, not mid-hour', () => {
    const r = [series(100)];
    r[0][10 * 12 + 5] = 999; // mid-hour spike in the R4HA series is ignored
    expect(productHourlyValues(['A'], r, [Array(24).fill(true)])[10].value).toBe(100);
  });

  it('billed MSU is the month peak hourly value, with the contributing LPARs', () => {
    const p = billedMsu(hv);
    expect(p.billedMsu).toBe(210);
    expect(p.peakHour).toBe(10);
    expect(p.contributors).toEqual([
      { lpar: 'A', r4ha: 150 },
      { lpar: 'B', r4ha: 60 },
    ]);
  });

  it('rounds billed MSU to whole MSU', () => {
    expect(billedMsu([{ hour: 0, value: 210.4, contributors: [] }]).billedMsu).toBe(210);
    expect(billedMsu([{ hour: 0, value: 210.5, contributors: [] }]).billedMsu).toBe(211);
  });

  it('bills 0 MSU for a product that never ran', () => {
    expect(billedMsu(productHourlyValues(['A'], [series(100)], [Array(24).fill(false)]))).toMatchObject({ billedMsu: 0, peakHour: -1 });
  });
});

describe('where a product runs', () => {
  const lpars: Lpar[] = [
    { id: 'A', name: 'A', baseMsu: 0, capacityMsu: 100, noisePct: 0, alwaysOn: ['zos'] },
    { id: 'B', name: 'B', baseMsu: 0, capacityMsu: 100, noisePct: 0, alwaysOn: ['zos'] },
  ];
  const workloads: Workload[] = [{ id: 'w', lpar: 'A', kind: 'online', peakMsu: 10, startHour: 8, hours: 2, products: ['db2'] }];

  it('always-on products run every hour', () => {
    expect(productRunsMatrix('zos', lpars, workloads, {}, 24)[1].every(Boolean)).toBe(true);
  });
  it('workload products run only in hours the workload is active', () => {
    const m = productRunsMatrix('db2', lpars, workloads, {}, 24);
    expect(m[0].map((v, h) => (v ? h : -1)).filter((h) => h >= 0)).toEqual([8, 9]);
    expect(m[1].some(Boolean)).toBe(false);
  });
  it('a disabled product does not run, even when the workload uses it', () => {
    const m = productRunsMatrix('db2', lpars, workloads, { A: { db2: false } }, 24);
    expect(m[0].some(Boolean)).toBe(false);
  });
});

describe('product enablement (IFAPRDxx)', () => {
  it('can disable a product that uses registration services', () => {
    const r = setEnablement({}, 'DEV1', { id: 'db2', usesRegistration: true }, false);
    expect(r.ok).toBe(true);
    expect(r.enablement).toEqual({ DEV1: { db2: false } });
  });
  it('refuses to disable MQ and explains why', () => {
    const r = setEnablement({}, 'DEV1', { id: 'mq', usesRegistration: false }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.why.codex).toBe('ifaprd');
      expect(r.why.text).toMatch(/registration/);
    }
    expect(r.enablement).toEqual({});
  });
});
