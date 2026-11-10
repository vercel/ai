# AI SDK - Web Fetch Tool

A first-party, provider-independent web fetch tool for the [AI SDK](https://ai-sdk.dev/docs).

## Setup

```bash
npm i ai @ai-sdk/tool-web-fetch
```

## Usage

```ts
import { experimental_createWebFetchTool as createWebFetchTool } from '@ai-sdk/tool-web-fetch';
import { generateText, isStepCount } from 'ai';

const result = await generateText({
  model, // Your configured model with function calling support.
  tools: { webFetch: createWebFetchTool() },
  stopWhen: isStepCount(5),
  prompt: 'Summarize https://ai-sdk.dev/docs/introduction.',
});

console.log(result.text);
```

See the [Web Fetch Tool documentation](https://ai-sdk.dev/docs/ai-sdk-core/tools#web-fetch-tool) for more information.
