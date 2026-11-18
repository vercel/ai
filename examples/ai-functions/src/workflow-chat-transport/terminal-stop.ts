import { WorkflowChatTransport } from '@ai-sdk/workflow/client';
import type { UIMessageChunk } from 'ai';

let stopRequested = false;
const requestedUrls: string[] = [];

const transport = new WorkflowChatTransport({
  fetch: async input => {
    const url = String(input);
    requestedUrls.push(url);

    if (url === '/api/chat') {
      return new Response('', {
        headers: { 'x-workflow-run-id': 'run-123' },
      });
    }

    if (requestedUrls.length > 2) {
      throw new Error('A reconnect was requested after the terminal stop.');
    }

    return new Response('data: {"type":"start-step"}\n\n');
  },
  stopWhen: () => stopRequested,
});

const stream = await transport.sendMessages({
  chatId: 'chat-123',
  trigger: 'submit-message',
  messages: [],
});
const reader = stream.getReader();

const firstChunk = await reader.read();
if (firstChunk.done) {
  throw new Error('Expected the first reconnect chunk.');
}
const chunk: UIMessageChunk = firstChunk.value;
console.log(chunk);

// A stop button can set this flag and separately call an authenticated server
// endpoint to cancel the workflow producer. No synthetic `finish` event is
// needed to stop this transport's reconnection lifecycle.
stopRequested = true;

console.log(await reader.read());
console.log({ requestedUrls });
