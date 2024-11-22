import { StreamState } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { generateObject, StreamData } from 'ai';
import { Context } from '../agent';

export default {
  type: 'stream',
  async execute({ context }) {
    const streamData = new StreamData();
    streamData.append({ status: 'analyzing message' });
    streamData.close();

    // immediately start streaming and then resolve the nextState promise
    // when the LLM has finished processing
    return {
      stream: streamData.toAgentStream(),
      nextState: new Promise(async resolve => {
        const lastUserMessage = context.messages.at(-1)?.content;
        const result = await generateObject({
          model: openai('gpt-4o-mini', { structuredOutputs: true }),
          output: 'enum',
          enum: ['write-blog', 'chat'],
          system:
            `You classify user messages. ` +
            `There are two possible modes: ` +
            `- write-blog: the user wants to write a blog post. ` +
            `- chat: the user wants to chat. ` +
            `Unless there is a clear indication to the contrary, default to chat.`,
          prompt: `Here is the last user message: ${lastUserMessage}`,
        });

        resolve(result.object);
      }),
    };
  },
} satisfies StreamState<Context, string>;
