import OpenAI from 'openai';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import { Memory, Message, ZepClient } from '@getzep/zep-js';
import { ChatCompletionMessageParam } from 'ai/prompts';

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();
  const lastMessage = messages[messages.length - 1];

  const zep = await ZepClient.init(process.env.ZEP_API_KEY);
  // Add the user message to the memory
  await zep.memory.addMemory(
    sessionId,
    new Memory({
      messages: [
        new Message({
          role: lastMessage.role,
          content: lastMessage.content,
          role_type: 'user'
        })
      ]
    })
  );
  // Retrieve the memory and create a system message with conversation facts + most recent summary
  const memory = await zep.memory.getMemory(sessionId, 'perpetual');
  let systemContent = '';
  if (memory?.summary) {
    systemContent += memory.summary.content;
  }
  if (memory?.facts) {
    systemContent += `\n${memory.facts.join('\n')}`;
  }
  const systemMessage: ChatCompletionMessageParam = {
    content: systemContent,
    role: 'system'
  };
  // Create a list of openai friendly memory messages
  const memoryMessages: ChatCompletionMessageParam[] = (memory?.messages ?? []).map((message) => ({
    content: message.content,
    role: message.role_type as 'assistant' | 'system' | 'user'
  }));
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages: [systemMessage, ...memoryMessages]
  });

  const stream = OpenAIStream(response, {
    // Add the completion to the memory
    async onFinal(completion: string) {
      await zep.memory.addMemory(
        sessionId,
        new Memory({
          messages: [
            new Message({
              role: 'ai',
              content: completion,
              role_type: 'assistant'
            })
          ]
        })
      );
    }
  });
  // Respond with the stream
  return new StreamingTextResponse(stream);
}