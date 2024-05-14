import { ChatOpenAI } from '@langchain/openai';
import { LangChainAdapter, StreamData, StreamingTextResponse } from 'ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const model = new ChatOpenAI({
    model: 'gpt-3.5-turbo-0125',
    temperature: 0,
  });

  const stream = await model.stream(prompt);

  const data = new StreamData();

  data.append({ test: 'value' });

  const aiStream = LangChainAdapter.toAIStream(stream, {
    onFinal() {
      data.close();
    },
  });

  return new StreamingTextResponse(aiStream, {}, data);
}
