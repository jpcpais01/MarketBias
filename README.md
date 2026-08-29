# TrueOdds

Compare live **Polymarket** probabilities against an **independent AI forecast** that is made *before* the model is allowed to see the market price.

The point is the gap. A model that is shown the market price first will anchor on it, and you learn nothing. TrueOdds withholds the price during research and estimation, reveals it only afterwards, and then asks for a review that is explicitly permitted — and instructed — to disagree.

---

## How the analysis works

**Nothing is researched automatically.** Browsing calls Polymarket's API only — zero LLM calls, zero cost. A market is analysed when, and only when, you press **Research** on that card.

| Stage | What happens | Market price visible to the model? |
|---|---|---|
| 1. Fetch | The exact question, description and resolution criteria are pulled from Polymarket. | — |
| 2. Research | The model searches the web: latest news, primary sources, historical base rates, evidence for YES, evidence for NO, and what it does not know. Runs N times in parallel if you ask for more than one. | **No** |
| 3. Estimate | Each run commits to a probability from 0–100% with a confidence level; the runs are averaged. | **No** |
| 4. Reveal | The Polymarket probability is disclosed. | Yes |
| 5. Review | It reviews the discrepancy under instructions that treat an unexplained gap as a *finding*, not an error — revision requires naming a specific reason. | Yes |

Stage 1 and 2 prompts are built by `src/lib/prompts.ts`, which constructs market context from a whitelist of non-price fields. Every price-bearing field (`outcomePrices`, `bestBid`, `bestAsk`, `spread`, `lastTradePrice`, `oneDayPriceChange`) is omitted by construction, not by filtering.

**Output for every analysis:** Polymarket probability · AI probability · percentage-point deviation · confidence · reasoning · YES evidence · NO evidence · uncertainties · base rates · cited sources · the full discrepancy review.

Both numbers are kept: the **blind** estimate and the **post-review** estimate. When a review revises the forecast, the UI marks where the blind estimate sat, so anchoring is visible rather than hidden.

### Averaging several runs

A single LLM forecast is noisy — the same question asked twice can differ by 15 points. The **runs** selector on the dashboard runs N independent forecasts *in parallel* and averages them.

- Each run is a separate request that cannot see the others, so the runs are genuinely independent rather than one model talking itself into a number.
- They are issued concurrently, so 5 runs take roughly the wall time of 1 — but **cost 5×**.
- Failures are tolerated: if 4 of 5 return, the analysis proceeds on those 4 and records that one failed.
- The result reports mean, median, range and **standard deviation**. The σ is the useful part: it measures how much the model disagrees *with itself*, which is a different question from the confidence it reports about the world. A tight spread that still disagrees with the market is a much stronger signal than a wide one.
- Evidence, uncertainties and sources are pooled across all runs; the narrative reasoning is taken from the run nearest the mean, so the prose stays consistent with its number rather than being stitched together.
- The spread is passed to the discrepancy review, which is told to treat a wide spread as grounds for holding the estimate loosely.

Set the default with `ANALYSIS_SAMPLE_RUNS` (default `1`); users can override it per research run in the UI, up to `ANALYSIS_MAX_SAMPLE_RUNS` (default `8`).

---

## Quick start

```bash
git clone https://github.com/jpcpais01/MarketBias.git
cd MarketBias
npm install

cp .env.example .env.local
# edit .env.local and set OPENROUTER_API_KEY

npm run dev          # http://localhost:3000
```

That is the whole setup. Browsing markets needs no key at all (Polymarket's API is public); only **Research** requires `OPENROUTER_API_KEY`. Locally, analyses are written to `.data/analyses/` with no database to configure.

### The model

Defaults to [`deepseek/deepseek-v4-flash-0731`](https://openrouter.ai/deepseek/deepseek-v4-flash-0731) — no configuration needed. To use a different one, set a single variable; no code changes:

```bash
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
```

Any id from [openrouter.ai/models](https://openrouter.ai/models) works. Pick a model that follows JSON instructions reliably; the workflow parses structured output at both stages. Web research is provided by OpenRouter's provider-agnostic `web` plugin (`OPENROUTER_ENABLE_WEB_SEARCH=true`), so it works with models that have no native search. If your model searches natively (e.g. `perplexity/sonar-reasoning`), you can turn the plugin off to avoid paying twice.

---

## Deploying to Vercel

1. **Push the repo** to GitHub, then import it at [vercel.com/new](https://vercel.com/new). Next.js is detected automatically — no build settings to change.

2. **Add environment variables** (Project → Settings → Environment Variables):

   | Variable | Required | Notes |
   |---|---|---|
   | `OPENROUTER_API_KEY` | yes | Server-side secret. Never use a `NEXT_PUBLIC_` prefix. |
   | `OPENROUTER_MODEL` | no | Defaults to `deepseek/deepseek-v4-flash-0731`. |
   | `UPSTASH_REDIS_REST_URL` | for durable history | See step 3. |
   | `UPSTASH_REDIS_REST_TOKEN` | for durable history | See step 3. |

   Only the first is required. Those four are the whole list. Everything else in `.env.example` is commented out and documents a default — **do not add them to Vercel unless you are changing the value**. If you pasted the whole file into Vercel's import box and ended up with a dozen variables, delete every one except the four above; they are all optional, and one of them (`OPENROUTER_API_KEY=sk-or-v1-replace-me`) is a placeholder that will fail every request until you replace it.

3. **Add storage so forecasts persist.** Vercel's filesystem is ephemeral, so without a database the app falls back to an in-memory store and the dashboard warns you. Open the Vercel **Storage** tab → create an **Upstash Redis** database (free tier is ample) → connect it to the project. The integration sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which this app reads as aliases. Or create a database directly at [upstash.com](https://upstash.com) and paste the two REST values.

4. **Deploy.** Visit `/api/health` afterwards to confirm the model, web-search flag and store driver resolved as expected.

### Function duration

`POST /api/analyze` sets `maxDuration = 300`, since a research-backed run makes N + 1 LLM calls and typically takes 30–120 seconds. Parallel runs overlap, so raising the run count costs money rather than time. 300s is the Fluid Compute ceiling on Vercel's Hobby plan. If your plan or host caps function duration lower, reduce `maxDuration` in `src/app/api/analyze/route.ts` and lower `OPENROUTER_TIMEOUT_MS` to match.

The route streams NDJSON progress events, so the user sees each stage as it happens rather than a spinner that might be dead.

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                    Dashboard — market browser + status
│   ├── history/page.tsx            Every saved forecast, newest first
│   └── api/
│       ├── markets/                GET list/search · GET :id
│       ├── analyze/                POST — streams NDJSON progress, then the result
│       ├── analyses/               GET history · GET :id
│       └── health/                 GET non-secret config status
├── components/                     Presentational + client-side state
└── lib/
    ├── env.ts                      Server-only config; the API key stops here
    ├── polymarket.ts               Gamma API client + defensive normalisation
    ├── openrouter.ts               Chat client + tolerant JSON extraction
    ├── prompts.ts                  The two-stage prompts (price withheld in stage 1)
    ├── analysis.ts                 Workflow orchestration + coercion
    ├── format.ts                   Shared display formatting
    └── store/                      Append-only persistence (3 drivers)
```

### Security

- `OPENROUTER_API_KEY` is read only in `src/lib/env.ts`, which imports `server-only` — a client-side import of it fails the build. The key never reaches the browser and never appears in an API response.
- The browser calls `/api/analyze` with a market id; it cannot choose an arbitrary upstream URL or inject prompts.
- `/api/health` reports the model name and whether a key is *configured*, never the key itself.
- Model output is rendered as text, never as HTML.

### Storage

Three drivers behind one interface (`src/lib/store/`), chosen automatically:

| Driver | When | Durable |
|---|---|---|
| `upstash` | Upstash/KV REST credentials present | yes |
| `fs` | Local development | yes |
| `memory` | Serverless with no credentials | no — dashboard warns |

Every analysis is saved under a fresh UUID and pushed onto a history list. **Nothing is ever updated in place**: re-analysing a market appends a new timestamped forecast beside the old ones, and each record snapshots the market price as it stood at that moment. Adding another backend means implementing the `AnalysisStore` interface and registering it in `store/index.ts`.

---

## API reference

| Endpoint | Description |
|---|---|
| `GET /api/markets?q=&limit=&offset=&order=&ascending=` | Active binary markets. `q` filters a bounded pool of top-volume markets. |
| `GET /api/markets/:id` | One market, normalised. |
| `POST /api/analyze` `{ marketId, model?, runs? }` | Runs the workflow. Streams NDJSON: `{type:"stage"}` and `{type:"sample"}` events, then `{type:"result"}` or `{type:"error"}`. `model` overrides `OPENROUTER_MODEL`; `runs` overrides `ANALYSIS_SAMPLE_RUNS`, clamped server-side to `ANALYSIS_MAX_SAMPLE_RUNS`. |
| `GET /api/analyses?marketId=&limit=&offset=` | Saved forecasts, newest first. |
| `GET /api/analyses/:id` | One saved forecast. |
| `GET /api/health` | Model, web-search flag, key-configured flag, store driver. |

---

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # serve the production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

---

## Notes and limitations

- **Search scope.** Gamma's `/markets` endpoint has no text-query parameter, so search scans a bounded pool (500) of the highest-volume active markets and filters locally. It finds active, liquid markets well; it will not find an obscure long-tail market.
- **Binary markets only.** The workflow forecasts one YES probability, so multi-outcome markets are filtered out of listings.
- **Cost.** Each analysis is N + 1 LLM calls (N parallel blind forecasts plus one review), the blind ones with web search. Cost depends entirely on `OPENROUTER_MODEL` and your runs setting — check pricing on OpenRouter before running many analyses at 5×.
- **Calibration is not verified.** TrueOdds records forecasts; it does not yet score them against resolved outcomes. Every record stores the market price at analysis time, so retrospective scoring is possible once markets resolve.
- **These are model estimates, not advice.** A confident-looking probability with cited sources can still be wrong.
