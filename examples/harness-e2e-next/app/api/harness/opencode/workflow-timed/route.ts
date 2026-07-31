import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { start } from 'workflow/api';
import { timeSliceWorkflow } from './workflow';

/*
 * Durable, multi-turn OpenCode chat via the Vercel Workflow DevKit. The
 * `'use workflow'` orchestration lives in `./workflow` (kept `ai`-free so the
 * DevKit's generated step/flow routes don't pull in `@ai-sdk/gateway`); this
 * file is the plain POST handler.
 */
export async function POST(request: Request) {
  const body: {
    id?: string;
    messages: UIMessage[];
  } = await request.json();

  if (!body.id) {
    return new Response('Missing chat id', { status: 400 });
  }

  const messages = await convertToModelMessages(body.messages);
  const run = await start(timeSliceWorkflow, [
    { messages, sessionId: body.id },
  ]);

  return createUIMessageStreamResponse({
    stream: run.readable as ReadableStream<UIMessageChunk>,
  });
}
