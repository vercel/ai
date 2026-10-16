# Product Extraction with Per-Field Confidence Scoring

When your app shows product data extracted from any URL, how does the UI
tell users which fields to trust?

This example uses the [AI SDK](https://ai-sdk.dev/docs) with
[Next.js](https://nextjs.org/) and [OpenAI](https://openai.com) to build
a product research assistant. It extracts structured commerce data via the
[ShopGraph API](https://shopgraph.dev) and renders per-field confidence
scores so users can see which data points are reliable and which need
verification.

## The problem

LLMs hallucinate product data. A price pulled from Schema.org markup is
more reliable than a price inferred from page text. But most extraction
APIs return flat JSON with no indication of source quality. Your app
either trusts everything (risky) or trusts nothing (useless).

## The pattern

ShopGraph returns a confidence score (0.0 to 1.0) for every extracted
field, based on extraction method and source quality. Your UI uses these
scores to render trust indicators:

- Confidence >= 0.85: display normally (extracted from structured data)
- Confidence < 0.85: amber flag, "verification recommended"

The confidence contract means your frontend makes rendering decisions
based on data quality, not guesswork.

## How to use

1. Get a ShopGraph API key at [shopgraph.dev](https://shopgraph.dev).
   Playground: 50 calls/month, no signup. Starter: $99/month for 10K calls.
2. Get an [OpenAI API key](https://platform.openai.com/account/api-keys).
3. Copy `.env.example` to `.env.local` and fill in both keys.
4. Install dependencies and start the dev server:

```bash
pnpm install
pnpm dev
```

5. Paste a product URL into the chat input. The assistant extracts
   structured data and reports confidence scores for each field.

Check [which sites extract successfully](https://shopgraph.dev/leaderboard)
before trying a new domain.

## How it works

1. The `extract_product` tool calls ShopGraph's REST API with the product URL.
2. ShopGraph runs a three-tier extraction pipeline (structured markup, LLM,
   headless browser) and returns product data with per-field confidence scores.
3. The assistant uses `streamText` with `stopWhen: isStepCount(3)` to call
   the tool, then summarize the results.
4. The UI renders each field with a confidence badge. Fields below 0.85
   get an amber indicator and "verification recommended" note.

## ShopGraph API features not used in this example

These are available but intentionally omitted to keep the example focused
on client-side confidence rendering:

- **Server-side confidence filtering**: Add `?strict_confidence_threshold=0.85`
  to scrub low-confidence fields from the response before they reach your app.
  Use this when an agent acts autonomously on extracted data (no human review).
  See the [LangChain procurement cookbook](https://github.com/langchain-ai/cookbooks)
  for this pattern.
- **AgentReady scoring**: Add `?include_score=true` for a 0-100 readiness
  score across completeness, semantic richness, UCP compatibility, pricing
  clarity, and inventory signals.
- **UCP output**: Add `?format=ucp` for Universal Commerce Protocol schema.

## Learn More

- [AI SDK docs](https://ai-sdk.dev/docs)
- [ShopGraph](https://shopgraph.dev)
- [ShopGraph Leaderboard](https://shopgraph.dev/leaderboard) (site compatibility)
- [Next.js docs](https://nextjs.org/docs)
