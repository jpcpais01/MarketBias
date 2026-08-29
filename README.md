# TrueOdds

Compare live **Polymarket** probabilities against an **independent AI forecast** that is made *before* the model is allowed to see the market price.

The point is the gap. A model that is shown the market price first will anchor on it, and you learn nothing. TrueOdds withholds the price during research and estimation, reveals it only afterwards, and then asks for a review that is explicitly permitted — and instructed — to disagree.

---

## How the analysis works

**Nothing is researched automatically.** Browsing calls Polymarket's API only — zero LLM calls, zero cost. A market is analysed when, and only when, you press **Research** on that card.

| Stage | What happens | Market price visible to the model? |
|---|---|---|
| 1. Fetch | The exact question, description and resolution criteria are pulled from Polymarket. | — |
| 2. Research | **Once per analysis**, with web search: latest news, primary sources, base rates, evidence for YES, evidence for NO, and open questions. Produces a brief with deliberately no probability in it. | **No** |
| 3. Estimate | N independent calls judge that same brief and each commits to a probability; the results are averaged. | **No** |
| 4. Reveal | The Polymarket probability is disclosed. | Yes |
| 5. Review | It reviews the discrepancy under instructions that treat an unexplained gap as a *finding*, not an error — revision requires naming a specific reason. | Yes |

Stage 1 and 2 prompts are built by `src/lib/prompts.ts`, which constructs market context from a whitelist of non-price fields. Every price-bearing field (`outcomePrices`, `bestBid`, `bestAsk`, `spread`, `lastTradePrice`, `oneDayPriceChange`) is omitted by construction, not by filtering.

**Output for every analysis:** Polymarket probability · AI probability · percentage-point deviation · confidence · reasoning · YES evidence · NO evidence · uncertainties · base rates · cited sources · the full discrepancy review.

Both numbers are kept: the **blind** estimate and the **post-review** estimate. When a review revises the forecast, the UI marks where the blind estimate sat, so anchoring is visible rather than hidden.

### What is sent to the model

The full market record is fetched from Gamma, but stage 1 receives only the
non-price fields — assembled by a whitelist in `src/lib/prompts.ts`, so a new
price field cannot leak in by being added to the type:

| Sent to the blind forecaster | Withheld until stage 2 |
|---|---|
| Question (verbatim) | YES probability / outcome prices |
| **Full description and resolution criteria** | Best bid, best ask, spread |
| Resolution source, when published | Last trade price, 24h price change |
| Resolution date and days remaining | — |
| Outcome labels, parent event title | — |

The description matters most: markets frequently resolve on wording stricter
than the headline question, and the prompt tells the model to read it for
exactly that. It is sent in full, untruncated.

### Filtering out noisy markets

Polymarket carries a long tail of recurring markets — daily temperature,
hourly "up or down" crypto ticks, tweet counts — that crowd out questions
worth researching. These are hidden by default and the dashboard shows how
many, with one tap to reveal them.

The keyword list lives in `src/lib/filters.ts` and is matched against the
question and event title. Replace it wholesale with `MARKET_EXCLUDE_KEYWORDS`
(comma-separated), or turn filtering off with `MARKET_FILTER_NOISE=false`.

### Averaging several runs

A single LLM forecast is noisy — the same question asked twice can differ by 15 points. The **runs** selector runs N estimates and averages them.

**The web research happens once and is shared.** Searching the web N times would be slow and expensive for very little gain, since each search returns much the same material. So one research pass builds the evidence brief, and every estimate run judges that same brief:

```
research (1 web call, slow) → estimate ×N (parallel, no web, fast) → review (1 call)
```

- 5 runs means **one** web search, not five. Verified: 5 runs issue exactly 1 search-enabled call.
- The estimate calls run concurrently and skip search, so extra runs add little time.
- Failures are tolerated: if 4 of 5 return, the analysis proceeds on those 4 and records the failure.
- Estimates run at a higher temperature (`OPENROUTER_ESTIMATE_TEMPERATURE`, default 0.8) than research and review (0.2). On a fixed evidence base, sampling is the only remaining source of variation — at a low temperature the runs would collapse onto one number and the spread would mean nothing.

**What the spread does and does not tell you.** Because the runs share an evidence base, the standard deviation measures how much the model's *judgement* varies on fixed evidence — not how much its *research* varies. That is a narrower claim than "N independent forecasts agreed", and the UI says so rather than implying the stronger one. It is still the useful number: a tight spread that nonetheless disagrees with the market is a stronger signal than a wide one, and the spread is passed to the review stage, which is told to hold a widely-spread mean loosely.

The brief contains **no probability** by construction — a number there would anchor every run to it and destroy the point of sampling. The narrative reasoning shown comes from the run nearest the mean, so the prose stays consistent with its number instead of being stitched together.

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

`POST /api/analyze` sets `maxDuration = 300`. A run typically takes 30–120 seconds, nearly all of it the single web-research call; the estimate calls are parallel and searchless, so raising the run count barely moves the total. 300s is the Fluid Compute ceiling on Vercel's Hobby plan. If your plan or host caps function duration lower, reduce `maxDuration` in `src/app/api/analyze/route.ts` and lower `OPENROUTER_TIMEOUT_MS` to match.

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
    ├── filters.ts                  Keyword filter for recurring noisy markets
    ├── analysis.ts                 Workflow orchestration + coercion
    ├── format.ts                   Shared display formatting
    └── store/                      Append-only persistence (3 drivers)
```

### Interface

Dark, glass-forward, and built mobile-first: a bottom tab bar on phones, a
sticky search bar, and results in a bottom sheet (a right-hand panel on
desktop) split into **Summary / Evidence / Sources** so the numbers and
reasoning answer the question without scrolling past everything else.

The blur is deliberately rationed. `backdrop-filter` is applied to exactly
three fixed elements — app bar, tab bar, sheet — while cards use layered
translucency with no filter, because a blur behind every card in a scrolling
list drops frames on phones. The blur classes come from Tailwind rather than
hand-written CSS: hand-written declarations compiled down to
`-webkit-backdrop-filter` alone, which would have left Firefox with a
see-through bar and text scrolling visibly behind it. Browsers without
`backdrop-filter` at all fall back to a near-opaque bar.

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
| `GET /api/markets?q=&limit=&offset=&order=&ascending=&includeNoisy=` | Active binary markets, noisy ones excluded. `q` filters a bounded pool of top-volume markets; `includeNoisy=true` bypasses the keyword filter. Responses carry `hidden`, the number withheld. |
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
- **Cost.** Each analysis is N + 2 LLM calls: one research call (the only one that searches the web), N estimate calls, and one review. The search call dominates the cost, and there is only ever one, so raising the run count is far cheaper than it looks. Check your model's pricing on OpenRouter regardless.
- **Calibration is not verified.** TrueOdds records forecasts; it does not yet score them against resolved outcomes. Every record stores the market price at analysis time, so retrospective scoring is possible once markets resolve.
- **These are model estimates, not advice.** A confident-looking probability with cited sources can still be wrong.
