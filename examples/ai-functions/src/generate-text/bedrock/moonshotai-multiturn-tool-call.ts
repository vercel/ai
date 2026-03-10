import { bedrock } from '@ai-sdk/amazon-bedrock';
import { moonshotai } from '@ai-sdk/moonshotai';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

/**
 * Real multi-turn: get a tool call from moonshotai (which generates IDs
 * like "weather:0"), then send the tool call back to bedrock.
 */
run(async () => {
  const tools = {
    get_weather: tool({
      description: 'Get the current weather for a given city.',
      inputSchema: z.object({
        location: z.string().describe('City name'),
      }),
      execute: async ({ location }) => ({
        location,
        temperature: 72,
        condition: 'Sunny',
      }),
    }),
  };

  // Step 1: Get tool call from moonshotai
  console.log('--- Step 1: Get tool call from moonshotai ---');
  const step1 = await generateText({
    model: moonshotai('kimi-k2.5'),
    tools,
    prompt: 'What is the weather in Tokyo? Use the get_weather tool.',
  });

  const tc = step1.steps[0]?.toolCalls?.[0];
  if (!tc) {
    console.error('No tool call returned — re-run.');
    return;
  }

  console.log(`  Tool call ID: "${tc.toolCallId}"`);
  console.log(`  Tool name: "${tc.toolName}"`);

  // Step 2: Send that to bedrock
  console.log('\n--- Step 2: Send moonshot tool call to bedrock ---');
  try {
    const step2 = await generateText({
      model: bedrock('moonshotai.kimi-k2.5'),
      tools,
      messages: [
        { role: 'user', content: 'What is the weather in Tokyo?' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.input,
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              output: {
                type: 'json' as const,
                value: {
                  location: 'Tokyo',
                  temperature: 72,
                  condition: 'Sunny',
                },
              },
            },
          ],
        },
      ],
    });
    console.log('PASS:', step2.text?.substring(0, 150));
  } catch (e) {
    console.log('FAIL:', e instanceof Error ? e.message.substring(0, 200) : e);
  }
});
