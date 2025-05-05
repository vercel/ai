# AI SDK - DeepSeek Provider

The **[DeepSeek provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [DeepSeek](https://www.deepseek.com) platform.

## Setup

The DeepSeek provider is available in the `@ai-sdk/deepseek` module. You can install it with

```bash
npm i @ai-sdk/deepseek
```

## Provider Instance

You can import the default provider instance `deepseek` from `@ai-sdk/deepseek`:

```ts
import { deepseek } from '@ai-sdk/deepseek';
```

## Example

```ts
import { deepseek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';

const { text } = await generateText({
  model: deepseek('deepseek-chat'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Documentation

Please check out the **[DeepSeek provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek)** for more information.
