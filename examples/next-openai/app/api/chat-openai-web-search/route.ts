import { openaiWebSearchAgent } from '@/agent/openai-web-search-agent';
import { convertToModelMessages, validateUIMessages } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = openaiWebSearchAgent.stream({
    messages: convertToModelMessages(uiMessages),
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
