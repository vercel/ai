import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const google = createGoogleGenerativeAI();
  const model = google('gemini-3-flash-preview');

  const result = await generateText({
    model,
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

  console.log('Text:', result.text);
  console.log('Steps:', result.steps.length);

  for (const step of result.steps) {
    console.log('---');
    console.log('Step finish reason:', step.finishReason);
    for (const content of step.content) {
      if (content.type === 'tool-call') {
        console.log('Tool call:', content.toolName, content.input);
        console.log(
          'Provider metadata:',
          JSON.stringify(content.providerMetadata),
        );
      }
    }
  }
});
