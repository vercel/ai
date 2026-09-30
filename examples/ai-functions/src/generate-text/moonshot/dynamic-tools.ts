import {
  moonshotai,
  type MoonshotAISystemMessageProviderOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    allowSystemInMessages: true,
    messages: [
      { role: 'user', content: 'Calculate 23 * 47.' },
      {
        role: 'system',
        content: '',
        providerOptions: {
          moonshotai: {
            tools: [
              {
                type: 'function',
                name: 'calculator',
                description: 'Evaluate an arithmetic expression',
                inputSchema: {
                  type: 'object',
                  properties: { expression: { type: 'string' } },
                  required: ['expression'],
                },
              },
            ],
          } satisfies MoonshotAISystemMessageProviderOptions,
        },
      },
    ],
  });

  console.log(result.toolCalls);
});
