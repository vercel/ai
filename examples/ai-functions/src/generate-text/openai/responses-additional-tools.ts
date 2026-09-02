import { openai } from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

const messages = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Call the get_weather tool for Chicago.',
        providerOptions: {
          openai: {
            additionalTools: [
              {
                type: 'function',
                name: 'get_weather',
                description: 'Get the weather at a location.',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                  required: ['location'],
                  additionalProperties: false,
                },
              },
            ],
          },
        },
      },
    ],
  },
] satisfies ModelMessage[];

run(async () => {
  const result = await generateText({
    model: openai('gpt-5.6-sol'),
    messages,
  });

  print('Content:', result.content);
  print('Finish reason:', result.finishReason);
});
