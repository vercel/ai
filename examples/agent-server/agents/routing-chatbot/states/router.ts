import { StreamState } from '@ai-sdk/agent-server';
import { generateObject, StreamData } from 'ai';
import { Context } from '../agent';
import { openai } from '@ai-sdk/openai';

export default {
  type: 'stream',
  async execute({ context }) {
    const streamData = new StreamData();
    streamData.append({ status: 'analyzing message' });
    streamData.close();

    // todo correct delay
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

    return {
      // will be simplified to streamData.toAgentStream() in the future
      stream: streamData.stream.pipeThrough(new TextDecoderStream()),
      nextState: result.object,
    };
  },
} satisfies StreamState<Context, string>;
