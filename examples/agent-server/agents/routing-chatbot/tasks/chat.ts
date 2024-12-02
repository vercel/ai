import { StreamTask } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Context } from '../agent';

export default {
  type: 'stream',
  async execute({ context, mergeStream }) {
    const result = streamText({
      model: openai('gpt-4o'),
      system: 'You are a friendly chatbot. Respond briefly and concisely.',
      messages: context.messages,
    });

    mergeStream(result.toAgentStream());

    return { nextTask: 'END' };
  },
} satisfies StreamTask<Context, string>;
