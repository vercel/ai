# AI SDK - LMNT Provider

The **[LMNT provider](https://ai-sdk.dev/providers/ai-sdk-providers/lmnt)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the LMNT API.

## Setup

The LMNT provider is available in the `@ai-sdk/lmnt` module. You can install it with

```bash
npm i @ai-sdk/lmnt
```

## Provider Instance

You can import the default provider instance `lmnt` from `@ai-sdk/lmnt`:

```ts
import { lmnt } from '@ai-sdk/lmnt';
```

## Example

```ts
import { lmnt } from '@ai-sdk/lmnt';
import { experimental_generateSpeech as generateSpeech } from 'ai';

const result = await generateSpeech({
  model: lmnt.speech('aurora'),
  text: 'Hello, world!',
});
```

## Documentation

Please check out the **[LMNT provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/lmnt)** for more information.
