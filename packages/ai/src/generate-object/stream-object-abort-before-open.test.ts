import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { Output } from '../generate-text';
import { streamText } from '../generate-text/stream-text';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { streamObject } from './stream-object';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

const objectChunks: LanguageModelV4StreamPart[] = [
  { type: 'stream-start', warnings: [] },
  {
    type: 'response-metadata',
    id: 'id-0',
    modelId: 'mock-model-id',
    timestamp: new Date(0),
  },
  { type: 'text-start', id: '1' },
  { type: 'text-delta', id: '1', delta: '{ "content": "Hello, world!" }' },
  { type: 'text-end', id: '1' },
  {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: testUsage,
  },
];

function createGatedModel(gate: Promise<void>) {
  return new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => {
      if (abortSignal?.aborted) {
        throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
      }

      await Promise.race([
        gate,
        abortSignal
          ? new Promise<never>((_, reject) => {
              abortSignal.addEventListener(
                'abort',
                () => {
                  reject(
                    abortSignal.reason ??
                      new DOMException('Aborted', 'AbortError'),
                  );
                },
                { once: true },
              );
            })
          : new Promise<never>(() => {}),
      ]);

      return {
        stream: convertArrayToReadableStream(objectChunks),
      };
    },
  });
}

function collectBackgroundErrors() {
  const errors: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    errors.push(reason);
  };
  const onUncaughtException = (error: unknown) => {
    errors.push(error);
  };
  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);
  return {
    errors,
    stop() {
      process.off('unhandledRejection', onUnhandledRejection);
      process.off('uncaughtException', onUncaughtException);
    },
  };
}

function isAlreadyClosedError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }
  const maybe = error as { name?: string; code?: string; message?: string };
  return (
    maybe.code === 'ERR_INVALID_STATE' ||
    (maybe.name === 'TypeError' &&
      typeof maybe.message === 'string' &&
      maybe.message.includes('Controller is already closed'))
  );
}

const schema = z.object({ content: z.string() });

describe('vercel/ai#8102 abort before structured object stream opens', () => {
  const collectors: Array<ReturnType<typeof collectBackgroundErrors>> = [];

  afterEach(() => {
    for (const collector of collectors.splice(0)) {
      collector.stop();
    }
  });

  it('streamObject: abortSignal aborted immediately, then consume', async () => {
    const collector = collectBackgroundErrors();
    collectors.push(collector);

    const abortController = new AbortController();
    abortController.abort();

    const result = streamObject({
      model: createGatedModel(Promise.resolve()),
      schema,
      prompt: 'prompt',
      abortSignal: abortController.signal,
      onError: () => {},
      maxRetries: 0,
    });

    await convertAsyncIterableToArray(result.partialObjectStream).catch(
      () => {},
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    const closedErrors = collector.errors.filter(isAlreadyClosedError);
    expect(
      closedErrors,
      `unexpected Controller-already-closed errors: ${closedErrors
        .map(error => (error instanceof Error ? error.stack : String(error)))
        .join('\n')}`,
    ).toEqual([]);
  });

  it('streamObject: cancel consumer before doStream returns (abort before first chunk)', async () => {
    const collector = collectBackgroundErrors();
    collectors.push(collector);

    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });

    const abortController = new AbortController();
    const result = streamObject({
      model: createGatedModel(gate),
      schema,
      prompt: 'prompt',
      abortSignal: abortController.signal,
      onError: () => {},
      maxRetries: 0,
    });

    const reader = result.partialObjectStream.getReader();
    const pendingRead = reader.read().catch(() => undefined);

    abortController.abort();
    await reader.cancel();
    release();

    await pendingRead;
    await new Promise(resolve => setTimeout(resolve, 50));

    const closedErrors = collector.errors.filter(isAlreadyClosedError);
    expect(
      closedErrors,
      `unexpected Controller-already-closed errors: ${closedErrors
        .map(error => (error instanceof Error ? error.stack : String(error)))
        .join('\n')}`,
    ).toEqual([]);
  });

  it('streamText({output}): cancel consumer before doStream returns', async () => {
    const collector = collectBackgroundErrors();
    collectors.push(collector);

    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });

    const abortController = new AbortController();
    const result = streamText({
      model: createGatedModel(gate),
      output: Output.object({ schema }),
      prompt: 'prompt',
      abortSignal: abortController.signal,
      onError: () => {},
      maxRetries: 0,
    });

    const reader = result.fullStream.getReader();
    const pendingRead = reader.read().catch(() => undefined);

    abortController.abort();
    await reader.cancel();
    release();

    await pendingRead;
    await new Promise(resolve => setTimeout(resolve, 50));

    const closedErrors = collector.errors.filter(isAlreadyClosedError);
    expect(
      closedErrors,
      `unexpected Controller-already-closed errors: ${closedErrors
        .map(error => (error instanceof Error ? error.stack : String(error)))
        .join('\n')}`,
    ).toEqual([]);
  });
});
