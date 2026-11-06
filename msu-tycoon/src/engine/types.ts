/** Shared engine types. Pure data, no React. */

export type ProductId = string;
export type LparId = string;

/** A block of work on an LPAR: the daytime online curve or an overnight batch run. */
export interface Workload {
  id: string;
  lpar: LparId;
  kind: 'online' | 'batch';
  /** MSU at the top of the curve (online) or the plateau (batch). */
  peakMsu: number;
  /** Clock hour the work starts (0-23). Batch windows may wrap past midnight. */
  startHour: number;
  /** Length in hours. */
  hours: number;
  /** Products this work uses while it is active. */
  products: ProductId[];
  /** Optional 1-based day range within the month (inclusive). Default: every day. */
  fromDay?: number;
  toDay?: number;
}

export interface Lpar {
  id: LparId;
  name: string;
  /** Floor of always-on work (system tasks, monitors) in MSU. */
  baseMsu: number;
  /** Most MSU the LPAR can physically use in an interval (its share of the CPC). */
  capacityMsu: number;
  /** Fraction of demand used as random noise amplitude, e.g. 0.05 for +/-5%. */
  noisePct: number;
  /** Products that run whenever the LPAR is up (z/OS itself). */
  alwaysOn: ProductId[];
}

export interface CappingPlan {
  /** Defined capacity (soft cap) per LPAR, in MSU. Missing = uncapped. */
  definedCapacity: Partial<Record<LparId, number>>;
  /** Optional group capacity across several LPARs. */
  groups: { name: string; lpars: LparId[]; capacityMsu: number }[];
}

/** Product enablement per LPAR (IFAPRDxx-style). Missing entry = enabled. */
export type Enablement = Partial<Record<LparId, Partial<Record<ProductId, boolean>>>>;
