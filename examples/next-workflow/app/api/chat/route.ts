import { createUIMessageStreamResponse, type UIMessage } from 'ai';
import { start } from 'workflow/api';
import { chat } from '@/workflow/agent-chat';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const run = await start(chat, [messages]);

  return createUIMessageStreamResponse({
    stream: run.readable,
    headers: {
      'x-workflow-run-id': run.runId,
    },
  });
}
