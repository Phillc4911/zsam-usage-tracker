import type { Enablement, LparId, ProductId } from './types';

export interface Why {
  text: string;
  codex: string;
}

export function isEnabled(en: Enablement, lpar: LparId, product: ProductId): boolean {
  return en[lpar]?.[product] ?? true;
}

export type EnablementResult =
  | { ok: true; enablement: Enablement }
  | { ok: false; enablement: Enablement; why: Why };

/**
 * Rule: product enablement (IFAPRDxx) only controls products that call z/OS product
 * registration services. MQ doesn't, so it can't be disabled this way.
 */
export function setEnablement(
  en: Enablement,
  lpar: LparId,
  product: { id: ProductId; usesRegistration: boolean },
  enabled: boolean,
): EnablementResult {
  if (!enabled && !product.usesRegistration) {
    return {
      ok: false,
      enablement: en,
      why: {
        text: `${product.id} doesn't call z/OS product registration services, so IFAPRDxx can't disable it. Only registering products are controlled by the enablement policy.`,
        codex: 'ifaprd',
      },
    };
  }
  return { ok: true, enablement: { ...en, [lpar]: { ...en[lpar], [product.id]: enabled } } };
}
