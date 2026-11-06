import type { CappingPlan, Enablement, Lpar, ProductId, Workload } from './types';
import { INTERVALS_PER_HOUR, intervalsInMonth } from './time';
import { lparDemand } from './demand';
import { simulateCapping, slaPointsLost, type CapResult } from './capping';
import { billedMsu, productHourlyValues, productRunsMatrix, type ProductPeak } from './products';
import { flatCharge, tieredCharge, type TierLine } from './prices';
import type { MonthlyProduct } from './catalog';
import { iplaScopeProduct, iplaShortfall, type IplaProduct } from './ipla';
import { totalConsumedMsu } from './tfp';

export interface MonthInput {
  days: number;
  seed: number;
  monthIndex: number;
  lpars: readonly Lpar[];
  workloads: readonly Workload[];
  plan: CappingPlan;
  enablement: Enablement;
  products: readonly MonthlyProduct[];
  ipla?: readonly IplaProduct[];
  iplaLicensed?: Partial<Record<ProductId, number>>;
}

export interface ProductLine {
  product: MonthlyProduct;
  peak: ProductPeak;
  credits: number;
  /** Tier breakdown (MLC only) so every credit can be traced to a rule. */
  tierLines: TierLine[];
}

export interface IplaLine {
  product: IplaProduct;
  scope: ProductId;
  requiredMsu: number;
  licensedMsu: number;
  shortfallMsu: number;
}

export interface MonthResult {
  cap: CapResult;
  lines: ProductLine[];
  ipla: IplaLine[];
  mlcCredits: number;
  slaPointsLost: number;
  consumedMsu: number;
}

/** Simulate one month: demand -> capping -> R4HA -> per-product peak -> invoice. */
export function runMonth(input: MonthInput): MonthResult {
  const n = intervalsInMonth(input.days);
  const hours = n / INTERVALS_PER_HOUR;
  const demand = input.lpars.map((l) => lparDemand(l, input.workloads, input.days, input.seed, input.monthIndex));
  const cap = simulateCapping(input.lpars, demand, input.plan);
  const peakOf = (id: ProductId) =>
    billedMsu(productHourlyValues(cap.lparIds, cap.r4ha, productRunsMatrix(id, input.lpars, input.workloads, input.enablement, hours)));

  const lines: ProductLine[] = input.products.map((product) => {
    const peak = peakOf(product.id);
    if (product.pricing.kind === 'flat') {
      return { product, peak, credits: flatCharge(product.pricing.monthlyCredits), tierLines: [] };
    }
    const t = tieredCharge(peak.billedMsu, undefined, product.pricing.multiplier);
    return { product, peak, credits: t.credits, tierLines: t.lines };
  });

  const ipla: IplaLine[] = (input.ipla ?? []).map((product) => {
    const scope = iplaScopeProduct(product);
    const requiredMsu = peakOf(scope).billedMsu;
    const licensedMsu = input.iplaLicensed?.[product.id] ?? 0;
    return { product, scope, requiredMsu, licensedMsu, shortfallMsu: iplaShortfall(requiredMsu, licensedMsu) };
  });

  return {
    cap,
    lines,
    ipla,
    mlcCredits: lines.reduce((s, l) => s + l.credits, 0),
    slaPointsLost: slaPointsLost(cap.slaMisses),
    consumedMsu: totalConsumedMsu(cap.consumed),
  };
}
