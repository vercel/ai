import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { getHarnessE2EErrorMessage } from '@/util/harness-ui-stream';
import { start } from 'workflow/api';
import { timeSliceWorkflow } from './workflow';

/*
 * Durable, multi-turn Claude Code chat via the Vercel Workflow DevKit. The
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

  const chatId = body.id;
  const messages = await convertToModelMessages(body.messages);
  /*
   * The chat id is the stable harness session id across turns; the workflow
   * loads and persists its resume handle by that id. Passing the complete
   * message list also preserves tool approval and tool result continuations.
   */
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const run = await start(timeSliceWorkflow, [
          { messages, sessionId: chatId },
        ]);
        writer.merge(run.readable as ReadableStream<UIMessageChunk>);
      },
      onError: getHarnessE2EErrorMessage,
    }),
  });
}
