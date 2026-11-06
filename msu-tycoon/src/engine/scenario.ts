import type { CappingPlan, Lpar, Workload } from './types';

/** The fictional bank's CPC: three z/OS LPARs. */
export const DEFAULT_LPARS: readonly Lpar[] = [
  { id: 'PROD1', name: 'PROD1 (core banking)', baseMsu: 40, capacityMsu: 420, noisePct: 0.05, alwaysOn: ['zos', 'secext'] },
  { id: 'PROD2', name: 'PROD2 (channels)', baseMsu: 30, capacityMsu: 320, noisePct: 0.05, alwaysOn: ['zos', 'secext'] },
  { id: 'DEV1', name: 'DEV1 (development)', baseMsu: 10, capacityMsu: 120, noisePct: 0.08, alwaysOn: ['zos'] },
];

export const DEFAULT_WORKLOADS: readonly Workload[] = [
  { id: 'prod1-online', lpar: 'PROD1', kind: 'online', peakMsu: 180, startHour: 7, hours: 12, products: ['db2', 'cics', 'mq', 'perfmon'] },
  { id: 'prod1-batch', lpar: 'PROD1', kind: 'batch', peakMsu: 220, startHour: 22, hours: 7, products: ['db2', 'rptw'] },
  { id: 'prod2-online', lpar: 'PROD2', kind: 'online', peakMsu: 140, startHour: 8, hours: 11, products: ['db2', 'mq'] },
  { id: 'prod2-batch', lpar: 'PROD2', kind: 'batch', peakMsu: 90, startHour: 1, hours: 4, products: ['db2'] },
  { id: 'dev1-online', lpar: 'DEV1', kind: 'online', peakMsu: 50, startHour: 8, hours: 10, products: ['db2', 'cics'] },
];

/** CPC full capacity rating in MSU (used for full-capacity claims). */
export const DEFAULT_CPC_MSU = 860;

export const NO_CAPS: CappingPlan = { definedCapacity: {}, groups: [] };
