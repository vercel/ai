import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { streamText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: 'anthropic/claude-sonnet-4.6',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: fs.readFileSync('./data/comic-cat.png'),
          },
        ],
      },
    ],
    providerOptions: {
      gateway: {
        has: ['vision'],
      } satisfies GatewayProviderOptions,
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
