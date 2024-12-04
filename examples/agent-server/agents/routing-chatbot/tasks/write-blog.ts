import { streamTask } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Context } from '../agent';

export default streamTask<Context, string>({
  async execute({ context, mergeStream }) {
    const result = streamText({
      model: openai('gpt-4o'),
      system:
        'You are an outstanding writer. ' +
        'Write a blog post. ' +
        'The blog post MUST BE at least 4 paragraphs long. ',
      messages: context.messages,
    });

    mergeStream(result.toAgentStream());

    return { nextTask: 'END' };
  },
});
