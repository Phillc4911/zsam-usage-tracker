import type { ProductId } from './types';
import type { Why } from './enablement';
import { IPLA_SUPPORT_PCT } from './prices';

/**
 * IPLA licence types (codex: refBased, execBased, zosBased):
 * - referenceBased: licensed for the LPARs where its parent product runs.
 * - executionBased: licensed for the LPARs where it runs itself.
 * - zosBased: licensed for the LPARs where z/OS runs.
 */
export type IplaType = 'referenceBased' | 'executionBased' | 'zosBased';

export interface IplaProduct {
  id: ProductId;
  type: IplaType;
  /** Parent product for reference-based licences (e.g. a Db2 tool follows Db2). */
  parent?: ProductId;
  /** Fictional one-time charge per MSU of licensed capacity. */
  otcPerMsu: number;
}

export const ZOS_PRODUCT_ID = 'zos';

/** Which product's run pattern decides how much capacity this IPLA product needs. */
export function iplaScopeProduct(p: IplaProduct): ProductId {
  switch (p.type) {
    case 'referenceBased':
      if (!p.parent) throw new Error(`Reference-based IPLA ${p.id} needs a parent product`);
      return p.parent;
    case 'executionBased':
      return p.id;
    case 'zosBased':
      return ZOS_PRODUCT_ID;
  }
}

export type BuyResult =
  | { ok: true; licensedMsu: number; oneTimeCredits: number }
  | { ok: false; licensedMsu: number; oneTimeCredits: 0; why: Why };

/**
 * Rule: buying IPLA capacity is a one-time charge per added MSU. Licensed capacity can
 * only increase; asking for less than you own is refused.
 */
export function buyIplaCapacity(p: IplaProduct, currentMsu: number, targetMsu: number): BuyResult {
  if (targetMsu < currentMsu) {
    return {
      ok: false,
      licensedMsu: currentMsu,
      oneTimeCredits: 0,
      why: { text: `IPLA licensed capacity can't decrease once purchased. You own ${currentMsu} MSU of ${p.id}; it stays at ${currentMsu}.`, codex: 'ipla' },
    };
  }
  return { ok: true, licensedMsu: targetMsu, oneTimeCredits: (targetMsu - currentMsu) * p.otcPerMsu };
}

/** Rule: annual Subscription & Support = fixed % of the one-time charge for everything owned. */
export function iplaAnnualSupport(p: IplaProduct, licensedMsu: number, supportPct = IPLA_SUPPORT_PCT): number {
  return licensedMsu * p.otcPerMsu * supportPct;
}

/**
 * Rule: usage above licensed capacity is audit exposure, not an automatic charge.
 * Returns the MSU shortfall (0 if covered).
 */
export function iplaShortfall(requiredMsu: number, licensedMsu: number): number {
  return Math.max(0, requiredMsu - licensedMsu);
}
