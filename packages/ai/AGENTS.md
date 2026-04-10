# AI SDK Usage

## Use Cases

### Generating Text

#### text prompt

```ts
import { generateText } from 'ai';

const result = await generateText({
  model: 'openai/gpt-5',
  prompt: 'Invent a new holiday.', // text prompt
});

const text = result.text; // access generated text
```

#### Specifying the maximum number of tokens to generate

```ts
import { generateText } from 'ai';

const result = await generateText({
  model: 'openai/gpt-5',
  prompt: 'Invent a new holiday.',
  maxOutputTokens: 100, // maximum number of tokens to generate
});
```

### Streaming Text

#### text prompt and text stream

```ts
import { streamText } from 'ai';

const result = streamText({
  model: 'openai/gpt-5',
  prompt: 'Invent a new holiday.', // text prompt
});

const textStream = result.textStream; // access text stream
```

#### Specifying the maximum number of tokens to generate

```ts
import { streamText } from 'ai';

const result = streamText({
  model: 'openai/gpt-5',
  prompt: 'Invent a new holiday.',
  maxOutputTokens: 100, // maximum number of tokens to generate
});
```

### Structured Output

#### Generating a typed object

```ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: 'openai/gpt-5',
  prompt: 'Generate a recipe for a holiday.',
  output: Output.object({
    schema: z.object({
      name: z.string(),
      ingredients: z.array(z.string()),
      steps: z.array(z.string()),
    }),
  }),
});

const recipe = result.object; // typed as { name: string; ingredients: string[]; steps: string[] }
```

### Tool Calling

#### Defining and using tools

```ts
import { generateText, tool } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: 'openai/gpt-5',
  prompt: 'What is the weather in San Francisco?',
  tools: {
    getWeather: tool({
      description: 'Get the weather for a location',
      inputSchema: z.object({
        location: z.string().describe('The city name'),
      }),
      execute: async ({ location }) => {
        return { temperature: 72, condition: 'sunny' };
      },
    }),
  },
});
```

### Multi-Step Agents

#### Using the Agent class with stopWhen

```ts
import { Agent, stepCountIs } from 'ai';

const agent = new Agent({
  model: 'openai/gpt-5',
  instructions: 'You are a helpful research assistant.',
  tools: { /* ... */ },
});

const result = await agent.generate({
  messages: [{ role: 'user', content: 'Research quantum computing' }],
  stopWhen: stepCountIs(5),
});
```

### Embeddings

#### Generating embeddings

```ts
import { embed, embedMany } from 'ai';

const { embedding } = await embed({
  model: embeddingModel,
  value: 'sunny day at the beach',
});

const { embeddings } = await embedMany({
  model: embeddingModel,
  values: ['sunny day at the beach', 'rainy afternoon in the city'],
});
```

### Image Generation

#### Generating images via multimodal LLM

```ts
import { generateText } from 'ai';

const result = await generateText({
  model: 'google/gemini-3.1-flash-image-preview',
  prompt: 'Generate an image of a futuristic city',
});

const images = result.files; // generated image files
```
