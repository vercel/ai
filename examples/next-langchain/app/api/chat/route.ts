import { ChatOpenAI } from '@langchain/openai';
import { LangChainAdapter, Message, StreamingTextResponse } from 'ai';
import { AIMessage, HumanMessage } from 'langchain/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
