import { WorkflowChatTransport } from '@ai-sdk/workflow/client';
import { run } from '../../lib/run';

run(async () => {
  let reconnectAttempt = 0;
  const transport = new WorkflowChatTransport({
    maxConsecutiveErrors: 3,
    retryDelayMs: ({ consecutiveErrors }) => {
      const delayMs = Math.min(
        100 * 2 ** Math.max(0, consecutiveErrors - 1),
        1_000,
      );
      console.log(`Waiting ${delayMs}ms before retrying`);
      return delayMs;
    },
    fetch: async () => {
      reconnectAttempt++;
      console.log(`Reconnect attempt ${reconnectAttempt}`);

      return new Response(
        reconnectAttempt < 3 ? '' : 'data: {"type":"finish"}\n\n',
      );
    },
  });

  const stream = await transport.reconnectToStream({
    chatId: 'example-chat',
  });

  for await (const chunk of stream!) {
    console.log(chunk);
  }
});
