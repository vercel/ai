import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-opus-4-8'),
    // required for system messages inside `messages`:
    allowSystemInMessages: true,
    messages: [
      {
        role: 'user',
        content: 'Which tools do you have for weather in Paris?',
      },
      {
        // Define a tool by value mid-conversation. It does not need to be
        // declared in `tools`, and the inline-tools-2026-09-15 beta header is
        // added automatically.
        role: 'system',
        content: '',
        providerOptions: {
          anthropic: {
            toolChanges: [
              {
                type: 'tool_addition',
                tool: {
                  type: 'function',
                  name: 'get_forecast',
                  description: 'Get 5-day forecast',
                  inputSchema: {
                    type: 'object',
                    properties: { city: { type: 'string' } },
                    required: ['city'],
                  },
                },
              },
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
