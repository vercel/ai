import { latestUserMessage } from '@/util/latest-user-message';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { start } from 'workflow/api';
import { openCodeSteppedWorkflow } from './workflow';

export async function POST(request: Request) {
  const body: { id?: string; messages: UIMessage[] } = await request.json();
  if (!body.id) {
    return new Response('Missing chat id', { status: 400 });
  }

  const messages = await convertToModelMessages(body.messages);
  if (!latestUserMessage(messages)) {
    return new Response('No user message to run', { status: 400 });
  }

  const run = await start(openCodeSteppedWorkflow, [
    { messages, sessionId: body.id },
  ]);
  return createUIMessageStreamResponse({
    stream: run.readable as ReadableStream<UIMessageChunk>,
  });
}
