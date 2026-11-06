import { R4HA_WINDOW } from './time';

/**
 * Rule: R4HA for an interval = mean of the LPAR's consumed MSU over the last 48
 * intervals (4 hours), including the current one. At the start of the month,
 * before 48 intervals exist, use the ones available. (Simplification; see codex "r4ha".)
 */
export function rollingFourHourAverage(consumed: readonly number[], window = R4HA_WINDOW): number[] {
  const out = new Array<number>(consumed.length);
  let sum = 0;
  for (let i = 0; i < consumed.length; i++) {
    sum += consumed[i];
    if (i >= window) sum -= consumed[i - window];
    const n = Math.min(i + 1, window);
    out[i] = sum / n;
  }
  return out;
}

/**
 * Incremental R4HA, used inside the capping loop where consumption is decided one
 * interval at a time.
 */
export class R4haTracker {
  private buf: number[] = [];
  private sum = 0;
  constructor(private readonly window = R4HA_WINDOW) {}
  push(msu: number): number {
    this.buf.push(msu);
    this.sum += msu;
    if (this.buf.length > this.window) this.sum -= this.buf.shift()!;
    return this.value;
  }
  get value(): number {
    return this.buf.length === 0 ? 0 : this.sum / this.buf.length;
  }
}
