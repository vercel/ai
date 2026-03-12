# Sarvam AI Provider

The **[Sarvam models](https://docs.sarvam.ai/api-reference-docs/getting-started/models)** for the [AI SDK](https://ai-sdk.dev/docs) enables text generation with [Sarvam AI](https://sarvam.ai/) models, including support for Indian languages.

## Setup

Install the Sarvam provider:

```bash
pnpm add @ai-sdk/sarvam ai
```

## Provider Instance

Get your **Sarvam API Key** from the [Sarvam Dashboard](https://dashboard.sarvam.ai/).

Initialize the provider:

```ts
import { createSarvam } from '@ai-sdk/sarvam';

const sarvam = createSarvam({
  apiKey: process.env.SARVAM_API_KEY,
});
```

Or use the default instance (reads from `SARVAM_API_KEY` environment variable):

```ts
import { sarvam } from '@ai-sdk/sarvam';
```

## Usage

### generateText

```ts
import { generateText } from 'ai';
import { sarvam } from '@ai-sdk/sarvam';

const result = await generateText({
  model: sarvam('sarvam-m'),
  prompt: 'Explain quantum computing simply',
});

console.log(result.text);
```

### streamText

```ts
import { streamText } from 'ai';
import { sarvam } from '@ai-sdk/sarvam';

const result = streamText({
  model: sarvam('sarvam-m'),
  prompt: 'Explain quantum computing simply',
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

## Available Models

- `sarvam-m` - 24B parameters (legacy)
- `sarvam-30b` - 64K context
- `sarvam-30b-16k` - 16K context (cost-efficient)
- `sarvam-105b` - 128K context (flagship)
- `sarvam-105b-32k` - 32K context (cost-efficient)

## Documentation

- [Sarvam API Documentation](https://docs.sarvam.ai/api-reference-docs/introduction)
- [AI SDK Documentation](https://ai-sdk.dev/docs)
