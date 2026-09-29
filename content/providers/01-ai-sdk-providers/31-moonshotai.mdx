---
title: Moonshot AI
description: Learn how to use Moonshot AI models with the AI SDK.
---

# Moonshot AI Provider

The [Moonshot AI](https://www.moonshot.ai) provider offers access to powerful language models through the Moonshot API, including the Kimi series of models with reasoning capabilities.

API keys can be obtained from the [Kimi API Platform](https://platform.kimi.ai/console/api-keys).

## Setup

The Moonshot AI provider is available via the `@ai-sdk/moonshotai` module. You can install it with:

<InstallPackages packages="@ai-sdk/moonshotai" />

## Provider Instance

You can import the default provider instance `moonshotai` from `@ai-sdk/moonshotai`:

```ts
import { moonshotai } from '@ai-sdk/moonshotai';
```

For custom configuration, you can import `createMoonshotAI` and create a provider instance with your settings:

```ts
import { createMoonshotAI } from '@ai-sdk/moonshotai';

const moonshotai = createMoonshotAI({
  apiKey: process.env.MOONSHOT_API_KEY ?? '',
});
```

You can use the following optional settings to customize the Moonshot AI provider instance:

- **baseURL** _string_

  Use a different URL prefix for API calls.
  The default prefix is `https://api.moonshot.ai/v1`

- **apiKey** _string_

  API key that is being sent using the `Authorization` header. It defaults to
  the `MOONSHOT_API_KEY` environment variable

- **headers** _Record&lt;string,string&gt;_

  Custom headers to include in the requests

- **fetch** _(input: RequestInfo, init?: RequestInit) => Promise&lt;Response&gt;_

  Custom [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch) implementation

## Language Models

You can create language models using a provider instance:

```ts
import { moonshotai } from '@ai-sdk/moonshotai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: moonshotai('kimi-k3'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

You can also use the `.chatModel()` or `.languageModel()` factory methods:

```ts
const model = moonshotai.chatModel('kimi-k3');
// or
const model = moonshotai.languageModel('kimi-k3');
```

Moonshot AI language models can be used in the `streamText` function
(see [AI SDK Core](/docs/ai-sdk-core)).

Moonshot V1 models support the standard `temperature`, `topP`,
`presencePenalty`, and `frequencyPenalty` settings. Kimi models use fixed
sampling parameters; the provider omits those settings for Kimi requests and
returns an unsupported-setting warning when they are supplied.

Kimi K3 supports `toolChoice: 'required'`. Kimi K2.6 and the Kimi K2.7 Code
models reject that setting, so the provider omits it and returns an unsupported
warning for those model IDs. Other tool choice modes are passed through
unchanged.

#### Structured Outputs

Native structured outputs are enabled for Kimi K models and the official
Moonshot V1 text, auto, and vision models.

The provider normalizes schemas to Moonshot's supported JSON Schema subset and
enables strict schema validation by default.

For unknown custom model IDs, object generation falls back to JSON mode instead
of schema-constrained decoding.

For best reliability, it is strongly recommended to include your schema requirements in your prompt in addition to passing the schema through `Output`.

### Message Names

Moonshot AI supports optional participant names on system, user, and assistant
messages. Set `providerOptions.moonshotai.name` on each message that should
include a name:

```ts
import {
  moonshotai,
  type MoonshotAIMessageProviderOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: moonshotai('kimi-k3'),
  messages: [
    {
      role: 'user',
      content: 'Suggest a name for my neighborhood book club.',
      providerOptions: {
        moonshotai: {
          name: 'organizer',
        } satisfies MoonshotAIMessageProviderOptions,
      },
    },
  ],
});
```

The same option works with `streamText`. Names are omitted when unset. The
provider ignores a name on a tool message and returns an unsupported warning.
Avoid including unnecessary personal or identifying information in message
names.

### Partial Mode

Moonshot AI's [Partial Mode](https://platform.moonshot.ai/docs/api/partial)
continues the content of a final assistant message. Set `partial: true` in that
assistant message's provider options:

```ts
import {
  moonshotai,
  type MoonshotAIAssistantMessageProviderOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';

const prefix = 'The sky is';

const { text } = await generateText({
  model: moonshotai('kimi-k3'),
  messages: [
    {
      role: 'user',
      content: 'Write one short sentence about the color of the sky.',
    },
    {
      role: 'assistant',
      content: prefix,
      providerOptions: {
        moonshotai: {
          partial: true,
        } satisfies MoonshotAIAssistantMessageProviderOptions,
      },
    },
  ],
});

const completeResponse = prefix + text;
```

The partial message must be the final assistant message in the prompt. Moonshot
returns only the continuation, so concatenate the prefix and generated text
when you need the complete response.

<Note>
  Partial Mode cannot be combined with Moonshot's `json_object` response format.
  The provider rejects that combination before sending the request. A supported
  `json_schema` response remains available, but structured-output parsing
  validates only the returned continuation.
</Note>

### Kimi K3 Dynamic Tool Loading

Kimi K3 can load complete function tool definitions at arbitrary positions in
a conversation. Add `tools` to the Moonshot provider options of an empty system
message. The provider sends `{ role: 'system', tools: [...] }` without a
`content` field and applies the same Moonshot Flavored JSON Schema normalization
used for top-level tools.

```ts
import {
  moonshotai,
  type MoonshotAISystemMessageProviderOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';

const result = await generateText({
  model: moonshotai('kimi-k3'),
  allowSystemInMessages: true,
  messages: [
    { role: 'user', content: 'Help me prepare for a trip.' },
    { role: 'assistant', content: 'I can help with that.' },
    {
      role: 'system',
      content: '',
      providerOptions: {
        moonshotai: {
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the current weather for a city',
              inputSchema: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
                additionalProperties: false,
              },
              strict: true,
            },
          ],
        } satisfies MoonshotAISystemMessageProviderOptions,
      },
    },
    { role: 'user', content: 'What is the weather in San Francisco?' },
  ],
});
```

Each entry must include its complete function definition. Top-level tools and
dynamically loaded tools can be used in the same request. Known unsupported
official models omit the dynamic message and return an unsupported warning;
custom model IDs retain it for forward compatibility.

<Note>
  Keep dynamic system messages in trusted server-side state. Tool names,
  descriptions, and schemas are sent to Moonshot and consume context. Dynamic
  declarations are request-local, so retain earlier declarations in later
  requests while those tools should remain available. Appending messages also
  preserves prompt-cache prefixes better than rewriting earlier declarations.
</Note>

### Reasoning Models

Kimi K3 always reasons and supports `low`, `high`, and `max` reasoning effort.
The default is `max`. You can configure the effort through provider options or
the generic `reasoning` setting:

```ts
import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';

const { text, reasoningText } = await generateText({
  model: moonshotai('kimi-k3'),
  providerOptions: {
    moonshotai: {
      reasoningEffort: 'high',
    } satisfies MoonshotAILanguageModelOptions,
  },
  prompt: 'How many "r"s are in the word "strawberry"?',
});

console.log(reasoningText);
console.log(text);
```

Kimi K2.5 and K2.6 can enable or disable thinking. Kimi K2.7 always has
thinking and preserved reasoning enabled. Keep reasoning history in multi-turn
Kimi K2.7 conversations. The reasoning output is exposed through the standard
AI SDK reasoning parts.

```ts
import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { streamText } from 'ai';

const result = streamText({
  model: moonshotai('kimi-k2.7-code'),
  providerOptions: {
    moonshotai: {
      thinking: { type: 'enabled' },
      reasoningHistory: 'preserved',
    } satisfies MoonshotAILanguageModelOptions,
  },
  prompt: 'How many "r"s are in the word "strawberry"?',
});

for await (const part of result.fullStream) {
  if (part.type === 'reasoning-delta') {
    process.stdout.write(part.text);
  } else if (part.type === 'text-delta') {
    process.stdout.write(part.text);
  }
}
```

See [AI SDK UI: Chatbot](/docs/ai-sdk-ui/chatbot#reasoning) for more details on how to integrate reasoning into your chatbot.

### Log Probabilities

Moonshot AI can return token log probabilities for Chat Completions. Set
`logprobs` to request token probabilities, or set `topLogprobs` to request the
most likely alternatives at each token position. Setting `topLogprobs`
automatically enables `logprobs`.

```ts
import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';

const result = await generateText({
  model: moonshotai('moonshot-v1-8k'),
  prompt: 'Reply with one word that means happy.',
  providerOptions: {
    moonshotai: {
      topLogprobs: 3,
    } satisfies MoonshotAILanguageModelOptions,
  },
});

console.log(result.text);
console.log(result.providerMetadata?.moonshotai?.logprobs);
```

For `generateText`, log probabilities are available at
`providerMetadata.moonshotai.logprobs`. For `streamText`, the accumulated log
probabilities are included in the final finish part under the same metadata
path.

Moonshot documents the request options and OpenAI Chat Completions
compatibility, but does not separately specify the log probability response
schema. The provider therefore preserves the OpenAI-compatible `content`
entries, including each token's `logprob`, nullable `bytes`, and
`top_logprobs`.

<Note>
  Token probabilities and alternatives can significantly increase response size.
  Request them only when needed, and avoid forwarding or persistently logging
  provider metadata unless your application requires it.
</Note>

### Video Input

Kimi K3, Kimi K2.7 Code, Kimi K2.6, and Kimi K2.5 support video input. Pass the video as a `file` content part with a video media type:

```ts
import { moonshotai } from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import fs from 'node:fs';

const { text } = await generateText({
  model: moonshotai('kimi-k3'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Summarize what happens in this video.' },
        {
          type: 'file',
          data: fs.readFileSync('./video.mp4'),
          mediaType: 'video/mp4',
        },
      ],
    },
  ],
});

console.log(text);
```

You can also pass a URL. Since Moonshot AI does not fetch external URLs, the AI SDK downloads the video and inlines it as base64 before sending:

```ts
{
  type: 'file',
  data: new URL('https://example.com/video.mp4'),
  mediaType: 'video/mp4',
}
```

<Note>
  Supported image media types are `image/jpeg`, `image/png`, `image/gif`,
  `image/webp`, `image/bmp`, `image/heic`, and `image/heif`. Supported video
  media types are `video/mp4`, `video/mpeg`, `video/mov`, `video/avi`,
  `video/x-flv`, `video/mpg`, `video/webm`, `video/wmv`, and `video/3gpp`. Other
  image and video media types are rejected before a request is sent.
</Note>

<Note>
  Moonshot AI recommends videos up to 1080p. For larger videos, or videos you
  reuse across many requests, upload them with the [Moonshot Files
  API](https://platform.kimi.ai/docs/api/files) instead. Audio and PDF inputs
  are not supported by Moonshot AI chat completions.
</Note>

### File References and Text Files

Images and videos uploaded through the Moonshot Files API can be passed as
provider references. Prefix the uploaded file ID with `ms://` and use an image
or video media type:

```ts
{
  type: 'file',
  data: {
    type: 'reference',
    reference: {
      moonshotai: 'ms://file-id',
    },
  },
  mediaType: 'image/png',
}
```

Inline text file data is sent as a native text content part:

```ts
{
  type: 'file',
  data: {
    type: 'text',
    text: 'Document contents',
  },
  mediaType: 'text/plain',
}
```

### Predicted Outputs

You can provide static predicted content when much of the expected response is
already known. Moonshot AI can use the prediction to accelerate the response
while still generating any changed content:

```ts
import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { streamText } from 'ai';

const source = `export function greet(name: string) {
  return \`Hello, \${name}!\`;
}`;

const result = streamText({
  model: moonshotai('kimi-k3'),
  messages: [
    {
      role: 'user',
      content:
        'Change the function to say "Welcome" instead of "Hello". Respond only with the updated code.',
    },
    { role: 'user', content: source },
  ],
  providerOptions: {
    moonshotai: {
      prediction: {
        type: 'content',
        content: source,
      },
    } satisfies MoonshotAILanguageModelOptions,
  },
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

The `content` can also be an array of text parts:

```ts
prediction: {
  type: 'content',
  content: [
    { type: 'text', text: 'First known section' },
    { type: 'text', text: 'Second known section' },
  ],
}
```

<Note>
  Predicted content is sent to Moonshot AI as part of the request. Avoid
  including sensitive or proprietary text unless you intend to share it with the
  provider.
</Note>

### Provider Options

The following optional provider options are available for Moonshot AI language models:

- **strictJsonSchema** _boolean_

  Whether to use strict JSON schema validation for structured outputs. Defaults
  to `true`.

- **logprobs** _boolean_

  Whether to return log probabilities for generated tokens. Results are
  available in `providerMetadata.moonshotai.logprobs`.

- **topLogprobs** _number_

  Number of most likely tokens to return at each token position. Accepts
  integer values from `0` through `20` and automatically enables `logprobs`.

- **reasoningEffort** _'low' | 'high' | 'max'_

  Reasoning effort for Kimi K3. Defaults to `'max'`. You can also use the
  generic `reasoning` setting.

- **prediction** _&#123; type: 'content'; content: string | Array&lt;&#123; type: 'text'; text: string &#125;&gt; &#125;_

  Supplies static predicted output that can accelerate requests where most of
  the response is already known.

- **thinking** _object_

  Configuration for Kimi K2.5 and K2.6. Kimi K2.7 accepts only `enabled`
  because its thinking cannot be disabled. Kimi K3 does not accept this field.
  - **type** _'enabled' | 'disabled'_

    Whether to enable thinking mode. For Kimi K2.7 Code, only `'enabled'` is
    accepted.

  - **budgetTokens** _number_

    Deprecated. Moonshot Chat Completions does not support thinking budgets.
    The provider omits this value and returns a warning. It remains accepted
    for backwards compatibility.

- **reasoningHistory** _'disabled' | 'interleaved' | 'preserved'_

  Controls preserved reasoning behavior in multi-turn conversations:
  - `'disabled'` and `'interleaved'` are retained for compatibility. They do
    not change the request, so the model's server-default behavior applies.
  - `'preserved'` maps to `thinking.keep: 'all'` for Kimi K2.6. Kimi K2.7 and
    K3 preserve reasoning by default.

### Chat Response Metadata

Moonshot AI preserves provider-specific response fields in
`providerMetadata.moonshotai` for generated and streamed responses:

- `responseObject`: `chat.completion` or `chat.completion.chunk`
- `choiceIndex`: the selected response choice index
- `messageRole`: the response message role, when supplied
- `toolCallTypes`: the tool-call type for each returned call

These fields remain in provider metadata because they are specific to
Moonshot's Chat Completions response rather than shared AI SDK result fields.

## Model Capabilities

The Moonshot V1 series and Kimi K2.5 are unavailable to newly registered users
and are scheduled for full platform sunset on August 31, 2026. They remain
listed because they are still part of the Chat Completions API model surface,
but new applications should use Kimi K3, Kimi K2.7 Code, or Kimi K2.6.

| Model                             | Image Input | Video Input | Object Generation | Tool Usage | Tool Streaming |
| --------------------------------- | ----------- | ----------- | ----------------- | ---------- | -------------- |
| `moonshot-v1-auto`                | <Cross />   | <Cross />   | <Check />         | <Check />  | <Check />      |
| `moonshot-v1-8k`                  | <Cross />   | <Cross />   | <Check />         | <Check />  | <Check />      |
| `moonshot-v1-32k`                 | <Cross />   | <Cross />   | <Check />         | <Check />  | <Check />      |
| `moonshot-v1-128k`                | <Cross />   | <Cross />   | <Check />         | <Check />  | <Check />      |
| `moonshot-v1-8k-vision-preview`   | <Check />   | <Cross />   | <Check />         | <Check />  | <Check />      |
| `moonshot-v1-32k-vision-preview`  | <Check />   | <Cross />   | <Check />         | <Check />  | <Check />      |
| `moonshot-v1-128k-vision-preview` | <Check />   | <Cross />   | <Check />         | <Check />  | <Check />      |
| `kimi-k2.5`                       | <Check />   | <Check />   | <Check />         | <Check />  | <Check />      |
| `kimi-k2.6`                       | <Check />   | <Check />   | <Check />         | <Check />  | <Check />      |
| `kimi-k2.7-code`                  | <Check />   | <Check />   | <Check />         | <Check />  | <Check />      |
| `kimi-k2.7-code-highspeed`        | <Check />   | <Check />   | <Check />         | <Check />  | <Check />      |
| `kimi-k3`                         | <Check />   | <Check />   | <Check />         | <Check />  | <Check />      |

<Note>
  See the [Kimi model list](https://platform.kimi.ai/docs/models) and [model
  parameter reference](https://platform.kimi.ai/docs/api/models-overview) for
  current availability and model-specific constraints. You can also pass custom
  or retired provider model IDs as strings when needed.
</Note>
