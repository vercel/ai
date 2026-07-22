import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from 'ai';

type ChatInstance = {
  messages: unknown[];
  sendMessage: (message: { text: string }) => Promise<void>;
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  stop: () => Promise<void>;
};

type ChatConstructor = new (options: {
  id: string;
  transport: DefaultChatTransport<UIMessage>;
  onFinish: (options: { isAbort: boolean }) => void;
}) => ChatInstance;

function formatChunk(chunk: UIMessageChunk) {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 1_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }

    await delay(10);
  }
}

async function main() {
  let generatedChunks = 0;
  let responseClosed = false;
  let responseFinished = false;

  const server = createServer((request, response) => {
    request.resume();
    response.writeHead(200, {
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'content-type': 'text/event-stream',
      'x-vercel-ai-ui-message-stream': 'v1',
    });
    response.flushHeaders();
    response.write(formatChunk({ type: 'text-start', id: 'text-1' }));

    const interval = setInterval(() => {
      generatedChunks += 1;
      response.write(
        formatChunk({
          type: 'text-delta',
          id: 'text-1',
          delta: `token-${generatedChunks} `,
        }),
      );

      if (generatedChunks === 200) {
        clearInterval(interval);
        response.end(formatChunk({ type: 'text-end', id: 'text-1' }));
      }
    }, 25);

    response.on('finish', () => {
      responseFinished = true;
    });
    response.on('close', () => {
      responseClosed = true;
      clearInterval(interval);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    assert.ok(address != null && typeof address === 'object');

    const reactPackageUrl = new URL(
      '../../../../packages/react/dist/index.mjs',
      import.meta.url,
    ).href;
    const { Chat } = (await import(reactPackageUrl)) as {
      Chat: ChatConstructor;
    };

    let finishWasAbort: boolean | undefined;
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
      () => chat.status === 'streaming' && generatedChunks >= 2,
      'the chat to start streaming',
    );

    const messagesAtStop = JSON.stringify(chat.messages);
    const stopStartedAt = performance.now();
    await chat.stop();
    const stopReturnedInMs = performance.now() - stopStartedAt;

    await Promise.race([
      sendPromise,
      delay(1_000).then(() => {
        throw new Error('The chat request remained open after stop()');
      }),
    ]);
    await waitFor(
      () => responseClosed,
      'the server response to receive the client disconnect',
    );

    const chunksAtAbort = generatedChunks;
    await delay(150);

    assert.equal(chat.status, 'ready', 'status should return to ready');
    assert.equal(
      finishWasAbort,
      true,
      'onFinish should identify the stopped response as aborted',
    );
    assert.equal(
      responseFinished,
      false,
      'the server response should close before normal completion',
    );
    assert.equal(
      generatedChunks,
      chunksAtAbort,
      'server generation should stop after the client disconnects',
    );
    assert.equal(
      JSON.stringify(chat.messages),
      messagesAtStop,
      'messages should not receive more tokens after stop()',
    );
    assert.ok(
      stopReturnedInMs < 200,
      `stop() took ${stopReturnedInMs.toFixed(1)}ms to return`,
    );

    console.log(
      JSON.stringify({
        finishWasAbort,
        generatedChunks,
        messageUpdatesStopped: true,
        responseClosed,
        responseFinished,
        status: chat.status,
        stopReturnedInMs: Number(stopReturnedInMs.toFixed(1)),
      }),
    );
  } finally {
    const closeError = await new Promise<Error | undefined>(resolve => {
      server.close(resolve);
    });
    if (closeError != null) throw closeError;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
