import { StreamState } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Context } from '../context';

export default {
  type: 'stream',
  async execute({ context }) {
    // TODO onFinal should resolve context
    const result = streamText({
      model: openai('gpt-4o'),
      prompt: context.prompt,
    });

    return {
      context: Promise.resolve(context),
      stream: result.toDataStream().pipeThrough(new TextDecoderStream()),
    };
  },
} satisfies StreamState<Context, string>;
