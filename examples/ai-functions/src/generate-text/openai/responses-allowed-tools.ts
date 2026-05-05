import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { weatherTool } from '../../tools/weather-tool';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-4o-mini'),
    tools: {
      weather: weatherTool,
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
      }),
    },
    providerOptions: {
      openai: {
        allowedTools: { toolNames: ['weather'], mode: 'auto' },
      },
    },
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',
  });

  console.log(JSON.stringify(result.toolCalls, null, 2));
  console.log(JSON.stringify(result.toolResults, null, 2));
  console.log(JSON.stringify(result.finishReason, null, 2));
});
