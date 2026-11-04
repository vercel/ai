import { WorkflowChatTransport } from '@ai-sdk/workflow/client';
import type { UIMessageChunk } from 'ai';
import { run } from '../../lib/run';

function response(...chunks: UIMessageChunk[]) {
  return new Response(
    chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join(''),
  );
}

function createConnectivityControl() {
  let online = true;
  let resume: (() => void) | undefined;

  return {
    goOffline() {
      online = false;
    },
    goOnline() {
      online = true;
      resume?.();
      resume = undefined;
    },
    waitUntilReconnectAllowed({ abortSignal }: { abortSignal: AbortSignal }) {
      if (online) return;

      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          cleanup();
          reject(abortSignal.reason);
        };
        const cleanup = () => {
          abortSignal.removeEventListener('abort', onAbort);
        };

        resume = () => {
          cleanup();
          resolve();
        };
        abortSignal.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
}

run(async () => {
  const connectivity = createConnectivityControl();
  let requestCount = 0;

  const transport = new WorkflowChatTransport({
    fetch: async () => {
      requestCount++;

      if (requestCount === 1) {
        connectivity.goOffline();
        return response({ type: 'start-step' });
      }

      return response({ type: 'finish' });
    },
    waitUntilReconnectAllowed: options =>
      connectivity.waitUntilReconnectAllowed(options),
  });

  const stream = await transport.reconnectToStream({ chatId: 'chat-123' });
  const reader = stream!.getReader();

  console.log((await reader.read()).value);

  const finish = reader.read();
  await Promise.resolve();
  console.log('requests while offline:', requestCount);

  connectivity.goOnline();
  console.log((await finish).value);
});
