# Next.js + AI SDK + Browser Use

A minimal example showing how to give the AI SDK a real cloud browser as a tool, via [Browser Use](https://browser-use.com).

The chat agent has one tool, `runBrowserTask`, that takes a natural-language instruction and runs it in a real Chromium session in the cloud (login state, JS, anti-bot handling). Tool progress streams back to the UI step-by-step.

## Setup

1. Get a Browser Use API key at [cloud.browser-use.com/settings](https://cloud.browser-use.com/settings?tab=api-keys&new=1).
2. Get an OpenAI API key.
3. Copy env:

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in `BROWSER_USE_API_KEY` and `OPENAI_API_KEY`.

4. Run:

   ```bash
   pnpm install
   pnpm dev
   ```

Open <http://localhost:3000> and ask the agent something that needs the live web, e.g. _"find the top 3 trending repos on github today and return name + stars"_.
