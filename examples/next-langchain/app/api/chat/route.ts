import { ChatOpenAI } from '@langchain/openai';
import { UIMessage } from 'ai';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { toDataStreamResponse } from '@ai-sdk/langchain';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
  }: {
    messages: UIMessage[];
  } = await req.json();

  const model = new ChatOpenAI({
    model: 'gpt-3.5-turbo-0125',
    temperature: 0,
  });

  const stream = await model.stream(
    messages.map(message =>
      message.role == 'user'
        ? new HumanMessage(message.content)
        : new AIMessage(message.content),
    ),
  );

  return toDataStreamResponse(stream);
}
