import { gateway, streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: gateway('google/gemini-3-flash-preview'),
    tools: {
      weather: tool({
        description: 'Get the current weather in a given location',
        inputSchema: z.object({
          location: z
            .string()
            .describe('The city and state, e.g. San Francisco, CA'),
        }),
        execute: async ({ location }) => ({
          location,
          temperature: 72,
          unit: 'fahrenheit',
        }),
      }),
    },
    stopWhen: result => result.steps.length >= 3,
    prompt: 'What is the weather in San Francisco?',
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        process.stdout.write(chunk.text);
        break;
      case 'reasoning-delta':
        break;
      case 'tool-call':
        console.log('Tool call:', chunk.toolName, chunk.input);
        break;
      case 'tool-result':
        console.log('Tool result:', JSON.stringify(chunk.output));
        break;
    }
  }

  console.log();
  console.log('Steps:', (await result.steps).length);

  for (const step of await result.steps) {
    console.log('---');
    console.log('Step finish reason:', step.finishReason);
    for (const content of step.content) {
      if (content.type === 'tool-call') {
        console.log(
          'Provider metadata:',
          JSON.stringify(content.providerMetadata),
        );
      }
    }
  }
});
