import { agenticTask } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { Context } from '../workflow';

export default agenticTask<Context>({
  model: openai('gpt-4'),
  prepare: async ({ context }) => {
    // artificial delay:
    await new Promise(resolve => setTimeout(resolve, 15000));

    return {
      messages: [{ role: 'user', content: context.prompt }],
    };
  },
  finalize: async () => ({ nextTask: 'END' }),
});
