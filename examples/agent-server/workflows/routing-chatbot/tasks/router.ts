import { dataStreamTask } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { Context } from '../workflow';

export default dataStreamTask<Context>({
  async execute({ context, writer }) {
    writer.writeData({ status: 'analyzing message' });

    // blocking operation, but we already started streaming:
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

    return { nextTask: result.object };
  },
});
