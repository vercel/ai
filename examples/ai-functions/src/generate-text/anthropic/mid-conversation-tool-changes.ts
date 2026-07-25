import { anthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-opus-4-8'),
    // required for system messages inside `messages`:
    allowSystemInMessages: true,
    tools: {
      get_weather: tool({
        description: 'Get weather',
        inputSchema: z.object({ city: z.string() }),
      }),
      get_forecast: tool({
        description: 'Get 5-day forecast',
        inputSchema: z.object({ city: z.string() }),
        providerOptions: {
          // declared up front but not loaded until a tool_addition surfaces it
          anthropic: { deferLoading: true },
        },
      }),
    },
    messages: [
      {
        role: 'user',
        content: 'What tools do you have for weather in Paris?',
      },
      {
        // Mid-conversation tool changes: surface the deferred forecast tool
        // and remove the weather tool, without invalidating the prompt cache.
        // The mid-conversation-tool-changes-2026-07-01 beta header is added
        // automatically.
        role: 'system',
        content: '',
        providerOptions: {
          anthropic: {
            toolChanges: [
              { type: 'tool_addition', toolName: 'get_forecast' },
              { type: 'tool_removal', toolName: 'get_weather' },
            ],
          },
        },
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log('Warnings:', result.finalStep.warnings);
});
