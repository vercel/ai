import { anthropicMcpAgent } from '@/agent/anthropic-mcp';
import { validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const body = await request.json();

  console.dir(body.messages, { depth: Infinity });

  return anthropicMcpAgent.respond({
    messages: await validateUIMessages({ messages: body.messages }),
  });
}
