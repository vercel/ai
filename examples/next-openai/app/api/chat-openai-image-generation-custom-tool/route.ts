import { openaiImageGenerationCustomToolAgent } from '@/agent/openai-image-generation-custom-tool-agent';
import { createAgentStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  return createAgentStreamResponse({
    agent: openaiImageGenerationCustomToolAgent,
    messages,
  });
}
