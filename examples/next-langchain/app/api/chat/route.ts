import { ChatOpenAI } from '@langchain/openai';
import { LangChainAdapter, Message, StreamingTextResponse } from 'ai';
import { AIMessage, HumanMessage } from 'langchain/schema';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
  }: {
    messages: Message[];
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

  return new StreamingTextResponse(LangChainAdapter.toAIStream(stream));
}
