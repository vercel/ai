# AI SDK - Interfaze Provider

The **Interfaze provider** for the [AI SDK](https://ai-sdk.dev/docs) support for [Interfaze](https://interfaze.ai).

## Setup

The Interfaze provider is available in the `@ai-sdk/interfaze` module. You can install it with

```bash
npm i @ai-sdk/interfaze
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `interfaze` from `@ai-sdk/interfaze`:

```ts
import { interfaze } from '@ai-sdk/interfaze';
```

## Example

```ts
import { interfaze } from '@ai-sdk/interfaze';
import { generateText } from 'ai';

const { text } = await generateText({
  model: interfaze('interfaze-beta'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Interfaze-Specific Metadata

Interfaze adds a semantic-cache flag, a reasoning trace, and internal-task results to responses. These land in `providerMetadata.interfaze` for both `generateText` and `streamText`:

```ts
const result = await generateText({
  model: interfaze('interfaze-beta'),
  prompt: 'What is the weather in San Francisco?',
});

console.log(result.providerMetadata?.interfaze?.vcache); // boolean
console.log(result.providerMetadata?.interfaze?.reasoning); // string | undefined
console.log(result.providerMetadata?.interfaze?.precontext); // unknown[] | undefined
```

## Documentation

Please see the [Interfaze provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/interfaze) for more information.
