# Parallel Provider Examples

## Basic Usage

```typescript
import { parallel } from '@ai-sdk/parallel';
import { generateText } from 'ai';

const { text } = await generateText({
  model: parallel('speed'),
  prompt: 'What does Parallel Web Systems do?',
});

console.log(text);
```

## Streaming Example

```typescript
import { parallel } from '@ai-sdk/parallel';
import { streamText } from 'ai';

const result = await streamText({
  model: parallel('speed'),
  prompt: 'Explain quantum computing in simple terms',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## JSON Schema Response Format

```typescript
import { parallel } from '@ai-sdk/parallel';
import { generateText } from 'ai';

const { text } = await generateText({
  model: parallel('speed'),
  prompt: 'What does Parallel Web Systems do?',
  output: 'object',
  schema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'Think step by step to arrive at the answer',
      },
      answer: {
        type: 'string',
        description: 'The direct answer to the question',
      },
      citations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Sources cited to support the answer',
      },
    },
  },
});

console.log(text);
```

## Custom Configuration

```typescript
import { createParallel } from '@ai-sdk/parallel';
import { generateText } from 'ai';

const parallel = createParallel({
  apiKey: process.env.PARALLEL_API_KEY,
  baseURL: 'https://api.parallel.ai',
  headers: {
    'Custom-Header': 'value',
  },
});

const { text } = await generateText({
  model: parallel('speed'),
  prompt: 'What are the latest developments in AI?',
});
```

## Environment Variables

Set your Parallel API key as an environment variable:

```bash
export PARALLEL_API_KEY='your-api-key-here'
```

Or use a `.env` file:

```
PARALLEL_API_KEY=your-api-key-here
```

## Rate Limits

The Parallel Chat API provides:
- 300 requests per minute by default
- 3 second p50 TTFT (median time to first token) with streaming
- Low latency optimized for interactive applications

For production capacity requirements, contact the Parallel team.

