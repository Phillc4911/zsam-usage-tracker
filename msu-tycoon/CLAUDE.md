# MSU Tycoon — build brief for Claude Code

A browser game that teaches IBM Z software licensing by making the player run it. The player is the software asset manager for a fictional bank's mainframe for 12 in-game months. Every decision they make (capping, moving batch, choosing a pricing model, answering an audit) changes a simulated monthly software bill that follows the real rules of sub-capacity pricing.

The learner is an experienced z/OS sysadmin (storage, tape, catalogs) moving into SAM. Don't explain what an LPAR or SMF is. Do explain licensing rules every time they bite.

## Non-negotiables

1. **Real rules, fake prices.** The mechanics (R4HA, defined capacity, MLC vs IPLA, TFP consumption) must behave like the real thing, as described in `content/licensing-facts.json`. All money is in fictional **credits** from a made-up price table. Never present a number as an IBM list price.
2. **No real company branding.** Use IBM product *names* and real metric names in teaching text (z/OS, Db2, CICS, MQ, SCRT, AWLC, TFP) since that is what's being learned. Do not use logos, the IBM 8-bar mark, or vendor wordmarks. Third-party vendors in the game are fictional ("Vendor A: Granite Systems", "Vendor B: Northwind Mainframe"). The facts file explains which real models they mirror.
3. **Every consequence explains itself.** When the bill changes, an audit lands, or a choice backfires, show a one-to-three sentence "Why" that names the rule, linking to the codex entry.
4. **iPad first.** Touch targets ≥ 44px, works in Safari landscape and portrait, no hover-only interactions, no keyboard required. Installable as a PWA and playable offline.
5. **Facts come from the facts file.** Don't add licensing claims that aren't in `content/licensing-facts.json`. If a feature needs a fact that isn't there, add a `TODO(fact)` and ask me.

## Stack

- Vite + TypeScript + React 18. State in a single reducer (`useReducer` or Zustand), no backend.
- Canvas or SVG for charts (hand-rolled SVG is fine; no heavy chart library needed).
- Vitest for the simulation engine. The engine lives in `src/engine/` and is pure functions with no React imports.
- `vite-plugin-pwa` for offline/installable.
- Save game in `localStorage` (wrapped in try/catch), plus Export / Import save as a JSON string the player can copy.
- Build output is a static `dist/` folder.

## Visual direction

An ISPF / 3270 panel aesthetic: black screen, the ISPF color set (turquoise labels, green input, yellow headings, red errors, blue/pink accents), the VT323 font for headings and numbers, IBM Plex Mono for body text. Panels have a title line, an `Option ===>` line, and a PF-key bar along the bottom (F1=Help opens the codex, F3=Back, F7/F8 page). Make PF keys real tap buttons. One deliberate flourish: the monthly SCRT report "prints" line by line like a job's SYSOUT.

## Core loop (one in-game month)

1. **Briefing.** Event cards for the month, e.g. "Quarter-end batch on PROD1 days 28–31", "New mobile banking app goes live on PROD2", "Vendor B announces an audit".
2. **Plan.** The player adjusts levers:
   - Defined capacity (soft cap) per LPAR, or a group capacity across LPARs.
   - Move a batch workload to a different time window (costs ops goodwill if moved into the online day).
   - Enable or disable products per LPAR (product enablement, like IFAPRDxx). Products that don't use product registration (MQ) can't be disabled this way; the UI must teach this when tried.
   - Buy IPLA capacity (one-time charge + annual support). It can never be reduced later.
   - Once a year, at renewal: stay on AWLC-style MLC or switch to a Tailored Fit Pricing consumption deal.
3. **Run.** Simulate the month in 5-minute intervals. Show a fast-forward animation of the LPAR MSU graph with the rolling 4-hour average drawn on top. Capping visibly flattens the line, and delayed work piles up as a "work behind" bar.
4. **Report.** An SCRT-style report: per product, the peak R4HA hour, the LPARs that contributed, and billed MSU. Then the invoice in credits, an SLA score, and audit exposure.
5. **Debrief.** Three "Why" callouts tied to codex entries, and one quiz question drawn from that month's topic.

## Simulation rules (implement in `src/engine/`)

Keep these exact. Unit-test each one.

- **Intervals.** 288 five-minute intervals per day. A month is 28–31 days.
- **LPAR consumption.** Each LPAR's demand per interval = baseline profile (online daytime curve + overnight batch) + event modifiers + noise from a seeded RNG (seed shown in settings so a run is reproducible).
- **R4HA.** For each LPAR and interval, R4HA = mean of that LPAR's consumed MSU over the last 48 intervals (4 hours). Before 48 intervals exist at the start of the month, use the available ones. (Simplification, noted in codex.)
- **Defined capacity (soft cap).** If an LPAR's R4HA is above its defined capacity, cap the LPAR's consumption in the next interval to the defined capacity. Demand above that is deferred to "work behind" and released when there is room. Work still behind at the end of a business window costs SLA points.
- **Group capacity.** Same as above, but the cap applies to the sum of R4HAs of LPARs in the group.
- **Product hourly value.** For each clock hour, a product's value = sum of the R4HA (at the end of that hour) of every LPAR where the product ran during that hour. A product "runs" on an LPAR if it's enabled there and the LPAR's workload uses it that hour.
- **Billed MSU (MLC sub-capacity).** The product's highest hourly value in the reporting month, rounded to whole MSU.
- **MLC price.** Fictional tiered per-MSU price that falls as MSU rises (like the real AWLC tier curve). Put the tier table in `src/engine/prices.ts`, clearly labeled fictional. Charge = sum across tiers.
- **Flat-charge product (FWLC-style).** Fixed credits per month regardless of MSU.
- **IPLA products.** One-time charge per MSU of licensed capacity + annual support at a fixed percentage. Licensed capacity can only increase. Model three types:
  - reference-based (licensed for the LPARs where its parent product runs; e.g. a Db2 tool follows Db2),
  - execution-based (LPARs where it runs itself),
  - z/OS-based (LPARs where z/OS runs).
  If usage exceeds licensed capacity, that's audit exposure, not an automatic charge.
- **TFP Software Consumption (simplified).** Annual MSU baseline agreed at switch time. Each month, bill = baseline / 12 at a fixed rate. At year end, consumed MSU (sum of hourly MSU) above the baseline is billed at a lower "growth" rate. Capping gives no cost benefit under this model, and the "Why" should say so.
- **SCRT version check.** Each month there's a small chance an event says "New SCRT level available". If the player doesn't apply it before the report, the report is flagged non-compliant (audit exposure +). Teaches: IBM requires the current SCRT level.
- **Audits.** A vendor audit asks for N months of reports. Archived reports (the player must tick "archive" each month or turn on auto-archive, which costs a little ops time) count as evidence. Missing months mean the vendor can claim full-capacity pricing for those months: show the difference as the penalty.
- **Hardware upgrade event.** Moving to a newer machine raises MSU ratings. Full-capacity ISV contracts without a cap clause go up even with flat workload. Contracts negotiated with a cap don't.

Write golden tests in `src/engine/__tests__/` with hand-computed small cases (e.g. 2 LPARs, 1 day, known numbers) for R4HA, capping, product hourly sum, billed MSU, tier pricing, IPLA no-decrease, TFP true-up.

## Other modes (unlocked as the campaign progresses)

- **Inventory Reconciler** (unlocks month 3). Four columns: enabled products (IFAPRDxx), SMF 89 registered products, SCRT product list, entitlements. Player drags each mismatch into a bin: Compliance risk / Savings / Data problem. Scored, with "Why".
- **Audit Triage** (unlocks month 6). Fast card game using `auditCards` from the facts file.
- **Quiz Blitz** (always available). Timed multiple choice from `quiz` in the facts file, filterable by topic.

## Codex

A searchable in-game glossary built from `codex` in the facts file. Each entry has a short definition, a "how it plays in this game" line, and a source link. Entries unlock when first encountered and are tappable from any "Why" callout.

## Scoring and ending

Three meters over the year: **Spend** (credits vs budget), **Service** (SLA), **Exposure** (audit risk). End-of-year screen shows a rank (Operator → Junior Sysprog → Licence Analyst → SAM Lead → Audit-Proof) and a recap: biggest saving, most expensive mistake, and which rules the player hasn't triggered yet.

## Milestones (stop and show me after each)

1. Engine + tests only, with a tiny debug page that renders one LPAR's MSU and R4HA for one day.
2. One playable month end to end (briefing → plan → run → report → debrief), ugly is fine.
3. Full 12-month campaign, save/load, codex.
4. ISPF visual pass, the SYSOUT report animation, PWA, iPad check.
5. Extra modes.

## Done means

- `npm test` passes, with golden tests for every rule above.
- `npm run build` produces a static site that works offline after first load.
- Plays through 12 months on an iPad-sized viewport (1024×768 and 768×1024) with no horizontal scroll and nothing clipped.
- Every number that affects the bill can be traced on screen to the rule that produced it.
