---
title: Crusoe
description: Learn how to use the Crusoe provider for the AI SDK.
---

# Crusoe Provider

[crusoe-ai-provider](https://github.com/acheamponge/crusoe-ai-provider) contains language model support for [Crusoe Cloud Managed Inference](https://docs.crusoecloud.com/managed-inference/overview), which provides access to open-weight models such as DeepSeek, GLM, Kimi, Llama, Nemotron, and Qwen on sustainable, energy-efficient data centers via an OpenAI-compatible API.

API keys can be obtained from the [Crusoe Cloud Console](https://console.crusoecloud.com/).

## Setup

The Crusoe provider is available via the `crusoe-ai-provider` module. You can install it with:

<InstallPackages packages="crusoe-ai-provider" />

### Environment variables

Create a `.env` file with a `CRUSOE_API_KEY` variable.

## Provider Instance

You can import the default provider instance `crusoe` from `crusoe-ai-provider`:

```ts
import { crusoe } from 'crusoe-ai-provider';
```

If you need a customized setup, you can import `createCrusoe` from `crusoe-ai-provider` and create a provider instance with your settings:

```ts
import { createCrusoe } from 'crusoe-ai-provider';

const crusoe = createCrusoe({
  // Optional settings
});
```

You can use the following optional settings to customize the Crusoe provider instance:

- **baseURL** _string_

  Use a different URL prefix for API calls, e.g. to use proxy servers.
  The default prefix is `https://api.inference.crusoecloud.com/v1`.

- **apiKey** _string_

  API key that is being sent using the `Authorization` header.
  It defaults to the `CRUSOE_API_KEY` environment variable.

- **headers** _Record&lt;string,string&gt;_

  Custom headers to include in the requests.

- **fetch** _(input: RequestInfo, init?: RequestInit) => Promise&lt;Response&gt;_

  Custom [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch) implementation.
  Defaults to the global `fetch` function.

## Language Models

You can create language models using a provider instance:

```ts
import { crusoe } from 'crusoe-ai-provider';
import { generateText } from 'ai';

const { text } = await generateText({
  model: crusoe('zai/GLM-5.2'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

Crusoe language models can also be used in the `streamText` function:

```ts
import { crusoe } from 'crusoe-ai-provider';
import { streamText } from 'ai';

const result = streamText({
  model: crusoe('deepseek-ai/DeepSeek-V4-Pro'),
  prompt: 'Write a haiku about sustainable computing.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Model Capabilities

| Model                                           | Text Generation     | Streaming           |
| ----------------------------------------------- | ------------------- | ------------------- |
| `deepseek-ai/DeepSeek-V3-0324`                  | <Check size={18} /> | <Check size={18} /> |
| `deepseek-ai/DeepSeek-V4-Pro`                   | <Check size={18} /> | <Check size={18} /> |
| `deepseek-ai/Deepseek-V4-Flash`                 | <Check size={18} /> | <Check size={18} /> |
| `google/gemma-4-31b-it`                         | <Check size={18} /> | <Check size={18} /> |
| `meta-llama/Llama-3.3-70B-Instruct`             | <Check size={18} /> | <Check size={18} /> |
| `moonshotai/Kimi-K2.6`                          | <Check size={18} /> | <Check size={18} /> |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`         | <Check size={18} /> | <Check size={18} /> |
| `nvidia/Nemotron-3-Nano-Omni-Reasoning-30B-A3B` | <Check size={18} /> | <Check size={18} /> |
| `nvidia/NVIDIA-Nemotron-3-Super-120B-A12B`      | <Check size={18} /> | <Check size={18} /> |
| `nvidia/NVIDIA-Nemotron-3-Ultra-550B`           | <Check size={18} /> | <Check size={18} /> |
| `openai/gpt-oss-120b`                           | <Check size={18} /> | <Check size={18} /> |
| `Qwen/Qwen3-235B-A22B-Instruct-2507`            | <Check size={18} /> | <Check size={18} /> |
| `zai/GLM-5.1`                                   | <Check size={18} /> | <Check size={18} /> |
| `zai/GLM-5.2`                                   | <Check size={18} /> | <Check size={18} /> |

<Note>
  The table above lists popular models. Please see the [Crusoe Managed Inference
  docs](https://docs.crusoecloud.com/managed-inference/overview) for the full
  list of available models. Any model ID available on Crusoe can be passed as a
  plain string.
</Note>
