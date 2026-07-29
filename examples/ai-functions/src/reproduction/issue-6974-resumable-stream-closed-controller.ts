import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

type MessageCallback = (message: string) => Promise<void> | void;

type ResumableStreamContext = {
  createNewResumableStream(
    streamId: string,
    makeStream: () => ReadableStream<string>,
  ): Promise<ReadableStream<string>>;
  resumeExistingStream(
    streamId: string,
  ): Promise<ReadableStream<string> | null | undefined>;
};

const requireFromNextExample = createRequire(
  new URL('../../../next/package.json', import.meta.url),
);

const { createResumableStreamContext } = requireFromNextExample(
  'resumable-stream/generic',
) as {
  createResumableStreamContext(options: {
    publisher: unknown;
    subscriber: unknown;
    waitUntil(promise: Promise<unknown>): void;
  }): ResumableStreamContext;
};

const resumableStreamEntry = requireFromNextExample.resolve('resumable-stream');
const resumableStreamVersion = JSON.parse(
  readFileSync(
    join(dirname(resumableStreamEntry), '..', 'package.json'),
    'utf8',
  ),
) as { version: string };

class InMemoryPubSub {
  private readonly values = new Map<string, string>();
  private readonly subscriptions = new Map<string, Set<MessageCallback>>();

  readonly publisher = {
    publish: async (channel: string, message: string) => {
      const callbacks = [...(this.subscriptions.get(channel) ?? [])];
      await Promise.all(callbacks.map(callback => callback(message)));
      return callbacks.length;
    },
    set: async (key: string, value: string) => {
      this.values.set(key, value);
      return 'OK';
    },
    get: async (key: string) => this.values.get(key) ?? null,
    incr: async (key: string) => {
      const currentValue = this.values.get(key);
      const parsedValue = currentValue == null ? 0 : Number(currentValue);

      if (!Number.isInteger(parsedValue)) {
        throw new Error('ERR value is not an integer or out of range');
      }

      const nextValue = parsedValue + 1;
      this.values.set(key, String(nextValue));
      return nextValue;
    },
  };

  readonly subscriber = {
    subscribe: async (channel: string, callback: MessageCallback) => {
      const callbacks =
        this.subscriptions.get(channel) ?? new Set<MessageCallback>();
      callbacks.add(callback);
      this.subscriptions.set(channel, callbacks);
    },
    unsubscribe: async (channel: string) => {
      this.subscriptions.delete(channel);
    },
  };

  countChunkSubscriptions() {
    return [...this.subscriptions.entries()].filter(
      ([channel, callbacks]) =>
        channel.includes(':chunk:') && callbacks.size > 0,
    ).length;
  }
}

function formatConsoleArgument(value: unknown): string {
  if (value instanceof Error) {
    const code =
      'code' in value && typeof value.code === 'string'
        ? ` code=${value.code}`
        : '';
    return `${value.name}: ${value.message}${code}`;
  }

  return String(value);
}

async function waitFor(
  condition: () => boolean,
  description: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) {
      return;
    }
    await new Promise<void>(resolve => setImmediate(resolve));
  }

  throw new Error(`Timed out waiting for ${description}`);
}

async function runDisconnectScenario({ debug }: { debug: boolean }) {
  const previousDebug = process.env.DEBUG;
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const consoleErrors: string[] = [];
  const backgroundWork: Promise<unknown>[] = [];

  if (debug) {
    process.env.DEBUG = '1';
  } else {
    delete process.env.DEBUG;
  }

  console.error = (...values: unknown[]) => {
    consoleErrors.push(values.map(formatConsoleArgument).join(' '));
  };
  console.log = () => {};

  try {
    const pubSub = new InMemoryPubSub();
    const context = createResumableStreamContext({
      publisher: pubSub.publisher,
      subscriber: pubSub.subscriber,
      waitUntil: promise => {
        backgroundWork.push(promise);
      },
    });

    let producerController: ReadableStreamDefaultController<string> | undefined;
    const producer = await context.createNewResumableStream(
      `issue-6974-${debug ? 'debug' : 'normal'}`,
      () =>
        new ReadableStream<string>({
          start(controller) {
            producerController = controller;
          },
        }),
    );

    assert.ok(producer);
    assert.ok(producerController);

    const firstResume = await context.resumeExistingStream(
      `issue-6974-${debug ? 'debug' : 'normal'}`,
    );
    assert.ok(firstResume);
    const firstReader = firstResume.getReader();
    assert.deepEqual(await firstReader.read(), { done: false, value: '' });
    await firstReader.cancel('first refresh');

    producerController.enqueue('first');
    await waitFor(
      () => pubSub.countChunkSubscriptions() === 0,
      'the first disconnected resume to be cleaned up',
    );

    const secondResume = await context.resumeExistingStream(
      `issue-6974-${debug ? 'debug' : 'normal'}`,
    );
    assert.ok(secondResume);
    const secondReader = secondResume.getReader();
    assert.deepEqual(await secondReader.read(), {
      done: false,
      value: 'first',
    });
    await secondReader.cancel('second refresh');

    producerController.enqueue('second');
    await waitFor(
      () => pubSub.countChunkSubscriptions() === 0,
      'the second disconnected resume to be cleaned up',
    );

    const activeResume = await context.resumeExistingStream(
      `issue-6974-${debug ? 'debug' : 'normal'}`,
    );
    assert.ok(activeResume);
    const activeReader = activeResume.getReader();
    const initialResult = await activeReader.read();
    assert.deepEqual(initialResult, {
      done: false,
      value: 'firstsecond',
    });

    producerController.enqueue('third');
    const finalChunk = await activeReader.read();
    assert.deepEqual(finalChunk, { done: false, value: 'third' });

    producerController.close();
    assert.deepEqual(await activeReader.read(), {
      done: true,
      value: undefined,
    });
    await Promise.all(backgroundWork);

    return {
      consoleErrors,
      resumedText: `${initialResult.value}${finalChunk.value}`,
    };
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;

    if (previousDebug == null) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = previousDebug;
    }
  }
}

async function main() {
  const normalRun = await runDisconnectScenario({ debug: false });
  const normalInvalidStateErrors = normalRun.consoleErrors.filter(error =>
    error.includes('ERR_INVALID_STATE'),
  );

  assert.equal(normalRun.resumedText, 'firstsecondthird');

  if (normalInvalidStateErrors.length > 0) {
    throw new Error(
      `Issue #6974 reproduced: ${normalInvalidStateErrors.join(' | ')}`,
    );
  }

  assert.deepEqual(normalRun.consoleErrors, []);

  // This comparison verifies that both cancellations reached the exact
  // closed-controller path that the fixed package only exposes in debug mode.
  const debugRun = await runDisconnectScenario({ debug: true });
  const debugInvalidStateErrors = debugRun.consoleErrors.filter(error =>
    error.includes('ERR_INVALID_STATE'),
  );

  assert.equal(debugRun.resumedText, 'firstsecondthird');
  assert.equal(debugInvalidStateErrors.length, 2);

  console.log(
    `Issue #6974 not reproduced with resumable-stream ${resumableStreamVersion.version}: ` +
      `two resumed-stream disconnects logged 0 ERR_INVALID_STATE errors, ` +
      `and the active resume completed with ${normalRun.resumedText}.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
