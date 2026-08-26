# @ai-sdk/workflow

WorkflowAgent is a class for building durable AI agents that can maintain state across workflow steps, call tools, and handle interruptions gracefully.

## Installation

```bash
npm install @ai-sdk/workflow ai workflow@beta
```

## Usage

```typescript
import { WorkflowAgent } from '@ai-sdk/workflow';
import { z } from 'zod';

const agent = new WorkflowAgent({
  model: 'anthropic/claude-opus',
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

### Durable video generation

`experimental_generateVideo` starts asynchronous video generation, suspends the
workflow until a provider webhook arrives, and returns the provider's video
data without downloading hosted URLs.

```typescript
import { experimental_generateVideo as generateVideo } from '@ai-sdk/workflow/video';

export async function videoWorkflow(prompt: string) {
  'use workflow';

  const result = await generateVideo({
    model: 'klingai/kling-v3.0-t2v',
    prompt,
  });

  return result.videos;
}
```

The workflow can persist, copy, or process each returned video URL in a
separate step without serializing the video bytes through the workflow.

## Features

- **Streaming Support**: Stream responses in real-time
- **Tool Calling**: Execute tools dynamically during conversation
- **Context Management**: Pass context between steps
- **Error Handling**: Robust error handling with callbacks
- **Structured Output**: Parse structured outputs from LLM responses
- **Step Callbacks**: Hook into each step of the agent loop
- **Provider-Executed Tools**: Support for provider-executed tools
- **Abort Support**: Cancel operations with AbortSignal
- **Durable Video Generation**: Suspend on video webhooks without polling or automatically downloading hosted videos

## API

See the [AI SDK documentation](https://ai-sdk.dev/docs) for full API details.

## License

Apache-2.0
