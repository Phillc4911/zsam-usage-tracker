import { useMemo, useState } from 'react';
import {
  DEFAULT_LPARS,
  DEFAULT_WORKLOADS,
  INTERVALS_PER_DAY,
  INTERVALS_PER_HOUR,
  MONTHLY_PRODUCTS,
  runMonth,
  type CappingPlan,
} from '../engine';

const W = 960;
const H = 360;
const PAD = { l: 48, r: 12, t: 16, b: 28 };

function path(values: readonly number[], yMax: number): string {
  const n = values.length;
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  return values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
}

export function DebugPage() {
  const [lparId, setLparId] = useState('PROD1');
  const [day, setDay] = useState(1);
  const [seed, setSeed] = useState(20261106);
  const [dc, setDc] = useState<number | null>(null);

  const plan: CappingPlan = useMemo(() => ({ definedCapacity: dc === null ? {} : { [lparId]: dc }, groups: [] }), [dc, lparId]);
  const result = useMemo(
    () => runMonth({ days: 30, seed, monthIndex: 0, lpars: DEFAULT_LPARS, workloads: DEFAULT_WORKLOADS, plan, enablement: {}, products: MONTHLY_PRODUCTS }),
    [seed, plan],
  );

  const j = result.cap.lparIds.indexOf(lparId);
  const from = (day - 1) * INTERVALS_PER_DAY;
  const to = from + INTERVALS_PER_DAY;
  const demand = result.cap.demand[j].slice(from, to);
  const consumed = result.cap.consumed[j].slice(from, to);
  const r4ha = result.cap.r4ha[j].slice(from, to);
  const behind = result.cap.workBehind[j].slice(from, to);
  const yMax = Math.ceil(Math.max(...demand, ...consumed, ...r4ha, dc ?? 0, 10) / 50) * 50;
  const yOf = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const maxBehind = Math.max(...behind);
  const peakR4ha = Math.max(...r4ha);
  const peakAt = r4ha.indexOf(peakR4ha);
  const lpar = DEFAULT_LPARS[j];

  return (
    <main className="dbg">
      <h1>MSU TYCOON · ENGINE DEBUG</h1>
      <p className="sub">Milestone 1: one LPAR, one day. Five-minute intervals, rolling 4-hour average on top.</p>

      <section className="controls">
        <div className="group" role="group" aria-label="LPAR">
          {DEFAULT_LPARS.map((l) => (
            <button key={l.id} className={l.id === lparId ? 'on' : ''} onClick={() => { setLparId(l.id); setDc(null); }}>
              {l.id}
            </button>
          ))}
        </div>
        <div className="group">
          <button onClick={() => setDay((d) => Math.max(1, d - 1))} aria-label="Previous day">◀</button>
          <span className="val">Day {day}/30</span>
          <button onClick={() => setDay((d) => Math.min(30, d + 1))} aria-label="Next day">▶</button>
        </div>
        <label className="group">
          <span>Seed</span>
          <input inputMode="numeric" value={seed} onChange={(e) => setSeed(Number(e.target.value.replace(/\D/g, '')) || 0)} />
        </label>
        <div className="group">
          <button className={dc === null ? 'on' : ''} onClick={() => setDc(null)}>Uncapped</button>
          <label className="slider">
            <span>Defined capacity {dc ?? '–'} MSU</span>
            <input
              type="range"
              min={20}
              max={lpar.capacityMsu}
              step={5}
              value={dc ?? Math.round(peakR4ha)}
              onChange={(e) => setDc(Number(e.target.value))}
            />
          </label>
        </div>
      </section>

      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${lparId} MSU and R4HA, day ${day}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(f * yMax)} y2={yOf(f * yMax)} className="grid" />
            <text x={PAD.l - 6} y={yOf(f * yMax) + 4} className="axis" textAnchor="end">{Math.round(f * yMax)}</text>
          </g>
        ))}
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => {
          const x = PAD.l + ((h * INTERVALS_PER_HOUR) / (INTERVALS_PER_DAY - 1)) * (W - PAD.l - PAD.r);
          return <text key={h} x={x} y={H - 8} className="axis" textAnchor="middle">{String(h).padStart(2, '0')}:00</text>;
        })}
        {maxBehind > 0 &&
          behind.map((b, i) =>
            b > 0 ? (
              <rect key={i} x={PAD.l + (i / (INTERVALS_PER_DAY - 1)) * (W - PAD.l - PAD.r)} width={3} y={yOf(Math.min(b, yMax))} height={H - PAD.b - yOf(Math.min(b, yMax))} className="behind" />
            ) : null,
          )}
        <path d={path(demand, yMax)} className="demand" />
        <path d={path(consumed, yMax)} className="consumed" />
        <path d={path(r4ha, yMax)} className="r4ha" />
        {dc !== null && <line x1={PAD.l} x2={W - PAD.r} y1={yOf(dc)} y2={yOf(dc)} className="dc" />}
      </svg>

      <ul className="legend">
        <li><i className="k demand" />Demand</li>
        <li><i className="k consumed" />Consumed MSU</li>
        <li><i className="k r4ha" />R4HA (mean of last 48 intervals)</li>
        {dc !== null && <li><i className="k dc" />Defined capacity</li>}
        <li><i className="k behind" />Work behind</li>
      </ul>

      <table className="facts">
        <tbody>
          <tr><th>Peak R4HA today</th><td>{peakR4ha.toFixed(1)} MSU at {String(Math.floor(peakAt / 12)).padStart(2, '0')}:{String((peakAt % 12) * 5).padStart(2, '0')}</td></tr>
          <tr><th>Most work behind today</th><td>{maxBehind.toFixed(1)} MSU</td></tr>
          <tr><th>SLA misses (month, all LPARs)</th><td>{result.slaPointsLost}</td></tr>
          <tr><th>MLC bill this month (fictional credits)</th><td>{Math.round(result.mlcCredits).toLocaleString()}</td></tr>
        </tbody>
      </table>

      <h2>Month SCRT preview (all LPARs)</h2>
      <table className="facts">
        <thead><tr><th>Product</th><th>Billed MSU</th><th>Peak hour</th><th>LPARs at peak</th><th>Credits</th></tr></thead>
        <tbody>
          {result.lines.map((l) => (
            <tr key={l.product.id}>
              <th>{l.product.name}</th>
              <td>{l.product.pricing.kind === 'flat' ? 'flat' : l.peak.billedMsu}</td>
              <td>{l.peak.peakHour < 0 ? '–' : `day ${Math.floor(l.peak.peakHour / 24) + 1} ${String(l.peak.peakHour % 24).padStart(2, '0')}:00`}</td>
              <td>{l.peak.contributors.map((c) => `${c.lpar} ${c.r4ha.toFixed(0)}`).join(' + ')}</td>
              <td>{Math.round(l.credits).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sub">All prices are fictional game credits, not IBM list prices.</p>
    </main>
  );
}
