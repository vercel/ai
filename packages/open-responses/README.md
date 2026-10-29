# AI SDK - Open Responses Provider

The **[Open Responses provider](https://ai-sdk.dev/providers/ai-sdk-providers/open-responses)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for [Open Responses](https://www.openresponses.org/) compatible APIs.

## Setup

```bash
npm i ai @ai-sdk/open-responses
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { createOpenResponses } from '@ai-sdk/open-responses';
import { generateText } from 'ai';

const openResponses = createOpenResponses({
  name: 'aProvider',
  url: 'http://localhost:1234/v1/responses',
});

const { text } = await generateText({
  model: openResponses('mistralai/ministral-3-14b-reasoning'),
  prompt: 'Invent a new holiday and describe its traditions.',
  maxOutputTokens: 100,
});
```

See the [Open Responses Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/open-responses) for more information.
