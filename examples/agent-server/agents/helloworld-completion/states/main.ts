import { StreamState } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Context } from '../context';

export default {
  type: 'stream', // state type, in the future there will be other types
  async execute({ context }) {
    const result = streamText({
      model: openai('gpt-4o'),
      prompt: context.prompt,
    });

    return {
      stream: result.toAgentStream(),
      nextState: 'END',
    };
  },
} satisfies StreamState<Context, string>;
