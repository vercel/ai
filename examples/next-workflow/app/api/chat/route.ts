import { createUIMessageChunkTransform } from '@ai-sdk/durable-agent';
import { createUIMessageStreamResponse, type UIMessage } from 'ai';
import { start } from 'workflow/api';
import { chat } from '@/workflow/agent-chat';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const run = await start(chat, [messages]);

  // The workflow streams raw LanguageModelV4StreamPart chunks.
  // Convert to UIMessageChunks at the response boundary.
  return createUIMessageStreamResponse({
    stream: run.readable.pipeThrough(createUIMessageChunkTransform()),
    headers: {
      'x-workflow-run-id': run.runId,
    },
  });
}
