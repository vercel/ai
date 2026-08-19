---
title: Neon AI Gateway
description: Learn how to use the Neon AI Gateway provider for the AI SDK.
---

# Neon AI Gateway

[Neon AI Gateway](https://neon.com/docs/ai-gateway/overview) is a model gateway built into Neon. A branch-scoped Neon credential gives you access to models from OpenAI, Anthropic, Google, Meta, Alibaba, and other providers. The Neon provider for the AI SDK routes each model to the gateway endpoint it needs.

It supports text generation, streaming, tool calls, structured output, and image input. Models are referenced by short IDs such as `gpt-5-mini` or `gemini-3-5-flash` regardless of who hosts them, and every request is scoped to your Neon branch.

<Note>
  Neon AI Gateway is in beta. To use it, you need a paid Neon plan and a project
  in the AWS US East (Ohio) region (`aws-us-east-2`). Inference is free during
  the beta. Neon documents the current availability and pricing on the [AI
  Gateway overview](https://neon.com/docs/ai-gateway/overview).
</Note>

## Setup

The Neon provider is available in the [`@neon/ai-sdk-provider`](https://www.npmjs.com/package/@neon/ai-sdk-provider) package. It requires Node.js 22 or later. Install it alongside AI SDK 7 with:

<InstallPackages packages="ai @neon/ai-sdk-provider" />

In the [Neon Console](https://console.neon.tech), open your branch and create a credential with the `ai_gateway:invoke` scope. Set the branch's AI Gateway URL and credential in your environment:

```bash
NEON_AI_GATEWAY_BASE_URL=https://<branch-id>-api.ai.<cell>.us-east-2.aws.neon.tech
NEON_AI_GATEWAY_TOKEN=nt_live_...
```

Use the bare branch gateway URL without an API path. The provider adds the path for each model.

If you use the Neon CLI, `neon env pull` writes both variables to your `.env` file for the current branch.

The [Neon AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started) explains how to create a credential and find the branch URL.

## Provider Instance

The package exports a default `neon` provider. It reads `NEON_AI_GATEWAY_BASE_URL` and `NEON_AI_GATEWAY_TOKEN` from the environment:

```ts
import { neon } from '@neon/ai-sdk-provider';
```

Use `createNeon` when you want to pass the branch URL and credential explicitly:

```ts
import { createNeon } from '@neon/ai-sdk-provider';

const neon = createNeon({
  baseURL: process.env.NEON_AI_GATEWAY_BASE_URL,
  apiKey: process.env.NEON_AI_GATEWAY_TOKEN,
});
```

`createNeon` also accepts custom `headers` and a custom `fetch` implementation.

## Language Models

Call the provider with a Neon model ID to create a language model:

```ts
const model = neon('gpt-5-mini');
```

To switch providers, change the model ID:

```ts
const openAIModel = neon('gpt-5-mini');
const anthropicModel = neon('claude-haiku-4-5');
const googleModel = neon('gemini-3-5-flash');
const metaModel = neon('llama-4-maverick');
const alibabaModel = neon('qwen3-next-80b-a3b-instruct');
```

The model ID determines which endpoint the provider uses. OpenAI models use the Responses API, Anthropic models use the Messages API, and other models use Neon's unified OpenAI-compatible endpoint. The provider accepts canonical model IDs as well as the legacy `databricks-` prefixed form (for example `databricks-gpt-5`).

Neon updates the model catalog as availability changes. Check the [Neon model catalog](https://neon.com/docs/ai-gateway/models) before choosing a model ID. The catalog is also published as the [`neon` provider on models.dev](https://models.dev/providers/neon/).

## Examples

### `generateText`

```ts
import { neon } from '@neon/ai-sdk-provider';
import { generateText } from 'ai';

const { text } = await generateText({
  model: neon('gpt-5-mini'),
  prompt: 'What is serverless Postgres?',
});

console.log(text);
```

### `streamText`

```ts
import { neon } from '@neon/ai-sdk-provider';
import { streamText } from 'ai';

const result = streamText({
  model: neon('gemini-3-5-flash'),
  prompt: 'Write a short story about a database branch.',
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

### Image Generation

For OpenAI models that support image generation, `neon.tools.imageGeneration` exposes the Responses API `image_generation` tool. Use `streamText` to receive generated images as tool results:

```ts
import { neon } from '@neon/ai-sdk-provider';
import { streamText } from 'ai';

const result = streamText({
  model: neon('gpt-5-mini'),
  prompt: 'Generate an image of a neon elephant in a server room.',
  tools: {
    image: neon.tools.imageGeneration({ outputFormat: 'png' }),
  },
});

for await (const part of result.stream) {
  if (part.type === 'tool-result' && 'result' in part.output) {
    const image = Buffer.from(part.output.result as string, 'base64');
    // Save or return the generated image.
  }
}
```

Image generation works through a tool rather than an AI SDK image model. The provider does not support `generateImage()`, `embed()`, or `embedMany()`.

## Branch-Scoped Authentication

Neon binds each gateway URL to a branch. A credential works on the branch where it was created and on branches descended from it. For example, preview branches forked from `main` can use a credential created on `main`. An unrelated branch cannot.

Model requests follow the same branch isolation as the database. The [AI Gateway authentication guide](https://neon.com/docs/ai-gateway/authentication) covers credential creation, rotation, and branch binding.

## Additional Resources

- [Neon AI Gateway documentation](https://neon.com/docs/ai-gateway/overview)
- [Neon AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started)
- [Neon model catalog](https://neon.com/docs/ai-gateway/models)
- [Neon provider on models.dev](https://models.dev/providers/neon/)
- [Neon AI SDK provider repository](https://github.com/neondatabase/neon-pkgs/tree/main/packages/ai-sdk-provider)
- [Neon Console](https://console.neon.tech)
