import { openaiImageGenerationCustomToolAgent } from '@/agent/openai-image-generation-custom-tool-agent';
import { createAgentStreamUIResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  return createAgentStreamUIResponse({
    agent: openaiImageGenerationCustomToolAgent,
    messages,
  });
}
