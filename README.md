# TrueOdds

Compare live **Polymarket** probabilities against an **independent AI forecast** that is made *before* the model is allowed to see the market price.

The point is the gap. A model that is shown the market price first will anchor on it, and you learn nothing. TrueOdds withholds the price during research and estimation, reveals it only afterwards, and then asks for a review that is explicitly permitted — and instructed — to disagree.

---

## How the analysis works

| Stage | What happens | Market price visible to the model? |
|---|---|---|
| 1. Fetch | The exact question, description and resolution criteria are pulled from Polymarket. | — |
| 2. Research | The model searches the web: latest news, primary sources, historical base rates, evidence for YES, evidence for NO, and what it does not know. | **No** |
| 3. Estimate | It commits to a probability from 0–100% with a confidence level. | **No** |
| 4. Reveal | The Polymarket probability is disclosed. | Yes |
| 5. Review | It reviews the discrepancy under instructions that treat an unexplained gap as a *finding*, not an error — revision requires naming a specific reason. | Yes |

Stage 1 and 2 prompts are built by `src/lib/prompts.ts`, which constructs market context from a whitelist of non-price fields. Every price-bearing field (`outcomePrices`, `bestBid`, `bestAsk`, `spread`, `lastTradePrice`, `oneDayPriceChange`) is omitted by construction, not by filtering.

**Output for every analysis:** Polymarket probability · AI probability · percentage-point deviation · confidence · reasoning · YES evidence · NO evidence · uncertainties · base rates · cited sources · the full discrepancy review.

Both numbers are kept: the **blind** estimate and the **post-review** estimate. When a review revises the forecast, the UI marks where the blind estimate sat, so anchoring is visible rather than hidden.

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

That is the whole setup. Browsing markets needs no key at all (Polymarket's API is public); only **Analyze** requires `OPENROUTER_API_KEY`. Locally, analyses are written to `.data/analyses/` with no database to configure.

### Changing the model

Set one variable — no code changes:

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
   | `OPENROUTER_MODEL` | recommended | Defaults to `openai/gpt-4o-mini`. |
   | `UPSTASH_REDIS_REST_URL` | for durable history | See step 3. |
   | `UPSTASH_REDIS_REST_TOKEN` | for durable history | See step 3. |

3. **Add storage so forecasts persist.** Vercel's filesystem is ephemeral, so without a database the app falls back to an in-memory store and the dashboard warns you. Open the Vercel **Storage** tab → create an **Upstash Redis** database (free tier is ample) → connect it to the project. The integration sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which this app reads as aliases. Or create a database directly at [upstash.com](https://upstash.com) and paste the two REST values.

4. **Deploy.** Visit `/api/health` afterwards to confirm the model, web-search flag and store driver resolved as expected.

### Function duration

`POST /api/analyze` sets `maxDuration = 300`, since a research-backed run makes two LLM calls and typically takes 30–120 seconds. 300s is the Fluid Compute ceiling on Vercel's Hobby plan. If your plan or host caps function duration lower, reduce `maxDuration` in `src/app/api/analyze/route.ts` and lower `OPENROUTER_TIMEOUT_MS` to match.

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
| `POST /api/analyze` `{ marketId, model? }` | Runs the workflow. Streams NDJSON: `{type:"stage"}` events, then `{type:"result"}` or `{type:"error"}`. `model` overrides `OPENROUTER_MODEL` for one run. |
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
- **Cost.** Each analysis is two LLM calls, the first with web search. Cost depends entirely on `OPENROUTER_MODEL` — check its pricing on OpenRouter before running many analyses.
- **Calibration is not verified.** TrueOdds records forecasts; it does not yet score them against resolved outcomes. Every record stores the market price at analysis time, so retrospective scoring is possible once markets resolve.
- **These are model estimates, not advice.** A confident-looking probability with cited sources can still be wrong.
