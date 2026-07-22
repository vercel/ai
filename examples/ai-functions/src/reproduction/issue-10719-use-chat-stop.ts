import { createServer } from 'node:http';
import { once } from 'node:events';
import { DefaultChatTransport } from 'ai';
import { Chat } from '../../../../packages/react/dist/index.js';

const waitFor = async (
  predicate: () => boolean,
  description: string,
  timeoutMs = 2_000,
) => {
  const deadline = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }

    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

const formatChunk = (chunk: object) => `data: ${JSON.stringify(chunk)}\n\n`;

async function main() {
  let serverObservedDisconnect = false;
  let generatedTokenCount = 0;

  const server = createServer(async (request, response) => {
    for await (const _ of request) {
      // Consume the POST body before starting the streaming response.
    }

    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-vercel-ai-ui-message-stream': 'v1',
    });

    response.write(formatChunk({ type: 'start' }));
    response.write(formatChunk({ type: 'start-step' }));
    response.write(formatChunk({ type: 'text-start', id: 'text-1' }));

    const interval = setInterval(() => {
      generatedTokenCount += 1;
      response.write(
        formatChunk({
          type: 'text-delta',
          id: 'text-1',
          delta: `token-${generatedTokenCount} `,
        }),
      );

      if (generatedTokenCount === 100) {
        clearInterval(interval);
        response.end();
      }
    }, 25);

    response.on('close', () => {
      clearInterval(interval);
      serverObservedDisconnect = !response.writableEnded;
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Expected the HTTP server to listen on a TCP port');
    }

    let finishWasAbort = false;
    const chat = new Chat({
      id: 'issue-10719',
      transport: new DefaultChatTransport({
        api: `http://127.0.0.1:${address.port}/api/chat`,
      }),
      onFinish: ({ isAbort }) => {
        finishWasAbort = isAbort;
      },
    });

    const sendPromise = chat.sendMessage({ text: 'Write a long story' });

    await waitFor(
      () => chat.status === 'streaming' && generatedTokenCount > 0,
      'the response to start streaming',
    );

    const stopStartedAt = Date.now();
    await chat.stop();

    await waitFor(() => chat.status === 'ready', 'chat status to become ready');
    await waitFor(
      () => serverObservedDisconnect,
      'the server to observe the client disconnect',
    );
    const stopLatencyMs = Date.now() - stopStartedAt;
    await sendPromise;

    const tokenCountAfterDisconnect = generatedTokenCount;
    const messageAfterDisconnect = JSON.stringify(chat.messages);
    await new Promise(resolve => setTimeout(resolve, 100));

    const failures = [
      chat.status !== 'ready' &&
        `status remained ${JSON.stringify(chat.status)} instead of "ready"`,
      !serverObservedDisconnect &&
        'the HTTP request remained open after chat.stop()',
      !finishWasAbort && 'onFinish did not report isAbort: true',
      stopLatencyMs >= 500 &&
        `the abort took ${stopLatencyMs}ms instead of stopping promptly`,
      generatedTokenCount !== tokenCountAfterDisconnect &&
        'the server continued generating after observing the disconnect',
      JSON.stringify(chat.messages) !== messageAfterDisconnect &&
        'the client continued appending tokens after the disconnect',
    ].filter((failure): failure is string => Boolean(failure));

    if (failures.length > 0) {
      throw new Error(
        `ISSUE 10719 REPRODUCED: useChat stop did not cancel streaming\n${failures.join('\n')}`,
      );
    }

    console.log(
      'Issue 10719 not reproduced: stop returned the chat to ready, aborted the HTTP stream, and stopped server generation.',
    );
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
