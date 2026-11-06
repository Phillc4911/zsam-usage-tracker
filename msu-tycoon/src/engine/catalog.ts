import type { ProductId } from './types';
import type { IplaProduct } from './ipla';

/** Pricing of a monthly product. All credit amounts are fictional. */
export type MonthlyPricing =
  | { kind: 'mlc'; /** scales the fictional MLC tier table */ multiplier: number }
  | { kind: 'flat'; monthlyCredits: number };

export interface MonthlyProduct {
  id: ProductId;
  name: string;
  pricing: MonthlyPricing;
  /** Calls z/OS product registration services, so IFAPRDxx can enable/disable it. */
  usesRegistration: boolean;
}

export const MONTHLY_PRODUCTS: readonly MonthlyProduct[] = [
  { id: 'zos', name: 'z/OS', pricing: { kind: 'mlc', multiplier: 1 }, usesRegistration: true },
  { id: 'db2', name: 'Db2 for z/OS', pricing: { kind: 'mlc', multiplier: 0.7 }, usesRegistration: true },
  { id: 'cics', name: 'CICS TS', pricing: { kind: 'mlc', multiplier: 0.6 }, usesRegistration: true },
  { id: 'mq', name: 'IBM MQ', pricing: { kind: 'mlc', multiplier: 0.35 }, usesRegistration: false },
  { id: 'rptw', name: 'Report writer (flat-charge)', pricing: { kind: 'flat', monthlyCredits: 1500 }, usesRegistration: true },
];

/** Fictional IPLA tools, one of each licence type. */
export const IPLA_PRODUCTS: readonly (IplaProduct & { name: string })[] = [
  { id: 'db2util', name: 'Db2 utility suite', type: 'referenceBased', parent: 'db2', otcPerMsu: 300 },
  { id: 'perfmon', name: 'Performance monitor', type: 'executionBased', otcPerMsu: 250 },
  { id: 'secext', name: 'Security extension', type: 'zosBased', otcPerMsu: 150 },
];
