# AI SDK - CAMB AI Provider

The **CAMB AI provider** for the [AI SDK](https://ai-sdk.dev/docs)
contains speech model support for the CAMB AI API.

## Setup

The CAMB AI provider is available in the `@ai-sdk/camb` module. You can install it with

```bash
npm i @ai-sdk/camb
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `camb` from `@ai-sdk/camb`:

```ts
import { camb } from '@ai-sdk/camb';
```

## Example

```ts
import { camb } from '@ai-sdk/camb';
import { experimental_generateSpeech as generateSpeech } from 'ai';

const result = await generateSpeech({
  model: camb.speech('coqui'),
  text: 'Hello, world!',
});
```

## Documentation

Please check out the **[AI SDK documentation](https://ai-sdk.dev/docs)** for more information.
