import { openaiQueueAgent } from '@/agent/openai/queue-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(req: Request) {
  const body = await req.json();

  return createAgentUIStreamResponse({
    agent: openaiQueueAgent,
    uiMessages: body.messages,
  });
}
