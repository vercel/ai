This code currently generates this:
```ts
import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        parameters: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        // location below is inferred to be a string:
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    prompt: 'What is the weather in San Francisco?',
  });

  console.dir(result.response.messages, { depth: null });
}

main().catch(console.error);
```

```
[
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call_1CKHGY2wN3HUjL8IrEnQVTJi',
        toolName: 'weather',
        args: { location: 'San Francisco' }
      }
    ]
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call_1CKHGY2wN3HUjL8IrEnQVTJi',
        toolName: 'weather',
        result: { location: 'San Francisco', temperature: 81 }
      }
    ]
  }
]
```

I want to be able to add a `requiresConfirmation` flag to stop the generation as the generation of the tool call. e.g.

```ts
import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    tools: {
      weather: tool({
        requiresConfirmation: true, // new flag
        description: 'Get the weather in a location',
        parameters: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        // location below is inferred to be a string:
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    prompt: 'What is the weather in San Francisco?',
  });

  console.dir(result.response.messages, { depth: null });
}

main().catch(console.error);
```

and that will lead to this output:

```
[
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call_1CKHGY2wN3HUjL8IrEnQVTJi',
        toolName: 'weather',
        args: { location: 'San Francisco' }
      }
    ]
  },
]
```

I could then take that set of messages (just a tool call), send it back to generateText, and it would execute the tool call and continue.


So my next request to the language model with response.messages would look the same, but this time it would return.

```ts
import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    tools: {
      weather: tool({
        requiresConfirmation: true,
        description: 'Get the weather in a location',
        parameters: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        // location below is inferred to be a string:
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    prompt: 'What is the weather in San Francisco?',
  });

  const result2 = await generateText({
    model: openai('gpt-3.5-turbo'),
    messages: result.response.messages,
    tools: {
      weather: tool({
        requiresConfirmation: true,
        description: 'Get the weather in a location',
        parameters: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        // location below is inferred to be a string:
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
  });

  console.dir(result2.response.messages, { depth: null });
}

main().catch(console.error);
```

```
[
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call_1CKHGY2wN3HUjL8IrEnQVTJi',
        toolName: 'weather',
        result: { location: 'San Francisco', temperature: 81 }
      }
    ]
  }
]
```

If that makes sense, please make the necessary changes, otherwise please ask clarifying questions.

note: this logic will sit in packages/ai and likely in the core folder 