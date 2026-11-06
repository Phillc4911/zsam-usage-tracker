# MSU Tycoon

A browser game that teaches IBM Z software licensing (sub-capacity pricing, R4HA,
capping, MLC vs IPLA, TFP, SCRT, audits). See `CLAUDE.md` for the full brief and
`content/licensing-facts.json` for the facts the game is allowed to teach.

All money in the game is fictional **credits**. No number here is an IBM or vendor price.

## Status: Milestone 1 (engine + tests + debug page)

```
npm install
npm test        # golden tests for every simulation rule
npm run dev     # debug page: one LPAR's MSU + R4HA for one day
npm run build   # static site in dist/
```

## Engine map (`src/engine/`, pure TypeScript, no React)

| Rule | File | Tests |
|---|---|---|
| 288 intervals/day, 28–31 day months | `time.ts` | `r4ha.test.ts` |
| Demand = baseline profile + events + seeded noise | `demand.ts`, `rng.ts` | `demand.test.ts` |
| R4HA = mean of last 48 intervals (fewer at month start) | `r4ha.ts` | `r4ha.test.ts` |
| Defined capacity, group capacity, work behind, SLA | `capping.ts` | `capping.test.ts` |
| Product hourly value, billed MSU | `products.ts` | `products.test.ts` |
| Product enablement (IFAPRDxx; MQ can't be disabled) | `enablement.ts` | `products.test.ts` |
| Fictional MLC tier table, flat charge | `prices.ts` | `prices.test.ts` |
| IPLA one-time charge, S&S, no decrease, 3 licence types | `ipla.ts` | `prices.test.ts` |
| TFP Software Consumption baseline + year-end true-up | `tfp.ts` | `tfp.test.ts` |
| SCRT level check, audit penalty, hardware upgrade vs cap clause | `compliance.ts` | `compliance.test.ts` |
| One month end to end | `month.ts` | `month.test.ts` |
