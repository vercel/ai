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
      // streamText will expose streams specifically for the agent server
      // in the future:
      // stream: result.toAgentStream()
      // for now we need to decode:
      stream: result.toDataStream().pipeThrough(new TextDecoderStream()),
      nextState: 'END',
    };
  },
} satisfies StreamState<Context, string>;
