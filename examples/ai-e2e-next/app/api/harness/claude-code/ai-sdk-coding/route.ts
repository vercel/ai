import { aiSdkCodingHarnessAgent } from '@/agent/harness/ai-sdk-coding-agent';
import {
  getHarnessSession,
  setHarnessSession,
} from '@/util/harness-session-registry';
import { createUIMessageStreamResponse, toUIMessageStream } from 'ai';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      parts?: Array<{ type: string; text?: string }>;
    }>;
  };

  if (!body.id) {
    return new Response('Missing chat id', { status: 400 });
  }
  const chatId = body.id;

  const lastUser = [...body.messages].reverse().find(m => m.role === 'user');
  const prompt =
    lastUser?.parts
      ?.filter(p => p.type === 'text')
      .map(p => p.text ?? '')
      .join('') ?? '';
  if (prompt.length === 0) {
    return new Response('Missing user message', { status: 400 });
  }

  let session = getHarnessSession(chatId);
  if (session == null) {
    session = await aiSdkCodingHarnessAgent.createSession();
    setHarnessSession(chatId, session);
  }

  const result = await aiSdkCodingHarnessAgent.stream({ session, prompt });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
