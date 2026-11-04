# zSAM Usage Tracker

A simple web app for **IBM Z (mainframe) software asset managers** to track software usage against entitlements.
It runs entirely in your web browser (Safari on iPad works well). **Your data never leaves your device.** Nothing is uploaded and there is no server.

## What it does

| Tab | What you get |
|---|---|
| **Dashboard** | Licensed vs. peak MSU for each product, flagged *Over*, *Near limit*, *OK*, *Unused* or *Not entitled*. Tap a product to see a 12-month trend chart. |
| **Usage** | Import monthly usage from a CSV (SCRT-style). Re-importing a month replaces it, so totals are never double counted. |
| **Entitlements** | What you own: PID, pricing metric (MLC / IPLA / TFP), licensed MSU, annual cost, S&S renewal date. Add by hand or import a CSV. |
| **Unused** | Products you pay for with no usage in 3, 6 or 12 months, plus the annual cost at stake. Also low-use products and anything **used but not entitled**. |
| **Renewals** | S&S and renewal dates coming up in the next 30 to 365 days, next to each product's recent usage, so you can decide whether to renew. |
| **Data** | Back up to a file, restore, load sample data, or clear everything. |

## Try it in 30 seconds
1. Open the app (see *Turn on the website* below).
2. Tap **Load sample data**. The sample data is entirely fictional.
3. Explore the tabs.

## Turn on the website (GitHub Pages), from an iPad
1. In Safari, open this repository on github.com.
2. Tap **Settings**, then **Pages** (in the left menu; on a narrow screen you may need to scroll).
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
4. Set **Branch** to `main` and folder `/ (root)`, then tap **Save**.
5. Wait a minute or two, then refresh the page. GitHub shows your link, something like
   `https://phillc4911.github.io/zsam-usage-tracker/`.
6. Open the link in Safari. Tap **Share**, then **Add to Home Screen**, and it opens like an app.

> Free GitHub accounts can only publish Pages from a **public** repository. That's fine for this app, because only the code is public. Your usage and cost data stays in your browser and is never stored in the repository. Don't commit real company data files to the repo.

## Importing your data

### Usage CSV
One row per product, per LPAR, per month:

```
Month,CPC,LPAR,PID,Product,Peak_MSU
2026-10,CPC1,PRD1,5650-ZOS,z/OS,380
2026-10,CPC1,PRD2,5650-ZOS,z/OS,301
```

- **Month** can be `2026-10`, `202610`, `10/2026` or `Oct 2026`.
- **Peak_MSU** is the product's peak MSU for that month on that LPAR. On SCRT reports this is the product's *Max Contributor* or 4-hour rolling-average value.
- Header names are flexible. For example, `Product ID`, `SID` and `MSU` are also recognised. Comma, semicolon and tab-separated files all work.
- The dashboard adds all LPARs and CPCs together for each product and month.

**Getting this from SCRT:** open the SCRT CSV output in Excel or Numbers, copy the product rows (month, machine serial, LPAR or system, product ID, name, MSU) into the template above, and save as CSV. A future version could read the SCRT report directly.

### Entitlements CSV
```
PID,Product,Metric,Licensed_MSU,Annual_Cost,Renewal_Date,Contract,Notes
5650-ZOS,z/OS,MLC,900,1450000,2027-05-31,ABC-123,
```
- **Metric** is `MLC`, `IPLA`, `TFP` or `Other`.
- **Licensed_MSU**: for IPLA, the entitled capacity. For MLC or TFP, use your budgeted or defined capacity, so the app can warn you as usage gets close.
- **Renewal_Date** is `YYYY-MM-DD` (or `M/D/YYYY`).
- Importing a PID that already exists updates it.

Example files are in [`sample-data/`](sample-data/). Each tab also has a **Download blank template** button.

## Backing up
Data lives in the browser's storage on **this device only**. It isn't on your other devices, and it is lost if you clear Safari's website data.
Use **Data, then Export backup** regularly. On iPad the file saves to the Files app. **Restore backup** loads it on any device.

## Files in this repository
| File | Purpose |
|---|---|
| `index.html` | The page layout (tabs, forms, tables) |
| `styles.css` | Look and feel (supports light and dark mode) |
| `app.js` | All the logic: CSV import, analysis, charts, storage |
| `sample-data/` | Example CSV files showing the expected format (fictional data) |

## Ideas for later versions
- Read SCRT report CSVs and SMF type 89 extracts directly.
- Per-CPC entitlements and MLC cost estimates.
- Chargeback or showback by business unit or LPAR.
- What-if modelling, for example moving a workload between LPARs.
- Excel and PDF report export.
