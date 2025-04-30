# AI SDK - Azure OpenAI Provider

The **[Azure provider](https://ai-sdk.dev/providers/ai-sdk-providers/azure)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the Azure OpenAI API.

## Setup

The Azure provider is available in the `@ai-sdk/azure` module. You can install it with

```bash
npm i @ai-sdk/azure
```

## Provider Instance

You can import the default provider instance `azure` from `@ai-sdk/azure`:

```ts
import { azure } from '@ai-sdk/azure';
```

## Example

```ts
import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';

const { text } = await generateText({
  model: azure('gpt-4o'), // your deployment name
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

Please check out the **[Azure provider](https://ai-sdk.dev/providers/ai-sdk-providers/azure)** for more information.
