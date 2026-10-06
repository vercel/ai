# Liquid Provider for the AI SDK

The `@ai-sdk/liquid` package provides Liquid decision models for the
[AI SDK](https://ai-sdk.dev/docs).

## Setup

```sh
pnpm add @ai-sdk/liquid ai
```

Set `LIQUID_API_KEY` to a key from [Liquid's console](https://console.liquid.ai).

## Decisions

```ts
import { liquid } from '@ai-sdk/liquid';
import { experimental_decide } from 'ai';

const result = await experimental_decide({
  model: liquid.decisionModel('d1'),
  state: { message: 'I was charged twice. Please refund the duplicate.' },
  questions: {
    requestsRefund: {
      type: 'boolean',
      instructions: 'Is the customer requesting a refund?',
    },
  },
});

console.log(result.answers.requestsRefund.probability);
```

The provider supports Choice, Score, and Boolean questions. Boolean questions
map to Liquid's native Noul primitive. Use `d1` for text and image decisions,
or `d1:free` for text-only decisions. The API is experimental and may change
in patch releases.

## Images

Put images in `state.images` as base64 data URLs or `{ content_type, base64 }`
objects:

```ts
state: {
  context: 'Inspect the supplied image.',
  images: [{ content_type: 'image/png', base64: imageBase64 }],
}
```

The provider moves nonempty `state.images` to the native request's top-level
`images` array and sends the other state fields unchanged. It preserves image
order and never mutates your state. JPEG, PNG, WebP, and GIF are supported,
with at most eight images per request. Remote URLs are not accepted.

## Configuration

```ts
import { createLiquid } from '@ai-sdk/liquid';

const liquid = createLiquid({
  apiKey: 'your-api-key',
  // baseURL: 'https://api.liquid.ai/decisions/v1',
  // headers: { 'custom-header': 'value' },
  // fetch: customFetch,
});
```

Only decision models are implemented by this provider. See the
[provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/liquid)
and [Liquid's API documentation](https://docs.liquid.ai/lfm/models/decision-models).
