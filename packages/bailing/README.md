# Bailing AI Provider

[![npm version](https://img.shields.io/npm/v/@ai-sdk/bailing.svg)](https://www.npmjs.com/package/@ai-sdk/bailing)

Bailing AI Provider is a provider package for the AI SDK that allows you to use Bailing AI models in your applications.

## Quick Start

### Installation

```bash
npm install @ai-sdk/bailing
```

### Usage

```ts
import { bailing } from '@ai-sdk/bailing';
import { generateText } from 'ai';

const { text } = await generateText({
  model: bailing('Ling-1T'),
  prompt: 'Hello, world!',
});

console.log(text);
```

## Configuration

### API Key

You need to provide a Bailing API key to use this provider. You can provide the key in the following ways:

1. Through the `apiKey` option of the `createBailing` function:

```ts
import { createBailing } from '@ai-sdk/bailing';

const bailing = createBailing({
  apiKey: 'your-api-key',
});
```

2. By setting the `BAILING_API_KEY` environment variable:

```bash
export BAILING_API_KEY=your-api-key
```

### Custom Configuration

You can customize provider settings:

```ts
import { createBailing } from '@ai-sdk/bailing';

const bailing = createBailing({
  baseURL: 'https://api.tbox.cn/api/llm/v1',
  headers: {
    'Custom-Header': 'value',
  },
  queryParams: {
    'api-version': 'v1',
  },
});
```

### Using Search Options

You can enable web search capabilities using the `enable_search`:

```ts
import { createBailing } from '@ai-sdk/bailing';
import { generateText } from 'ai';

const bailing = createBailing({
  apiKey: 'your-api-key',
});

const { text } = await generateText({
  model: bailing.chatModel('Ling-1T'),
  prompt: 'What is the latest news about AI?',
  providerOptions: {
    bailing: {
      enable_search: true,
      search_options: {
        forced_search: false
      }
    }
  }
});

console.log(text);
```

## Supported Models

### Chat Models

- `Ling-1T`
- `Ring-1T`

