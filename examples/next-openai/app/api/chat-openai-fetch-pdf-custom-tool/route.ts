import { openaiFetchPdfCustomToolAgent } from '@/agent/openai-fetch-pdf-custom-tool-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  return createAgentUIStreamResponse({
    agent: openaiFetchPdfCustomToolAgent,
    messages,
  });
}
