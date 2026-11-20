# AI SDK - TUI

Run local or remote AI SDK agents in a terminal UI. `@ai-sdk/tui` provides a
full-screen interface with streaming output, tool cards, approvals, markdown
rendering, scrollback, and a pinned prompt.

## Setup

```bash
npm i ai @ai-sdk/tui @ai-sdk/openai zod
```

## Usage

```ts
import { openai } from '@ai-sdk/openai';
import { runAgentTUI } from '@ai-sdk/tui';
import { ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';

await runAgentTUI({
  title: 'Weather Agent',
  agent: new ToolLoopAgent({
    model: openai('gpt-6-luna'),
    instructions:
      'You are a concise weather assistant.' +
      'Use the weather tool when the user asks about weather, ' +
      'then answer in markdown.',
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({ city: z.string() }),
        execute({ city }) {
          const weatherOptions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
          const weather =
            weatherOptions[Math.floor(Math.random() * weatherOptions.length)];

          return { city, temperature: 72, weather };
        },
      }),
    },
    toolApproval: {
      weather: 'user-approval',
    },
  }),
});
```

See the [AI SDK TUI documentation](https://ai-sdk.dev/docs/agents/terminal-ui) for more information.
