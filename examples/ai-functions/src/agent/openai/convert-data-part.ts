import { openai } from '@ai-sdk/openai';
import { createAgentUIStream, ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const agent = new ToolLoopAgent({
    model: openai('gpt-5.4-nano'),
    maxRetries: 0,
  });

  const stream = await createAgentUIStream({
    agent,
    uiMessages: [
      {
        id: '1',
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'Return the secret code from the context. If absent, return MISSING.',
          },
          { type: 'data-context', data: 'ORCHID-7391' },
        ],
      },
    ],
    convertDataPart: part => {
      if (part.type === 'data-context' && typeof part.data === 'string') {
        return { type: 'text', text: `Secret code: ${part.data}` };
      }
    },
  });

  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      process.stdout.write(chunk.delta);
    } else if (chunk.type === 'error') {
      throw new Error(chunk.errorText);
    }
  }
  process.stdout.write('\n');
});
