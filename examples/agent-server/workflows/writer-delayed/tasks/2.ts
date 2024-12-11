import { task } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Context } from '../workflow';

export default task<Context, string>({
  async execute({ context, mergeStream }) {
    // wait for 15 seconds
    await new Promise(resolve => setTimeout(resolve, 15000));

    const result = streamText({
      model: openai('gpt-4'), // slow model
      prompt: context.prompt,
    });

    // forward the stream as soon as possible while allowing for blocking operations:
    mergeStream(result.toAgentStream());

    return { nextTask: 'END' };
  },
});
