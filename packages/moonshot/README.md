# AI SDK - Moonshot Provider

The **[Moonshot provider](https://ai-sdk.dev/providers/ai-sdk-providers/moonshot)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Moonshot AI](https://api.moonshot.ai) platform.

## Setup

The Moonshot provider is available in the `@ai-sdk/moonshot` module. You can install it with

```bash
npm i @ai-sdk/moonshot
```

## Provider Instance

You can import the default provider instance `moonshot` from `@ai-sdk/moonshot`:

```ts
import { moonshot } from '@ai-sdk/moonshot';
```

## Example

```ts
import { moonshot } from '@ai-sdk/moonshot';
import { generateText } from 'ai';

const { text } = await generateText({
  model: moonshot('kimi-k2-0711-preview'),
  prompt: 'Write a JavaScript function that sorts a list:',
  temperature: 0.6, // Recommended temperature for Kimi K2
});
```

## Models

The Moonshot provider supports the following models:

### Generation Models

- `kimi-k2-0711-preview`: Mixture-of-Experts model with exceptional coding and agent capabilities

## Configuration

You can configure the Moonshot provider with your API key and other settings:

```ts
import { createMoonshot } from '@ai-sdk/moonshot';

const moonshot = createMoonshot({
  apiKey: 'your-moonshot-api-key', // defaults to process.env.MOONSHOT_API_KEY
  baseURL: 'https://api.moonshot.ai/v1', // optional, defaults to Moonshot's API
});
```

## Documentation

Please check out the **[Moonshot provider](https://ai-sdk.dev/providers/ai-sdk-providers/moonshot)** for more information.
