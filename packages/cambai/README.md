# AI SDK - Camb.ai Provider

The **[Camb.ai provider](https://ai-sdk.dev/providers/ai-sdk-providers/cambai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains support for the Camb.ai text-to-speech and transcription APIs.

## Setup

The Camb.ai provider is available in the `@ai-sdk/cambai` module. You can install it with

```bash
npm i @ai-sdk/cambai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `cambai` from `@ai-sdk/cambai`:

```ts
import { cambai } from '@ai-sdk/cambai';
```

## Example

```ts
import { cambai } from '@ai-sdk/cambai';
import { experimental_generateSpeech as generateSpeech } from 'ai';

const { audio } = await generateSpeech({
  model: cambai.speech('mars-pro'),
  text: 'Hello from Camb.ai!',
  voice: '147320',
});
```

## Documentation

Please check out the **[Camb.ai provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/cambai)** for more information.
