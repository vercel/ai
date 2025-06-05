# AI SDK - AIMLAPI Provider

The **[AIMLAPI provider](https://ai-sdk.dev/providers/community-providers/aimlapi)** for the [AI SDK](https://ai-sdk.dev/docs) allows using models via the AIMLAPI service.

## Setup

Install the package via pnpm, npm, or yarn:

```bash
npm i @ai-sdk/aimlapi
```

## Provider Instance

You can import the default provider instance `aimlapi` from `@ai-sdk/aimlapi`:

```ts
import { aimlapi } from '@ai-sdk/aimlapi';
```

## Example

```ts
import { aimlapi } from '@ai-sdk/aimlapi';
import { generateText } from 'ai';

const { text } = await generateText({
  model: aimlapi('gpt-3.5-turbo'),
  prompt: 'Hello from AIMLAPI!',
});
```

## Documentation

See the **[AIMLAPI provider docs](https://ai-sdk.dev/providers/community-providers/aimlapi)** for more details.
