import { openaiBasicAgent } from '@/agent/openai-basic-agent';
import { createAgentUIStreamResponse, smoothStream } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent: openaiBasicAgent,
    messages,
    experimental_transform: smoothStream(),
  });
}
