/**
 * FICTIONAL PRICE TABLES. Every number in this file is made up for the game and is
 * in game "credits". None of these are IBM or vendor list prices.
 */

export interface Tier {
  /** Upper bound of this tier in MSU (inclusive). Last tier is Infinity. */
  upToMsu: number;
  creditsPerMsu: number;
}

/**
 * Fictional MLC tier curve: the per-MSU price falls as MSU rises, the way the real
 * AWLC tier curve does. Boundaries and rates are invented.
 */
export const MLC_TIERS: readonly Tier[] = [
  { upToMsu: 5, creditsPerMsu: 400 },
  { upToMsu: 50, creditsPerMsu: 150 },
  { upToMsu: 150, creditsPerMsu: 90 },
  { upToMsu: 300, creditsPerMsu: 60 },
  { upToMsu: 600, creditsPerMsu: 40 },
  { upToMsu: 1000, creditsPerMsu: 28 },
  { upToMsu: Infinity, creditsPerMsu: 20 },
];

export interface TierLine {
  fromMsu: number;
  toMsu: number;
  msu: number;
  creditsPerMsu: number;
  credits: number;
}

/**
 * Rule: MLC price = sum across tiers. Each MSU is charged at the rate of the tier it
 * falls in. `multiplier` scales the table per product (Db2 costs less than z/OS, etc.).
 */
export function tieredCharge(msu: number, tiers: readonly Tier[] = MLC_TIERS, multiplier = 1): { credits: number; lines: TierLine[] } {
  if (msu < 0) throw new RangeError('MSU cannot be negative');
  const lines: TierLine[] = [];
  let lower = 0;
  let credits = 0;
  for (const t of tiers) {
    if (msu <= lower) break;
    const top = Math.min(msu, t.upToMsu);
    const units = top - lower;
    const rate = t.creditsPerMsu * multiplier;
    lines.push({ fromMsu: lower + 1, toMsu: top, msu: units, creditsPerMsu: rate, credits: units * rate });
    credits += units * rate;
    lower = t.upToMsu;
  }
  return { credits, lines };
}

/** FWLC-style flat charge: fixed credits per month regardless of MSU. */
export function flatCharge(monthlyCredits: number): number {
  return monthlyCredits;
}

/** Fictional IPLA economics. */
export const IPLA_SUPPORT_PCT = 0.2; // annual S&S as a fraction of the one-time charge

/** Fictional TFP Software Consumption rates (credits per consumed MSU). */
export const TFP_BASELINE_RATE = 0.3;
export const TFP_GROWTH_RATE = 0.18;

/** Fictional exposure points added for a report made with an out-of-date SCRT level. */
export const SCRT_NONCOMPLIANT_EXPOSURE = 10;
