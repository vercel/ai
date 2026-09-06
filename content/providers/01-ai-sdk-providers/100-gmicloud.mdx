---
title: GMI Cloud
description: Learn how to use GMI Cloud's models with the AI SDK.
---

# GMI Cloud Provider

The [GMI Cloud](https://www.gmicloud.ai) provider offers access to open-weight language models through GMI Cloud's GPU inference platform, over an OpenAI-compatible API.

API keys can be obtained from the [GMI Cloud console](https://console.gmicloud.ai).

## Setup

The GMI Cloud provider is available via the `@ai-sdk/gmicloud` module. You can install it with:

<InstallPackages packages="@ai-sdk/gmicloud" />

## Provider Instance

You can import the default provider instance `gmicloud` from `@ai-sdk/gmicloud`:

```ts
import { gmicloud } from '@ai-sdk/gmicloud';
```

For custom configuration, you can import `createGmicloud` and create a provider instance with your settings:

```ts
import { createGmicloud } from '@ai-sdk/gmicloud';

const gmicloud = createGmicloud({
  apiKey: process.env.GMI_CLOUD_APIKEY ?? '',
});
```

You can use the following optional settings to customize the GMI Cloud provider instance:

- **baseURL** _string_

  Use a different URL prefix for API calls.
  The default prefix is `https://api.gmi-serving.com/v1`.

- **apiKey** _string_

  API key that is being sent using the `Authorization` header. It defaults to
  the `GMI_CLOUD_APIKEY` environment variable.

- **headers** _Record&lt;string,string&gt;_

  Custom headers to include in the requests.

- **fetch** _FetchFunction_

  Custom fetch implementation.

## Language Models

```ts
import { gmicloud } from '@ai-sdk/gmicloud';
import { generateText } from 'ai';

const { text } = await generateText({
  model: gmicloud('deepseek-ai/DeepSeek-V4-Flash-0731'),
  prompt: 'What is the capital of France?',
});
```

GMI Cloud serves an evolving catalog of open-weight models, so model ids are typed as `string`. Embedding and image models are not supported.

## Error diagnostics

GMI Cloud's edge reports a generic banner in `error.message` on rejections and nests the backend engine's diagnostic in `error.details`. This provider unwraps the nested diagnostic, so `AI_APICallError.message` carries the engine's reason (e.g. `The request is invalid: Invalid max_tokens value, the valid range of max_tokens is [1, 393216].`) instead of `Backend request failed with status 400`.
