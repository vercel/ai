# AI SDK - Speechify Provider

The **[Speechify provider](https://ai-sdk.dev/providers/ai-sdk-providers/speechify)** for the [AI SDK](https://ai-sdk.dev/docs)
contains speech model support for the Speechify text-to-speech API, including word- and sentence-level speech marks with every generation.

## Setup

The Speechify provider is available in the `@ai-sdk/speechify` module. You can install it with

```bash
npm i @ai-sdk/speechify
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `speechify` from `@ai-sdk/speechify`:

```ts
import { speechify } from '@ai-sdk/speechify';
```

## Example

```ts
import { speechify } from '@ai-sdk/speechify';
import { experimental_generateSpeech as generateSpeech } from 'ai';

const { audio } = await generateSpeech({
  model: speechify.speech('simba-3.2'),
  text: 'Hello from Speechify!',
  voice: 'geffen_32',
});
```

## Documentation

Please check out the **[Speechify provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/speechify)** for more information.
