# AI SDK - 302AI Provider

The **[302AI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/)** for the [AI SDK](https://sdk.vercel.ai/docs) contains image model support for the [302AI](https://302.ai) platform.

## Setup

The 302AI provider is available in the `@ai-sdk/ai302` module. You can install it with

```bash
npm i @ai-sdk/ai302
```

## Provider Instance

You can import the default provider instance `ai302` from `@ai-sdk/ai302`:

```ts
import { ai302 } from '@ai-sdk/ai302';
```

## Language Model Example

```ts
import { ai302 } from '@ai-sdk/ai302';
import { generateText } from 'ai';

const { text } = await generateText({
  model: ai302('gpt-4o'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

### Language Models

> Check out the [302AI API docs](https://302ai.apifox.cn/api-147522038) for more information.

- `gpt-3.5-turbo`
- `gpt-3.5-turbo-1106`
- `gpt-3.5-turbo-16k`
- `gpt-4`
- `gpt-4-0125-preview`
- `gpt-4-0613`
- `gpt-4-1106-preview`
- `gpt-4-32k`
- `gpt-4-32k-0613`
- `gpt-4-turbo-preview`
- `gpt-3.5-turbo-0125`
- `gpt-3.5-turbo-instruct`
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`
- `qwen-turbo`
- `qwen-plus`
- `qwen-max`
- `qwen-max-latest`
- `glm-4-0520`
- `glm-4v`
- `Baichuan2-53B`
- `Baichuan2-Turbo`
- `Baichuan2-Turbo-192k`
- `moonshot-v1-128k`
- `moonshot-v1-32k`
- `moonshot-v1-8k`
- `ernie-4.0-8k`
- `gpt-4-turbo`
- `gemini-1.5-pro`
- `command-r-plus`
- `deepseek-chat`
- `gpt-4o`
- `qwen-long`
- `glm-4-air`
- `glm-4-flash`
- `qwen2-72b-instruct`
- `qwen2-7b-instruct`
- `Doubao-pro-32k`
- `Doubao-pro-128k`
- `qwen-vl-max`
- `qwen-vl-plus`
- `claude-3-5-sonnet-20240620`
- `step-1v-32k`
- `step-1v-8k`
- `yi-large`
- `yi-large-rag`
- `yi-vision`
- `yi-medium-200k`
- `generalv3.5`
- `4.0Ultra`
- `general`
- `ernie-4.0-turbo-8k`
- `Baichuan3-Turbo`
- `Baichuan3-Turbo-128k`
- `Baichuan4`
- `XuanYuan-70B-Chat-4bit`
- `gemma2-9b-it`
- `SenseChat-5`
- `SenseChat-Turbo`
- `gemini-1.5-pro-001`
- `gemini-1.5-flash-001`
- `codegeex-4`
- `google/gemma-2-27b-it`
- `gpt-4o-mini-2024-07-18`
- `llama3.1-405b`
- `llama3.1-70b`
- `llama3.1-8b`
- `mistral-large-2`
- `deepseek-ai/DeepSeek-V2.5`
- `step-2-16k`
- `command-r`
- `gpt-4-plus`
- `gemini-1.5-pro-exp-0827`
- `abab6.5s-chat`
- `gpt-4o-2024-08-06`
- `chatgpt-4o-latest`
- `glm-4-long`
- `gemini-1.5-pro-latest`
- `hunyuan-lite`
- `hunyuan-standard`
- `hunyuan-standard-256K`
- `hunyuan-pro`
- `hunyuan-code`
- `hunyuan-role`
- `hunyuan-functioncall`
- `hunyuan-vision`
- `Qwen/Qwen2-7B-Instruct`
- `glm-4-plus`
- `glm-4v-plus`
- `pplx-70b-online`
- `pplx-8b-online`
- `pplx-405b-online`
- `o1-preview`
- `o1-preview-2024-09-12`
- `o1-mini`
- `o1-mini-2024-09-12`
- `qwen-math-plus`
- `qwen2.5-72b-instruct`
- `qwen2.5-32b-instruct`
- `qwen2.5-14b-instruct`
- `qwen2.5-3b-instruct`
- `qwen2.5-math-72b-instruct`
- `qwen2.5-coder-7b-instruct`
- `gemini-1.5-pro-002`
- `gemini-1.5-flash-002`
- `llama3.2-90b`
- `llama3.2-11b`
- `gpt-4o-2024-05-13`
- `yi-lightning`
- `claude-3-5-sonnet-20241022`
- `claude-3-5-sonnet-latest`
- `step-1.5v-turbo`
- `claude-3-5-haiku-20241022`
- `grok-beta`
- `gpt-4-turbo-2024-04-09`
- `gemini-exp-1114`
- `qwen-turbo-latest`
- `qwen-turbo-2024-11-01`
- `pixtral-large-2411`
- `mistral-large-2411`
- `gpt-4o-2024-11-20`
- `gpt-4o-plus`
- `ernie-4.0-turbo-128k`
- `gemini-exp-1121`
- `grok-vision-beta`
- `Qwen/QwQ-32B-Preview`
- `Doubao-vision-pro-32k`
- `AIDC-AI/Marco-o1`
- `abab7-chat-preview`
- `coder-claude-3-5-sonnet-20240620`
- `coder-claude-3-5-sonnet-20241022`
- `nova-pro`
- `nova-lite`
- `nova-micro`
- `gemini-exp-1206`
- `qwq-32b-preview`
- `llama3.3-70b`
- `qwen-vl-ocr`
- `meta-llama/Llama-3.3-70B-Instruct`
- `o1-plus`
- `gemma-2-27b`
- `gemini-2.0-flash-exp`
- `gemini-1.5-flash-8b`
- `Doubao-Vision-Lite-32k`
- `qwen2.5-coder-32b-instruct`
- `o1`
- `grok-2-1212`
- `grok-2-vision-1212`
- `deepseek-ai/deepseek-vl2`
- `deepseek-vl2`
- `marco-o1`
- `gemini-2.0-flash-thinking-exp-1219`
- `qwen2.5-7b-instruct`
- `o1-2024-12-17`
- `Qwen/QVQ-72B-Preview`
- `QVQ-72B-Preview`
- `Pro/google/gemma-2-9b-it`
- `Qwen/Qwen2.5-Coder-32B-Instruct`
- `Qwen/Qwen2-VL-72B-Instruct`
- `OpenGVLab/InternVL2-26B`
- `TeleAI/TeleMM`
- `Qwen/Qwen2.5-72B-Instruct-128K`
- `Qwen/Qwen2.5-32B-Instruct`
- `Qwen/Qwen2.5-14B-Instruct`
- `Qwen/Qwen2.5-7B-Instruct`
- `Qwen/Qwen2.5-Coder-7B-Instruct`
- `TeleAI/TeleChat2`
- `internlm/internlm2_5-20b-chat`
- `internlm/internlm2_5-7b-chat`
- `meta-llama/Meta-Llama-3.1-405B-Instruct`
- `meta-llama/Meta-Llama-3.1-8B-Instruct`
- `meta-llama/Meta-Llama-3.1-70B-Instruct`
- `Qwen/Qwen2-1.5B-Instruct`
- `THUDM/glm-4-9b-chat`
- `THUDM/chatglm3-6b`
- `01-ai/Yi-1.5-9B-Chat-16K`
- `01-ai/Yi-1.5-6B-Chat`
- `01-ai/Yi-1.5-34B-Chat-16K`
- `google/gemma-2-9b-it`
- `Vendor-A/Qwen/Qwen2.5-72B-Instruct`
- `Pro/Qwen/Qwen2.5-Coder-7B-Instruct`
- `Pro/Qwen/Qwen2-VL-7B-Instruct`
- `Pro/OpenGVLab/InternVL2-8B`
- `Pro/Qwen/Qwen2.5-7B-Instruct`
- `Pro/meta-llama/Meta-Llama-3.1-8B-Instruct`
- `Pro/Qwen/Qwen2-7B-Instruct`
- `Pro/Qwen/Qwen2-1.5B-Instruct`
- `Pro/THUDM/glm-4-9b-chat`
- `MiniMax-Text-01`
- `moonshot-v1-8k-vision-preview`
- `moonshot-v1-32k-vision-preview`
- `moonshot-v1-128k-vision-preview`
- `claude-3-5-haiku-latest`
- `claude-3-5-haiku`

## Embedding Model Example

```ts
import { ai302 } from '@ai-sdk/ai302';
import { embed } from 'ai';

const { embedding, usage } = await embed({
  model: ai302.textEmbeddingModel('BAAI/bge-large-en-v1.5'),
  value: 'sunny day at the beach',
});
```

### Embedding Models

> Check out the [302AI API docs](https://302ai.apifox.cn/api-147522048) for more information.

- `text-embedding-3-small`
- `text-embedding-3-large`
- `text-embedding-ada-002`
- `zhipu-embedding-2`
- `BAAI/bge-large-en-v1.5`
- `BAAI/bge-large-zh-v1.5`
- `BAAI/bge-m3`
- `Baichuan-Text-Embedding`
- `bce-embedding-base_v1`

## Image Model Examples

```ts
import { ai302 } from '@ai-sdk/ai302';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';

const { image } = await generateImage({
  model: ai302.image('midjourney/6.1'),
  prompt: 'A serene mountain landscape at sunset',
});
const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

### Image Models

> Check out the [302AI API docs](https://302ai.apifox.cn/api-147522046) for more information.

- `flux-v1.1-ultra`
- `flux-pro-v1.1`
- `flux-pro`
- `flux-dev`
- `flux-schnell`
- `ideogram/V_1`
- `ideogram/V_1_TURBO`
- `ideogram/V_2`
- `ideogram/V_2_TURBO`
- `ideogram/V_2A`
- `ideogram/V_2A_TURBO`
- `dall-e-3`
- `recraftv3`
- `recraftv2`
- `sdxl-lightning-v2`
- `kolors`
- `aura-flow`
- `photon-1`
- `photon-flash-1`
- `sdxl`
- `sd3-ultra`
- `sd3v2`
- `sd3.5-large`
- `sd3.5-large-turbo`
- `sd3.5-medium`
- `midjourney/6.1`
- `midjourney/6.0`
- `midjourney/7.0`
- `nijijourney/6.0`
- `google-imagen-3`
- `google-imagen-3-fast`
- `google-imagen-4-preview`
- `doubao-general-v2.1-l`
- `doubao-general-v2.0-l`
- `doubao-general-v2.0`
- `lumina-image-v2`
- `omnigen-v1`
- `playground-v25`
- `minimaxi-image-01`
- `cogview-4`
- `cogview-4-250304`
- `irag-1.0`
- `hidream-i1-full`
- `hidream-i1-dev`
- `hidream-i1-fast`
- `ideogram/V_3_DEFAULT`
- `ideogram/V_3_QUALITY`
- `ideogram/V_3_TURBO`

## Documentation

Please check out the **[Vercel AI SDK](https://sdk.vercel.ai/providers/ai-sdk-providers)** for more information.
