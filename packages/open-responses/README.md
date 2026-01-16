# AI SDK - Open Responses provider

The **[Open Responses provider](https://ai-sdk.dev/providers/ai-sdk-providers/open-responses)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for [Open Responses](https://www.openresponses.org/) compatible APIs.

## Setup

The Open Responses provider is available in the `@ai-sdk/open-responses` module. You can install it with

```bash
npm i @ai-sdk/open-responses
```

## Provider Instance

Create an Open Responses provider instance using `createOpenResponses`:

```ts
import { createOpenResponses } from '@ai-sdk/open-responses';

const lmStudio = createOpenResponses({
  baseUrl: 'http://localhost:1234',
});
```

You can use this instance to access models served by any Open Responses compatible endpoint.

## Example

```ts
import { createOpenResponses } from '@ai-sdk/open-responses';
import { generateText } from 'ai';

const lmStudio = createOpenResponses({
  baseUrl: 'http://localhost:1234',
});

const result = await generateText({
  model: lmStudio('google/gemma-3-4b')
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

Please check out the **[Open Responses provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/open-responses)** for more information.
