# Vercel AI SDK - Cloudflare AI Gateway Provider

The **[Cloudflare AI Gateway provider](https://ai-sdk.dev/providers/ai-sdk-providers/cloudflare-ai-gateway)** for the [Vercel AI SDK](https://ai-sdk.dev/docs) enables you to use Cloudflare's AI Gateway to gain visibility and control over your AI applications with features like analytics, logging, caching, rate limiting, request retry, and model fallback.

## Setup

The Cloudflare AI Gateway provider is available in the `@ai-sdk/cloudflare-ai-gateway` module. You can install it with:

```bash
npm install @ai-sdk/cloudflare-ai-gateway
```

## Provider Instance

You can create a Cloudflare AI Gateway provider instance with the `createCloudflareAIGateway` function:

```ts
import { createCloudflareAIGateway } from '@ai-sdk/cloudflare-ai-gateway';

const cloudflare = createCloudflareAIGateway({
  accountId: 'your-account-id', // or set CLOUDFLARE_ACCOUNT_ID env var
  gatewayId: 'your-gateway-id', // or set CLOUDFLARE_GATEWAY_ID env var
  apiKey: 'your-provider-api-key', // Provider API key (e.g., OpenAI key)
});
```

## Authentication Methods

Cloudflare AI Gateway supports three authentication methods:

### 1. Provider API Key in Request (Unauthenticated Gateway)

Pass your upstream provider's API key (e.g., OpenAI, Anthropic):

```ts
import { createCloudflareAIGateway } from '@ai-sdk/cloudflare-ai-gateway';

const cloudflare = createCloudflareAIGateway({
  accountId: 'your-account-id',
  gatewayId: 'your-gateway-id',
  apiKey: 'your-openai-api-key', // or CLOUDFLARE_AI_GATEWAY_API_KEY env var
});
```

### 2. Authenticated Gateway

For authenticated gateways, provide both the provider API key and Cloudflare API token:

```ts
import { createCloudflareAIGateway } from '@ai-sdk/cloudflare-ai-gateway';

const cloudflare = createCloudflareAIGateway({
  accountId: 'your-account-id',
  gatewayId: 'your-gateway-id',
  apiKey: 'your-provider-api-key',
  cfApiToken: 'your-cloudflare-api-token', // or CLOUDFLARE_API_TOKEN env var
});
```

### 3. BYOK (Bring Your Own Keys) / Unified Billing

If you've stored your API keys with Cloudflare or are using Unified Billing, only provide the Cloudflare API token:

```ts
import { createCloudflareAIGateway } from '@ai-sdk/cloudflare-ai-gateway';

const cloudflare = createCloudflareAIGateway({
  accountId: 'your-account-id',
  gatewayId: 'your-gateway-id',
  cfApiToken: 'your-cloudflare-api-token',
});
```

## Language Models

You can create language models using the OpenAI-compatible `/chat/completions` endpoint. Specify models using the format `{provider}/{model}`:

```ts
import { createCloudflareAIGateway } from '@ai-sdk/cloudflare-ai-gateway';
import { generateText } from 'ai';

const cloudflare = createCloudflareAIGateway({
  accountId: 'your-account-id',
  gatewayId: 'your-gateway-id',
  apiKey: 'your-provider-api-key',
});

const { text } = await generateText({
  model: cloudflare('openai/gpt-4'),
  prompt: 'What is Cloudflare AI Gateway?',
});
```

### Supported Providers

Cloudflare AI Gateway supports models from multiple providers:

- **OpenAI**: `openai/gpt-4`, `openai/gpt-4-turbo`, `openai/gpt-3.5-turbo`
- **Anthropic**: `anthropic/claude-3-5-sonnet-20241022`, `anthropic/claude-3-opus-20240229`
- **Google AI Studio**: `google-ai-studio/gemini-2.5-flash`, `google-ai-studio/gemini-pro`
- **Google Vertex AI**: `vertex-ai/gemini-pro`
- **Groq**: `groq/llama-3.1-70b-versatile`, `groq/mixtral-8x7b-32768`
- **Mistral**: `mistral/mistral-large-latest`, `mistral/mistral-small-latest`
- **Cohere**: `cohere/command-r-plus`, `cohere/command-r`
- **Perplexity**: `perplexity/llama-3.1-sonar-large-128k-online`
- **Workers AI**: `@cf/meta/llama-3-8b-instruct`, `@cf/mistral/mistral-7b-instruct-v0.1`
- **xAI**: `xai/grok-beta`
- **DeepSeek**: `deepseek/deepseek-chat`, `deepseek/deepseek-coder`
- **Cerebras**: `cerebras/llama3.1-8b`, `cerebras/llama3.1-70b`
- **Baseten**: Various open-source models

### Example: Switching Providers

```ts
import { createCloudflareAIGateway } from '@ai-sdk/cloudflare-ai-gateway';
import { generateText } from 'ai';

const cloudflare = createCloudflareAIGateway({
  accountId: 'your-account-id',
  gatewayId: 'your-gateway-id',
  apiKey: 'your-api-key',
});

// Use OpenAI
const openaiResult = await generateText({
  model: cloudflare('openai/gpt-4'),
  prompt: 'Hello!',
});

// Use Anthropic
const anthropicResult = await generateText({
  model: cloudflare('anthropic/claude-3-5-sonnet-20241022'),
  prompt: 'Hello!',
});

// Use Google
const googleResult = await generateText({
  model: cloudflare('google-ai-studio/gemini-2.5-flash'),
  prompt: 'Hello!',
});
```

## Features

Cloudflare AI Gateway provides powerful features that work transparently with your AI models:

### Analytics

View metrics such as the number of requests, tokens, and costs in the Cloudflare dashboard.

### Logging

Gain insight into requests and errors through detailed logs.

### Caching

Serve requests directly from Cloudflare's cache for faster responses and cost savings.

### Rate Limiting

Control how your application scales by limiting the number of requests.

### Request Retry and Fallback

Improve resilience by defining request retries and model fallbacks in case of errors.

## Documentation

Please check out the **[Cloudflare AI Gateway documentation](https://developers.cloudflare.com/ai-gateway/)** for more information about features and configuration.

For Vercel AI SDK documentation, visit [ai-sdk.dev/docs](https://ai-sdk.dev/docs).
