import { StreamTask } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Context } from '../agent';

export default {
  type: 'stream', // state type, in the future there will be other types
  async execute({ context, mergeStream }) {
    const result = streamText({
      model: openai('gpt-4o'),
      prompt: context.prompt,
    });

    // forward the stream as soon as possible while allowing for blocking operations:
    mergeStream(result.toAgentStream());

    return { nextTask: 'END' };
  },
} satisfies StreamTask<Context, string>;
