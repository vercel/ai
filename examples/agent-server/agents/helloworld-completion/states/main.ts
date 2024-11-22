import { StreamState } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Context } from '../context';

export default {
  type: 'stream',
  async execute({ context }) {
    const result = streamText({
      model: openai('gpt-4o'),
      prompt: context.prompt,
    });

    return {
      // streamText will expose streams specifically for the agent server
      // in the future:
      // stream: result.toAgentStream()
      // for now we need to decode:
      stream: result.toDataStream().pipeThrough(new TextDecoderStream()),
    };
  },
} satisfies StreamState<Context, string>;
