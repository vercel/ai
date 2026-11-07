# AI SDK - Amazon Bedrock Provider

The **[Amazon Bedrock provider](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the Amazon Bedrock [converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html).

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Amazon Bedrock (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/amazon-bedrock
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';

const { text } = await generateText({
  model: bedrock('meta.llama3-8b-instruct-v1:0'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [Amazon Bedrock Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock) for more information.
