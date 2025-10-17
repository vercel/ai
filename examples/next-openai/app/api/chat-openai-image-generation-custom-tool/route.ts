import { openaiImageGenerationCustomToolAgent } from '@/agent/openai-image-generation-custom-tool-agent';
import { validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const body = await request.json();

  console.dir(body.messages, { depth: Infinity });

  return openaiImageGenerationCustomToolAgent.respond({
    messages: await validateUIMessages({ messages: body.messages }),
  });
}
