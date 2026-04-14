# ShopGraph Authenticated Extraction

Authenticated product data extraction with per-field confidence scoring.

This example uses the [AI SDK](https://ai-sdk.dev/docs) with [Next.js](https://nextjs.org/) and [OpenAI](https://openai.com) to build a product research assistant. It extracts structured commerce data from any product URL via the [ShopGraph API](https://shopgraph.dev) and displays per-field confidence scores so you can see which data points are reliable and which need verification.

## How to use

1. Sign up at [ShopGraph](https://shopgraph.dev) and get an API key.
2. Get an [OpenAI API key](https://platform.openai.com/account/api-keys).
3. Copy `.env.example` to `.env.local` and fill in both keys.
4. Install dependencies and start the dev server:

```bash
pnpm install
pnpm dev
```

5. Paste a product URL into the chat input. The assistant will extract structured data and report confidence scores for each field.

## How it works

- The `extract_product` tool calls the ShopGraph REST API (`POST /api/enrich`) with the product URL.
- ShopGraph sends RFC 9421 signed requests to destination sites and returns structured product data with per-field confidence scores (0.0 to 1.0). Check [which sites extract successfully](https://shopgraph.dev/leaderboard) before using a new domain.
- The assistant uses `streamText` with `stopWhen: isStepCount(3)` to allow tool calling and then summarize the results.
- Fields with confidence below 0.85 are flagged in the UI with an amber indicator and a "verification recommended" note.

## ShopGraph API features not shown in this example

- **Server-side confidence filtering**: `?strict_confidence_threshold=0.85` scrubs low-confidence fields to `null` with an explanation — the server does the filtering instead of the client.
- **AgentReady scoring**: `?include_score=true` returns a 0-100 agent-readiness score across 6 dimensions (completeness, semantic richness, UCP compatibility, pricing clarity, inventory signals, access readiness).
- **UCP-compatible output**: `?format=ucp` returns data in Universal Commerce Protocol schema (Google + Shopify + 25 partners).
- **Leaderboard**: See which sites extract successfully at [shopgraph.dev/leaderboard](https://shopgraph.dev/leaderboard).

## Learn More

- [AI SDK docs](https://ai-sdk.dev/docs)
- [ShopGraph docs](https://shopgraph.dev/docs)
- [Next.js Documentation](https://nextjs.org/docs)
