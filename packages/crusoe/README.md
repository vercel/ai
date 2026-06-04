# AI SDK - Crusoe Provider

The **Crusoe provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [Crusoe](https://crusoecloud.com), offering AI inference on clean energy infrastructure through the Crusoe Intelligence Foundry.

## Setup

The Crusoe provider is available in the `@ai-sdk/crusoe` module. You can install it with

```bash
npm i @ai-sdk/crusoe
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `crusoe` from `@ai-sdk/crusoe`:

```ts
import { crusoe } from '@ai-sdk/crusoe';
```

## Available Models

Crusoe Intelligence Foundry offers a variety of language models:
https://docs.crusoecloud.com/managed-inference/overview

## Example

```ts
import { crusoe } from '@ai-sdk/crusoe';
import { generateText } from 'ai';

const { text } = await generateText({
  model: crusoe('meta-llama/Llama-3.3-70B-Instruct'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Documentation

For more information about Crusoe's clean-energy inference infrastructure and API documentation, please visit:

- [Crusoe Intelligence Foundry Documentation](https://docs.crusoecloud.com/managed-inference/overview)
- [Crusoe Cloud Website](https://crusoecloud.com)
