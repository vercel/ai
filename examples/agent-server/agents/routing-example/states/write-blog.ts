import { StreamState } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Context } from '../context';

export default {
  type: 'stream',
  async execute({ context }) {
    const result = streamText({
      model: openai('gpt-4o'),
      system:
        'You are an outstanding writer. ' +
        'Write a blog post. ' +
        'The blog post MUST BE at least 4 paragraphs long. ',
      prompt: context.prompt,
    });

    return {
      stream: result.toAgentStream(),
      nextState: 'END',
    };
  },
} satisfies StreamState<Context, string>;
