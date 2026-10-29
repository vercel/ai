# AI SDK - Workflow

WorkflowAgent is a class for building durable AI agents that can maintain state across workflow steps, call tools, and handle interruptions gracefully.

## Setup

```bash
npm i @ai-sdk/workflow zod ai workflow@5
```

## Usage

```typescript
import { WorkflowAgent } from '@ai-sdk/workflow';
import { z } from 'zod';

const agent = new WorkflowAgent({
  model: 'anthropic/claude-opus-5.5',
  tools: {
    getWeather: {
      description: 'Get weather for a location',
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) => {
        // Fetch weather data
        return { temperature: 72, condition: 'sunny' };
      },
    },
  },
  system: 'You are a helpful weather assistant.',
});

const result = await agent.stream({
  messages: [{ role: 'user', content: 'What is the weather in SF?' }],
  writable: new WritableStream({
    write(chunk) {
      console.log('Chunk:', chunk);
    },
  }),
});

console.log('Final messages:', result.messages);
console.log('Steps:', result.steps);
```

See the [Workflow documentation](https://ai-sdk.dev/docs/agents/workflow-agent) for more information.
