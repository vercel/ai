# Personal AI

A small, locally run assistant built with the AI SDK. Choose OpenAI, Google Gemini, or Anthropic Claude for everyday chat and coding help. Research mode uses each provider's built-in web search and displays source links. Tasks mode asks the model for an actionable checklist that you can check off; it does not run commands or perform actions on your computer.

## Run locally

From the repository root:

```bash
cp examples/personal-ai/.env.example examples/personal-ai/.env.local
```

Add at least one API key to `examples/personal-ai/.env.local`:

```dotenv
OPENAI_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
ANTHROPIC_API_KEY=...
```

For Google Gemini, `GEMINI_API_KEY` is also accepted as an alternative to
`GOOGLE_GENERATIVE_AI_API_KEY`.

Then start the app:

```bash
pnpm install
pnpm --filter @example/personal-ai dev
```

Open [http://localhost:3000](http://localhost:3000). Keys are read only by the local server, and the settings panel reports which providers are configured without exposing key values. Restart the dev server after changing `.env.local`.

The current conversation and task plans are stored in the browser's local storage. Research requires a provider key and the provider's built-in web-search capability. No API key is required just to open the interface.
