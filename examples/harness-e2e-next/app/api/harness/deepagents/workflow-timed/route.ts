import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { start } from 'workflow/api';
import { timeSliceWorkflow } from './workflow';

// Durable multi-turn DeepAgents chat via the Workflow DevKit; the `'use workflow'` orchestration lives in `./workflow` (kept `ai`-free) and this is the plain POST handler.
export async function POST(request: Request) {
  const body: {
    id?: string;
    messages: UIMessage[];
  } = await request.json();

  if (!body.id) {
    return new Response('Missing chat id', { status: 400 });
  }

  const messages = await convertToModelMessages(body.messages);
  /*
   * The chat id is the stable harness session id. The complete message list
   * lets HarnessAgent identify new turns and tool continuations.
   */
  const run = await start(timeSliceWorkflow, [
    { messages, sessionId: body.id },
  ]);

  return createUIMessageStreamResponse({
    stream: run.readable as ReadableStream<UIMessageChunk>,
  });
}
