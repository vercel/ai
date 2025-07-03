# AI SDK - GitHub Models

The **[GitHub Models provider](https://ai-sdk.dev/providers/ai-sdk-providers/github-models)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [GitHub Models](https://github.com/features/models).

## Setup

The GitHub Models provider is available in the `@ai-sdk/github-models` module. You can install it with

```bash
npm i @ai-sdk/github-models
```

## Provider Instance

You can import the default provider instance `githubModels` from `@ai-sdk/github-models`:

```ts
import { githubModels } from '@ai-sdk/github-models';
```

## Example

```ts
import { githubModels } from '@ai-sdk/github-models';
import { generateText } from 'ai';

const { text } = await generateText({
  model: githubModels('meta/meta-llama-3.1-8b-instruct'),
  prompt: 'Write a sonnet about the beauty of nature',
});
```

## Documentation

Please check out the **[GitHub Models provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/github-models)** for more information.
