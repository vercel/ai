import assert from 'node:assert/strict';
import { DefaultChatTransport } from 'ai';

const encoder = new TextEncoder();
const protocolEvents =
  'data: {"type":"start"}\n\n' +
  'data: {"type":"finish"}\n\n' +
  'data: [DONE]\n\n';

function createTransport(body: ReadableStream<Uint8Array>) {
  return new DefaultChatTransport({
    fetch: async () =>
      new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
      }),
  });
}

async function send(body: ReadableStream<Uint8Array>) {
  return createTransport(body).sendMessages({
    trigger: 'submit-message',
    chatId: 'chat1',
    messageId: undefined,
    messages: [],
    abortSignal: undefined,
  });
}

async function readTypes(stream: ReadableStream<{ type: string }>) {
  const types: string[] = [];

  for await (const chunk of stream) {
    types.push(chunk.type);
  }

  return types;
}

async function main() {
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    // Primary scenario: the logical protocol is complete, but HTTP stays open.
    let openController!: ReadableStreamDefaultController<Uint8Array>;
    let openSourceCancelled = false;
    const wasOpenSourceCancelled = (): boolean => openSourceCancelled;
    const openBody = new ReadableStream<Uint8Array>({
      start(controller) {
        openController = controller;
        controller.enqueue(encoder.encode(protocolEvents));
      },
      cancel() {
        openSourceCancelled = true;
      },
    });

    const openReader = (await send(openBody)).getReader();
    assert.equal((await openReader.read()).value?.type, 'start');
    assert.equal((await openReader.read()).value?.type, 'finish');

    const endRead = openReader.read();
    const endAtDone = await Promise.race([
      endRead.then(result => result.done),
      new Promise<false>(resolve => setTimeout(() => resolve(false), 100)),
    ]);
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    const cancelledAtDone = wasOpenSourceCancelled();

    // Release the intentionally open source so the broken implementation exits.
    if (!wasOpenSourceCancelled()) {
      openController.close();
    }
    await endRead;
    openReader.releaseLock();

    // Control: existing EOF-based completion remains valid.
    const closedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(protocolEvents));
        controller.close();
      },
    });
    assert.deepEqual(await readTypes(await send(closedBody)), [
      'start',
      'finish',
    ]);

    // Protocol data after [DONE] must not be delivered.
    const trailingBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            protocolEvents + 'data: {"type":"start","messageId":"late"}\n\n',
          ),
        );
        controller.close();
      },
    });
    const trailingTypes = await readTypes(await send(trailingBody));

    // Early consumer cancellation must still release an open upstream source.
    let earlySourceCancelled = false;
    const earlyBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
      },
      cancel() {
        earlySourceCancelled = true;
      },
    });
    const earlyReader = (await send(earlyBody)).getReader();
    assert.equal((await earlyReader.read()).value?.type, 'start');
    await earlyReader.cancel();

    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandledRejections, []);

    console.log({
      endAtDone,
      cancelledAtDone,
      trailingTypes,
      normalEofCompleted: true,
      earlySourceCancelled,
    });

    if (
      endAtDone !== true ||
      cancelledAtDone !== true ||
      trailingTypes.length !== 2 ||
      trailingTypes[0] !== 'start' ||
      trailingTypes[1] !== 'finish'
    ) {
      throw new Error(
        'ISSUE_22818: [DONE] did not terminate DefaultChatTransport before HTTP EOF and release upstream',
      );
    }
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
}

await main();
