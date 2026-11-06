import type { Why } from './enablement';
import { createRng, deriveSeed } from './rng';
import { SCRT_NONCOMPLIANT_EXPOSURE } from './prices';

/** Chance per month that a new SCRT level is announced. */
export const SCRT_UPDATE_CHANCE = 0.2;

/** Seeded roll: does a "New SCRT level available" event happen this month? */
export function rollScrtUpdate(seed: number, monthIndex: number, chance = SCRT_UPDATE_CHANCE): boolean {
  return createRng(deriveSeed(seed, monthIndex, 0x5c27))() < chance;
}

/**
 * Rule: IBM requires reports made with the current SCRT level. A new level that wasn't
 * applied before the report flags it non-compliant and adds exposure.
 */
export function scrtCompliance(newLevelAvailable: boolean, applied: boolean): { compliant: boolean; exposure: number; why?: Why } {
  if (newLevelAvailable && !applied) {
    return {
      compliant: false,
      exposure: SCRT_NONCOMPLIANT_EXPOSURE,
      why: { text: 'A new SCRT level was out and this report was made with the old one. IBM requires the current SCRT level, so the report is non-compliant.', codex: 'scrtLevel' },
    };
  }
  return { compliant: true, exposure: 0 };
}

export interface ArchivedMonth {
  month: number;
  /** What the product was billed on its sub-capacity report. */
  subCapacityCredits: number;
  /** What it would cost at the machine's full capacity. */
  fullCapacityCredits: number;
  archived: boolean;
}

/**
 * Rule: an audit asks for N months of reports. Archived reports are evidence. For each
 * missing month the vendor can claim full-capacity pricing; the penalty is the
 * difference.
 */
export function auditPenalty(requestedMonths: readonly number[], records: readonly ArchivedMonth[]): {
  missing: number[];
  penaltyCredits: number;
  lines: { month: number; credits: number }[];
  why?: Why;
} {
  const byMonth = new Map(records.map((r) => [r.month, r]));
  const lines: { month: number; credits: number }[] = [];
  const missing: number[] = [];
  for (const m of requestedMonths) {
    const r = byMonth.get(m);
    if (r?.archived) continue;
    missing.push(m);
    const credits = r ? Math.max(0, r.fullCapacityCredits - r.subCapacityCredits) : 0;
    lines.push({ month: m, credits });
  }
  const penaltyCredits = lines.reduce((s, l) => s + l.credits, 0);
  return {
    missing,
    penaltyCredits,
    lines,
    why: missing.length
      ? { text: `No archived report for ${missing.length} requested month(s). Without reports you can't prove sub-capacity use, so the vendor can claim full capacity for those months.`, codex: 'isvScrt' }
      : undefined,
  };
}

/** A third-party contract priced on the machine's full capacity. */
export interface FullCapacityContract {
  vendor: string;
  product: string;
  /** Fictional credits per MSU per month. */
  creditsPerMsu: number;
  /** Negotiated cap clause: chargeable MSU never exceeds this. Undefined = no cap. */
  capMsu?: number;
}

/**
 * Rule: full-capacity contracts follow the machine's MSU rating. After a hardware
 * upgrade raises the rating, an uncapped contract goes up even with flat workload; a
 * contract negotiated with a cap doesn't go above the cap.
 */
export function fullCapacityCharge(c: FullCapacityContract, machineMsuRating: number): { chargeableMsu: number; credits: number; heldByCap: boolean } {
  const chargeableMsu = c.capMsu === undefined ? machineMsuRating : Math.min(machineMsuRating, c.capMsu);
  return { chargeableMsu, credits: chargeableMsu * c.creditsPerMsu, heldByCap: chargeableMsu < machineMsuRating };
}
