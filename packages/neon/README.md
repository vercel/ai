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

## Routing

The Neon gateway exposes provider-native endpoints alongside a unified, OpenAI-compatible MLflow endpoint. To maximize feature coverage (and support models that are only served natively, such as **Codex**), the provider routes each model to the best endpoint based on its id:

| Model family | Endpoint | Why |
| --- | --- | --- |
| Anthropic (`databricks-claude-*`) | native Messages API | streaming structured output + native reasoning |
| OpenAI (`databricks-gpt-*`, `*-codex`) | native Responses API | Codex (native-only), native reasoning, image-gen tool |
| Everything else (Gemini, Llama, Qwen, gpt-oss, ...) | unified MLflow endpoint | broad coverage; Gemini is here because its native gateway endpoint does not support streaming |

This is transparent — you always use the same `neon('databricks-...')` call, the same base URL, and the same token.

## Capabilities and limitations

Verified across Anthropic, OpenAI (incl. Codex), Google, and Meta models:

- `generateText` / `streamText` (text, system prompts, multi-turn)
- Tool calling (single and multi-step, generate and stream)
- `generateObject` / `streamObject` (structured output)
- Image (vision) input

Notes:

- **Sampling parameters**: native-routed models use the official provider's parameter handling. For MLflow-routed models the provider detects the family and **drops unsupported parameters with an AI SDK warning** (`result.warnings`) instead of failing — e.g. Meta (Llama) drops `frequencyPenalty`/`presencePenalty`/`seed`; `reasoningEffort` is dropped for Gemini. Unknown models pass through unchanged.
- **Image generation (`generateImage`) and embeddings (`embed`/`embedMany`) are not offered** by the gateway and throw `NoSuchModelError`. (Image generation is available only as the OpenAI Responses `image_generation` *tool*, and is currently limited by the gateway's response-size cap.)
- **`gpt-oss-*`** models return a non-standard response shape on the unified endpoint and are not fully supported.

## Documentation

For more information about the Neon AI Gateway, please visit:

- [Neon Documentation](https://neon.com/docs)
- [Neon Website](https://neon.com)
