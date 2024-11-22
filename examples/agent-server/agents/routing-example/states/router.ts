import { StreamState } from '@ai-sdk/agent-server';
import { Context } from '../context';
import { StreamData } from 'ai';

export default {
  type: 'stream',
  async execute({ context }) {
    const streamData = new StreamData();
    streamData.append({ status: 'selecting route' });
    streamData.close();

    return {
      // will be simplified to streamData.toAgentStream() in the future
      stream: streamData.stream.pipeThrough(new TextDecoderStream()),
      context: {
        ...context,
        selectedRoute: context.prompt.includes('write') ? 'writer' : 'chatbot',
      },
    };
  },
} satisfies StreamState<Context, string>;
