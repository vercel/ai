# AI SDK - Neon Provider

The **Neon provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Neon AI Gateway](https://neon.com).

The Neon AI Gateway is **branch-scoped**: each Neon project branch gets its own gateway host, and a platform token authorizes requests for that branch. The provider targets the gateway's unified, OpenAI-compatible endpoint, so a single model id gives you access to the entire foundation model catalog (Anthropic, OpenAI, Google, Meta, and more) served as `databricks-*` models.

## Setup

The Neon provider is available in the `@ai-sdk/neon` module. You can install it with

```bash
npm i @ai-sdk/neon
```

## Configuration

The gateway URL is branch-scoped, so it cannot be hardcoded. Provide it (and your platform token) via environment variables — both are shown in the Neon Console under the branch's **AI Gateway** tab:

```bash
# The branch host root (the provider appends the gateway path internally)
NEON_AI_GATEWAY_BASE_URL="https://<branch-id>-api.ai.<region>.aws.neon.tech"
# The platform token generated in the AI Gateway tab (shown once)
NEON_AI_GATEWAY_TOKEN="nt_live_..."
```

You can also pass them directly to `createNeon`:

```ts
import { createNeon } from '@ai-sdk/neon';

const neon = createNeon({
  baseURL: 'https://<branch-id>-api.ai.<region>.aws.neon.tech',
  apiKey: process.env.NEON_AI_GATEWAY_TOKEN,
});
```

## Provider Instance

You can import the default provider instance `neon` from `@ai-sdk/neon`:

```ts
import { neon } from '@ai-sdk/neon';
```

## Example

```ts
import { neon } from '@ai-sdk/neon';
import { generateText } from 'ai';

const { text } = await generateText({
  model: neon('databricks-claude-haiku-4-5'),
  prompt: 'Summarize Postgres for me.',
});
```

## Available Models

The authoritative, always-current catalog is shown in the Neon Console under the branch's **AI Gateway** tab. Model ids follow the `databricks-<model>` convention, for example:

- `databricks-claude-opus-4-8`, `databricks-claude-sonnet-4-6`, `databricks-claude-haiku-4-5`
- `databricks-gpt-5`, `databricks-gpt-5-mini`, `databricks-gpt-5-nano`
- `databricks-gemini-2-5-pro`, `databricks-gemini-2-5-flash`
- `databricks-llama-4-maverick`, `databricks-meta-llama-3-3-70b-instruct`

Any other catalog id can be passed as a plain string.

## Capabilities and limitations

The gateway is a single OpenAI-compatible endpoint that proxies to multiple upstream providers. The following work across the catalog:

- `generateText` / `streamText` (text, system prompts, multi-turn)
- Tool calling (single and multi-step, generate and stream)
- `generateObject` (structured output)
- Image (vision) input

Backend-specific notes:

- **`streamObject`** works for OpenAI, Google, and Meta models; Databricks-hosted Anthropic (Claude) models reject structured output while streaming — use `generateObject` instead.
- **Sampling parameters** are passed through, so they only work where the backend supports them (e.g. Anthropic rejects `temperature`+`topP` together and `frequencyPenalty`/`presencePenalty`/`seed`; OpenAI reasoning models require the default `temperature` and reject `stop`; `reasoningEffort` applies to OpenAI models). This matches how other AI SDK providers behave for unsupported parameters.
- **Image generation (`generateImage`) and embeddings (`embed`/`embedMany`) are not offered** by the gateway and throw `NoSuchModelError`.

## Documentation

For more information about the Neon AI Gateway, please visit:

- [Neon Documentation](https://neon.com/docs)
- [Neon Website](https://neon.com)
