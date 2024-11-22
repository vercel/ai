import { StreamState } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Context } from '../agent';

export default {
  type: 'stream',
  async execute({ context, forwardStream }) {
    const result = streamText({
      model: openai('gpt-4o'),
      system:
        'You are an outstanding writer. ' +
        'Write a blog post. ' +
        'The blog post MUST BE at least 4 paragraphs long. ',
      messages: context.messages,
    });

    // forward the stream as soon as possible while allowing for blocking operations:
    forwardStream(result.toAgentStream());

    return { nextState: 'END' };
  },
} satisfies StreamState<Context, string>;
