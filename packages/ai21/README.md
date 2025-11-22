# AI SDK - AI21 Provider

The **[AI21 provider](https://ai-sdk.dev/providers/ai-sdk-providers/ai21)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [AI21](https://www.ai21.com) platform.

## Setup

The AI21 provider is available in the `@ai-sdk/ai21` module. You can install it with

```bash
npm i @ai-sdk/ai21
```

## Provider Instance

You can import the default provider instance `ai21` from `@ai-sdk/ai21`:

```ts
import { ai21 } from '@ai-sdk/ai21';
```

## Example

```ts
import { ai21 } from '@ai-sdk/ai21';
import { generateText } from 'ai';

const { text } = await generateText({
  model: ai21('jamba-large'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Documentation

Please check out the **[AI21 provider](https://ai-sdk.dev/providers/ai-sdk-providers/ai21)** for more information.
