import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

type MessageCallback = (message: string) => void | Promise<void>;

type Publisher = {
  connect(): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  set(key: string, value: string, options?: { EX?: number }): Promise<'OK'>;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
};

type Subscriber = {
  connect(): Promise<void>;
  subscribe(channel: string, callback: MessageCallback): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
};

type ResumableStreamContext = {
  createNewResumableStream(
    streamId: string,
    makeStream: () => ReadableStream<string>,
  ): Promise<ReadableStream<string> | null>;
  resumeExistingStream(
    streamId: string,
  ): Promise<ReadableStream<string> | null | undefined>;
  hasExistingStream(streamId: string): Promise<null | true | 'DONE'>;
};

class InMemoryPubSub {
  readonly publishedMessages: string[] = [];
  private readonly values = new Map<string, string>();
  private readonly listeners = new Map<string, Set<MessageCallback>>();

  readonly publisher: Publisher = {
    connect: async () => {},
    publish: async (channel, message) => {
      this.publishedMessages.push(message);
      const callbacks = [...(this.listeners.get(channel) ?? [])];
      await Promise.all(callbacks.map(callback => callback(message)));
      return callbacks.length;
    },
    set: async (key, value) => {
      this.values.set(key, value);
      return 'OK';
    },
    get: async key => this.values.get(key) ?? null,
    incr: async key => {
      const nextValue = Number(this.values.get(key) ?? '0') + 1;
      this.values.set(key, String(nextValue));
      return nextValue;
    },
  };

  readonly subscriber: Subscriber = {
    connect: async () => {},
    subscribe: async (channel, callback) => {
      const callbacks = this.listeners.get(channel) ?? new Set();
      callbacks.add(callback);
      this.listeners.set(channel, callbacks);
    },
    unsubscribe: async channel => {
      this.listeners.delete(channel);
    },
  };
}

async function waitFor(
  condition: () => boolean,
  description: string,
): Promise<void> {
  const timeoutAt = Date.now() + 2000;

  while (!condition()) {
    if (Date.now() > timeoutAt) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}

async function readText(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return text;
    }
    text += value;
  }
}

async function main() {
  const requireFromNext = createRequire(
    new URL('../../../next/package.json', import.meta.url),
  );
  const entryPath = requireFromNext.resolve('resumable-stream/generic');
  const { version } = requireFromNext(
    resolve(dirname(entryPath), '../package.json'),
  ) as { version: string };
  const { createResumableStreamContext } = requireFromNext(
    'resumable-stream/generic',
  ) as {
    createResumableStreamContext(options: {
      waitUntil(promise: Promise<unknown>): void;
      publisher: Publisher;
      subscriber: Subscriber;
      keyPrefix: string;
    }): ResumableStreamContext;
  };

  const originalDebug = process.env.DEBUG;
  const originalConsoleError = console.error;
  const terminalErrors: unknown[][] = [];
  const backgroundTasks: Promise<unknown>[] = [];

  delete process.env.DEBUG;
  console.error = (...args: unknown[]) => {
    terminalErrors.push(args);
  };

  try {
    const pubSub = new InMemoryPubSub();
    const context = createResumableStreamContext({
      keyPrefix: 'issue-6974',
      publisher: pubSub.publisher,
      subscriber: pubSub.subscriber,
      waitUntil: promise => {
        backgroundTasks.push(promise);
      },
    });

    let sourceController: ReadableStreamDefaultController<string> | undefined;
    const source = new ReadableStream<string>({
      start(controller) {
        sourceController = controller;
      },
    });

    const producer = await context.createNewResumableStream(
      'chat-stream',
      () => source,
    );
    assert.ok(producer, 'the producer stream should be created');
    assert.ok(sourceController, 'the source stream should be started');

    const firstResume = await context.resumeExistingStream('chat-stream');
    assert.ok(firstResume, 'the first resumed stream should exist');
    await firstResume.cancel('first refresh');

    sourceController.enqueue('first');
    await waitFor(
      () => pubSub.publishedMessages.includes('first'),
      'the first post-disconnect chunk',
    );

    const secondResume = await context.resumeExistingStream('chat-stream');
    assert.ok(secondResume, 'the second resumed stream should exist');
    await secondResume.cancel('second refresh');

    sourceController.enqueue('second');
    await waitFor(
      () => pubSub.publishedMessages.includes('second'),
      'the second post-disconnect chunk',
    );

    const activeResume = await context.resumeExistingStream('chat-stream');
    assert.ok(activeResume, 'the active resumed stream should exist');
    const completedText = readText(activeResume);

    sourceController.enqueue('third');
    sourceController.close();

    assert.equal(
      await completedText,
      'firstsecondthird',
      'the active resumed stream should continue after earlier disconnects',
    );
    await Promise.all(backgroundTasks);

    assert.equal(
      await context.hasExistingStream('chat-stream'),
      'DONE',
      'the producer should finish normally',
    );
    assert.deepEqual(
      terminalErrors,
      [],
      'disconnecting resumed streams should not log ERR_INVALID_STATE',
    );

    console.log(
      `PASS: resumable-stream ${version} completed after two resumed-stream disconnects without logging ERR_INVALID_STATE`,
    );
  } finally {
    console.error = originalConsoleError;
    if (originalDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = originalDebug;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
