import { openaiLocalShellAgent } from '@/agent/openai-local-shell-agent';
import { validateUIMessages } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return openaiLocalShellAgent.respond({
    messages: await validateUIMessages({ messages }),
  });
}
