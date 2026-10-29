# AI SDK - Claude Platform on AWS Provider

The **[Claude Platform on AWS provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic-aws)** for the [AI SDK](https://ai-sdk.dev/docs)
gives you access to the Anthropic Messages API hosted in AWS at
`aws-external-anthropic.{region}.api.aws`, authenticated with AWS SigV4 or an
AWS-provisioned API key.

## Setup

```bash
npm i ai @ai-sdk/anthropic-aws
```

## Usage

```ts
import { createAnthropicAws } from '@ai-sdk/anthropic-aws';
import { generateText } from 'ai';

const anthropicAws = createAnthropicAws();

const { text } = await generateText({
  model: anthropicAws('claude-sonnet-5-5'),
  prompt: 'Invent a new holiday and describe its traditions.',
});
```

See the [Claude Platform on AWS Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic-aws) for more information.
