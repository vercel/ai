import { openaiImageStoryboardAgent } from '@/agent/openai-image-storyboard-agent';
import { createAgentUIStreamResponse } from 'ai';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent: openaiImageStoryboardAgent,
    messages
  });
}
