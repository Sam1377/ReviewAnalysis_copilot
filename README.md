[README.md](https://github.com/user-attachments/files/29701028/README.md)
# Review Intelligence Dashboard

A local, runnable AI PM feedback-intelligence tool. Ingest reviews from **any CSV export, plain-text dump, or review screenshot** — mix and match, upload 20+ files at once — get a prioritized, weighted issue dashboard plus a BI-style analytics view, and use a real Groq API call to make sense of anything the keyword matcher can't categorize.

## Run it — frontend only (no AI re-analysis)

```bash
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173`). Everything works except the "Re-analyze uncategorized with AI" button.

## Run it — with AI re-analysis enabled

The AI re-analysis feature calls a real Groq API from a small local backend (never from the browser directly — that would expose your API key). To enable it:

1. Get a free API key from [console.groq.com/keys](https://console.groq.com/keys) — Groq has a genuinely free, rate-limited tier, no data-sharing opt-in needed
2. Copy `server/.env.example` to `server/.env` and paste your key in:
   ```
   GROQ_API_KEY=gsk_...
   ```
3. Run both the frontend and backend together:
   ```bash
   npm install
   npm run dev:full
   ```
   (or run them separately in two terminals: `npm run server` and `npm run dev`)

Now when reviews don't match the built-in keyword dictionary, click **"Re-analyze uncategorized with AI"** — it sends the uncategorized text to Claude, which assigns each one to the closest existing theme or proposes a genuinely new one, along with a severity score. Reclassified items get folded into the normal prioritized issue list, no longer stuck in "uncategorized."

## Rating vs. review mismatches

Some reviews contradict themselves — a 1-star rating next to "works great, very happy," or a 5-star rating next to a complaint. Rather than forcing these into whichever bucket the rating implies (which would put a genuinely good review in the "bad reviews" pile, or vice versa), they're detected up front and pulled out of every normal chart, theme cluster, and KPI. They show up in their own "Rating vs. review mismatches" section on the Analytics tab, labeled as "problem not specified by the customer — review reads positive despite the low rating" (or the mirror case for a high rating with negative text), with a count, a breakdown by type, and example reviews.

## Adaptive analytics dashboard

The Analytics tab no longer renders a fixed set of charts. It first profiles whatever dataset is loaded (timestamps? multiple sources? multiple sentiment classes? enough categorized volume?) and only renders a chart, KPI, or section if the data actually supports it — otherwise it shows a plain-language empty state explaining why (e.g. *"Only one sentiment class detected. Sentiment comparison is omitted."*).

What's new:
- **Executive summary** — a handful of bullet points generated deterministically from the same numbers the rest of the dashboard uses (auto-generated, no LLM call). An optional **"Write with AI"** button sends the aggregated KPI/insight JSON (never raw review text) to a new backend endpoint that asks Claude to turn it into prose.
- **Dynamic KPI cards** — only shown when supported: average rating needs a ratings column, critical-issue counts need severity data, "themes increasing" needs usable timestamps, etc.
- **Insight Confidence Engine** — every auto-detected insight and recommendation carries a confidence score derived from sample size (more mentions = higher confidence, capped below 100%), shown as a High/Medium/Low badge. Insights below a confidence floor are hidden rather than shown with a caveat.
- **Root cause analysis** — for the highest-priority themes, shows frequency, average severity, and one representative review.
- **Smart recommendations** — theme-specific, evidence-gated (minimum mention count) suggestions with a priority label and confidence score. No evidence, no recommendation.
- **Intelligent, adaptive empty states** — hidden trend charts, sentiment splits, or category breakdowns explain in plain language why they're absent instead of rendering blank or misleading charts.

This logic lives in `src/insights.js`, kept separate from rendering (`App.jsx`) so the profiling/insight/recommendation rules can be tested or extended independently of the UI.

## What's real vs. simulated

- **Real**: all file ingestion (CSV/TXT/images), column auto-detection, keyword-based theme classification, clustering, weighted priority scoring, status tracking, per-file removal, all charts and adaptive analytics logic, and — once your API key is set — real LLM-based classification of anything the keyword matcher misses, plus the optional AI-written executive summary.
- **Simulated**: the ~950-row starting dataset is synthetic sample data so the dashboard isn't empty on first load. Everything you upload (or reclassify) is processed for real.

## Ingestion — what it handles

| File type | How it's processed |
|---|---|
| `.csv` | Auto-detects the text column by name (`review_text`, `comment`, `feedback`, `description`, etc.) or, if no name matches, picks whichever column has the longest average text — works even with column names it's never seen. Also auto-detects date/rating/sentiment columns if present. |
| `.txt` | Splits on line breaks, treats each line over 15 characters as one review. |
| Images (`.png`/`.jpg`/`.jpeg`) — e.g. review screenshots | Runs on-device OCR (Tesseract.js) to extract text, then splits and classifies the same way. No data leaves your machine for OCR. |

Drop in 20+ files at once — they queue and process one after another with live progress per file. Each file can be individually removed after processing (✕ button), or clear everything you've uploaded with "Clear all uploads" — the synthetic starter dataset is untouched by either.

## Classification

A broadened, cross-domain keyword dictionary (crashes/bugs, delivery/shipping, support, product quality, returns/refunds, pricing, payment, login, performance, praise) tries to match each review first — this is instant and free. Anything that doesn't match is bucketed into "uncategorized" using the row's rating/sentiment if available, shown explicitly (never silently dropped), with a toggle to include/exclude it from analysis and a button to send it to Claude for real classification.

## Next steps toward production

This is still a prototype (no persistent database — state resets on refresh). To go further:
1. Add semantic embeddings for clustering, so two very differently-worded reports of the same bug get grouped together instead of relying on keyword/theme-label matching
2. Add a database so uploaded data, AI reclassifications, and status changes persist across sessions
3. Add a scheduled job hitting the official Apple App Store RSS feed for live data (Google Play has no clean official review API — an unofficial scraper library works but is against Play's ToS at scale, treat as an internal-tool decision)
4. Move the API key to a proper secrets manager if this ever goes beyond your own machine

Happy to help build any of these next.
