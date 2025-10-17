import { openaiFetchPdfCustomToolAgent } from '@/agent/openai-fetch-pdf-custom-tool-agent';
import { validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const body = await request.json();

  console.dir(body.messages, { depth: Infinity });

  return openaiFetchPdfCustomToolAgent.respond({
    messages: await validateUIMessages({ messages: body.messages }),
  });
}
