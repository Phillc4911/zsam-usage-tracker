import { describe, expect, it } from 'vitest';
import { auditPenalty, fullCapacityCharge, rollScrtUpdate, scrtCompliance } from '../compliance';
import { SCRT_NONCOMPLIANT_EXPOSURE } from '../prices';

describe('SCRT version check', () => {
  it('flags the report non-compliant if a new level was not applied', () => {
    const r = scrtCompliance(true, false);
    expect(r.compliant).toBe(false);
    expect(r.exposure).toBe(SCRT_NONCOMPLIANT_EXPOSURE);
    expect(r.why?.codex).toBe('scrtLevel');
  });
  it('is compliant when the new level was applied, or when there was none', () => {
    expect(scrtCompliance(true, true)).toEqual({ compliant: true, exposure: 0 });
    expect(scrtCompliance(false, false)).toEqual({ compliant: true, exposure: 0 });
  });
  it('the monthly "new level" roll is seeded and occasional', () => {
    expect(rollScrtUpdate(42, 3)).toBe(rollScrtUpdate(42, 3));
    let hits = 0;
    for (let m = 0; m < 2000; m++) if (rollScrtUpdate(7, m)) hits++;
    expect(hits / 2000).toBeGreaterThan(0.15);
    expect(hits / 2000).toBeLessThan(0.25);
  });
});

describe('audits', () => {
  const records = [
    { month: 1, subCapacityCredits: 1000, fullCapacityCredits: 5000, archived: true },
    { month: 2, subCapacityCredits: 1000, fullCapacityCredits: 5000, archived: false },
    { month: 3, subCapacityCredits: 2000, fullCapacityCredits: 5500, archived: false },
  ];
  it('archived months count as evidence', () => {
    expect(auditPenalty([1], records)).toMatchObject({ missing: [], penaltyCredits: 0 });
  });
  it('missing months are billed at full capacity: penalty is the difference', () => {
    // month 2: 5000-1000 = 4000; month 3: 5500-2000 = 3500
    const r = auditPenalty([1, 2, 3], records);
    expect(r.missing).toEqual([2, 3]);
    expect(r.penaltyCredits).toBe(7500);
    expect(r.why?.codex).toBe('isvScrt');
  });
});

describe('hardware upgrade and full-capacity contracts', () => {
  it('an uncapped full-capacity contract rises with the new MSU rating', () => {
    const c = { vendor: 'Granite Systems', product: 'Tape manager', creditsPerMsu: 10 };
    expect(fullCapacityCharge(c, 800).credits).toBe(8000);
    expect(fullCapacityCharge(c, 950).credits).toBe(9500);
  });
  it('a contract with a cap clause does not', () => {
    const c = { vendor: 'Northwind Mainframe', product: 'Scheduler', creditsPerMsu: 10, capMsu: 800 };
    expect(fullCapacityCharge(c, 800)).toEqual({ chargeableMsu: 800, credits: 8000, heldByCap: false });
    expect(fullCapacityCharge(c, 950)).toEqual({ chargeableMsu: 800, credits: 8000, heldByCap: true });
  });
});
