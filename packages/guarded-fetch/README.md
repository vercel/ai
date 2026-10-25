# AI SDK Guarded Fetch

A Node.js fetch transport that validates DNS results at connection time and pins connections to the checked addresses. Use it with the AI SDK for additional protection when fetching untrusted URLs.

## Setup

```bash
npm i @ai-sdk/guarded-fetch @ai-sdk/fal ai
```

## Usage

```ts
import { createFal } from '@ai-sdk/fal';
import { createGuardedFetch } from '@ai-sdk/guarded-fetch';
import { generateImage } from 'ai';

const fetch = createGuardedFetch();
const fal = createFal({ fetch });

try {
  const result = await generateImage({
    model: fal.image('fal-ai/flux/schnell'),
    prompt: 'A blue cat in Kyoto',
  });
  console.log(result.images);
} finally {
  await fetch.close();
}
```

See the [AI SDK Guarded Fetch documentation](https://ai-sdk.dev/docs/advanced/secure-url-fetching#opt-in-dns-protection-on-nodejs) for more information.
