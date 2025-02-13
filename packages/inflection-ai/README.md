# AI SDK - Inflection AI Provider

The **[Inflection AI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/inflection-ai)** for the [AI SDK](https://sdk.vercel.ai/docs) contains language model support for the [Inflection AI API](https://developers.inflection.ai/).

## Setup

The Inflection AI provider is available in the `@ai-sdk/inflection-ai` module. You can install it with

```bash
npm i @ai-sdk/inflection-ai
```

## Provider Instance

You can import the default provider instance `inflection` from `@ai-sdk/inflection-ai`:

```ts
import { inflection } from '@ai-sdk/inflection-ai';
```

## Example

```ts
import { inflection } from '@ai-sdk/inflection-ai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: inflection('inflection_3_with_tools'),
  prompt: 'how can I make quick chicken pho?',
});
```

## Documentation

Please check out the **[Inflection AI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/inflection-ai)** for more information.
