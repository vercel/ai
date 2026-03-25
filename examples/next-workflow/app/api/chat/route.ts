import { createModelCallToUIChunkTransform } from '@ai-sdk/durable-agent';
import { createUIMessageStreamResponse, type UIMessage } from 'ai';
import { start } from 'workflow/api';
import { chat } from '@/workflow/agent-chat';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const run = await start(chat, [messages]);

  // The workflow streams ModelCallStreamPart chunks.
  // Convert to UIMessageChunks at the response boundary.
  return createUIMessageStreamResponse({
    stream: run.readable.pipeThrough(createModelCallToUIChunkTransform()),
    headers: {
      'x-workflow-run-id': run.runId,
    },
  });
}
