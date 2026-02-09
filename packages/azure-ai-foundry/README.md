# AI SDK - Azure AI Foundry Provider

The **Azure AI Foundry provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model and embedding model support for the [Azure AI Foundry](https://ai.azure.com/) model marketplace.

It supports **all** models deployed through Azure AI Foundry — including OpenAI, Meta Llama, DeepSeek, Mistral, Cohere, xAI Grok, and Anthropic Claude — with a single provider and credential.

## Setup

The Azure AI Foundry provider is available in the `@ai-sdk/azure-ai-foundry` module. You can install it with

```bash
npm i @ai-sdk/azure-ai-foundry
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `azureAIFoundry` from `@ai-sdk/azure-ai-foundry`:

```ts
import { azureAIFoundry } from '@ai-sdk/azure-ai-foundry';
```

To configure the provider with your Azure resource, use the `createAzureAIFoundry` function:

### API Key Authentication

```ts
import { createAzureAIFoundry } from '@ai-sdk/azure-ai-foundry';

const foundry = createAzureAIFoundry({
  resourceName: 'my-resource',
  apiKey: process.env.AZURE_API_KEY,
});
```

### Microsoft Entra ID Authentication

```ts
import { createAzureAIFoundry } from '@ai-sdk/azure-ai-foundry';
import {
  DefaultAzureCredential,
  getBearerTokenProvider,
} from '@azure/identity';

const tokenProvider = getBearerTokenProvider(
  new DefaultAzureCredential(),
  'https://cognitiveservices.azure.com/.default',
);

const foundry = createAzureAIFoundry({
  resourceName: 'my-resource',
  tokenProvider,
});
```

## Examples

### Chat / Language Model

Use any model deployed to your Azure AI Foundry resource — OpenAI, Meta, DeepSeek, xAI, Mistral, and more:

```ts
import { createAzureAIFoundry } from '@ai-sdk/azure-ai-foundry';
import { generateText } from 'ai';

const foundry = createAzureAIFoundry({
  resourceName: 'my-resource',
  apiKey: process.env.AZURE_API_KEY,
});

const { text } = await generateText({
  model: foundry('DeepSeek-R1'),
  prompt: 'Explain quantum computing in simple terms.',
});
```

### Claude on Foundry

Claude models are automatically detected by the `claude-*` prefix and routed to the Anthropic Messages API endpoint:

```ts
import { createAzureAIFoundry } from '@ai-sdk/azure-ai-foundry';
import { generateText } from 'ai';

const foundry = createAzureAIFoundry({
  resourceName: 'my-resource',
  apiKey: process.env.AZURE_API_KEY,
});

const { text } = await generateText({
  model: foundry('claude-sonnet-4-5'),
  prompt: 'Write a haiku about Azure.',
});
```

For Claude deployments with custom names that don't start with `claude-`, use the `anthropicDeployments` setting:

```ts
const foundry = createAzureAIFoundry({
  resourceName: 'my-resource',
  apiKey: process.env.AZURE_API_KEY,
  anthropicDeployments: ['my-custom-claude'],
});
```

### Embeddings

```ts
import { createAzureAIFoundry } from '@ai-sdk/azure-ai-foundry';
import { embed } from 'ai';

const foundry = createAzureAIFoundry({
  resourceName: 'my-resource',
  apiKey: process.env.AZURE_API_KEY,
});

const { embedding } = await embed({
  model: foundry.embeddingModel('text-embedding-3-large'),
  value: 'The quick brown fox jumps over the lazy dog.',
});
```

## Documentation

Please check out the **[AI SDK docs](https://ai-sdk.dev/docs)** for more information.
