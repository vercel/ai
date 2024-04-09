import { LangChainStream, StreamingTextResponse, StreamData } from 'ai';
import { LLMChain } from 'langchain/chains';
import { OpenAI } from 'langchain/llms/openai';
import { PromptTemplate } from 'langchain/prompts';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { prompt: value } = await req.json();

  const model = new OpenAI({ temperature: 0, streaming: true });
  const prompt = PromptTemplate.fromTemplate(
    'What is a good name for a company that makes {product}?',
  );
  const chain = new LLMChain({ llm: model, prompt });

  const data = new StreamData();

  // important: use LangChainStream from the AI SDK:
  const { stream, handlers } = LangChainStream({
    onFinal: () => {
      data.append(JSON.stringify({ key: 'value' })); // example
      data.close();
    },
  });

  await chain.stream({ product: value }, { callbacks: [handlers] });

  return new StreamingTextResponse(stream, {}, data);
}
