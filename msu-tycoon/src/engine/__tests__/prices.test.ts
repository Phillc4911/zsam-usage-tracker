import { describe, expect, it } from 'vitest';
import { flatCharge, tieredCharge } from '../prices';
import { buyIplaCapacity, iplaAnnualSupport, iplaScopeProduct, iplaShortfall, type IplaProduct } from '../ipla';

describe('MLC tier pricing (fictional table)', () => {
  it('charges each MSU at the rate of the tier it falls in', () => {
    // 5x400 + 45x150 + 100x90 + 50x60 = 2000 + 6750 + 9000 + 3000
    const t = tieredCharge(200);
    expect(t.credits).toBe(20750);
    expect(t.lines.map((l) => l.msu)).toEqual([5, 45, 100, 50]);
  });
  it('per-MSU price falls as MSU rises', () => {
    // 1000 MSU: 2000 + 6750 + 9000 + 9000 + 12000 + 11200 = 49950; the 1001st MSU costs 20
    expect(tieredCharge(1000).credits).toBe(49950);
    expect(tieredCharge(1001).credits).toBe(49970);
    expect(tieredCharge(1000).credits / 1000).toBeLessThan(tieredCharge(200).credits / 200);
  });
  it('handles tier edges and zero', () => {
    expect(tieredCharge(5).credits).toBe(2000);
    expect(tieredCharge(6).credits).toBe(2150);
    expect(tieredCharge(0)).toEqual({ credits: 0, lines: [] });
  });
  it('scales by a product multiplier', () => {
    expect(tieredCharge(200, undefined, 0.5).credits).toBe(10375);
  });
});

describe('flat-charge (FWLC-style) product', () => {
  it('is fixed regardless of MSU', () => {
    expect(flatCharge(1500)).toBe(1500);
  });
});

describe('IPLA', () => {
  const tool: IplaProduct = { id: 'db2util', type: 'referenceBased', parent: 'db2', otcPerMsu: 300 };

  it('charges a one-time fee per MSU added', () => {
    expect(buyIplaCapacity(tool, 0, 100)).toEqual({ ok: true, licensedMsu: 100, oneTimeCredits: 30000 });
    expect(buyIplaCapacity(tool, 100, 150)).toEqual({ ok: true, licensedMsu: 150, oneTimeCredits: 15000 });
  });
  it('can never reduce licensed capacity', () => {
    const r = buyIplaCapacity(tool, 100, 80);
    expect(r.ok).toBe(false);
    expect(r.licensedMsu).toBe(100);
    expect(r.oneTimeCredits).toBe(0);
    if (!r.ok) expect(r.why.codex).toBe('ipla');
  });
  it('charges annual support on everything owned', () => {
    // 150 MSU x 300 x 20%
    expect(iplaAnnualSupport(tool, 150)).toBe(9000);
  });
  it('licence scope follows the type', () => {
    expect(iplaScopeProduct(tool)).toBe('db2');
    expect(iplaScopeProduct({ id: 'perfmon', type: 'executionBased', otcPerMsu: 1 })).toBe('perfmon');
    expect(iplaScopeProduct({ id: 'secext', type: 'zosBased', otcPerMsu: 1 })).toBe('zos');
  });
  it('usage above licensed capacity is exposure, not a charge', () => {
    expect(iplaShortfall(180, 150)).toBe(30);
    expect(iplaShortfall(120, 150)).toBe(0);
  });
});
