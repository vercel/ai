import { withTelemetryRedaction } from '@ai-sdk/provider-utils';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_SDK_TELEMETRY_TRACING_CHANNEL } from './tracing-channel';
import {
  openTelemetryChannelSpanContext,
  runWithTracingChannelSpan,
} from './tracing-channel-publisher';
import { isNodeRuntime } from '../util/is-node-runtime';

// Mock the runtime guard so we can drive both branches deterministically,
// independent of the environment the test itself happens to run in.
vi.mock('../util/is-node-runtime', () => ({
  isNodeRuntime: vi.fn(),
}));

// Detect the real runtime without going through the mocked guard. These tests
// observe Node diagnostics-channel behavior, so they require Node's module
// support and are skipped in non-Node runtimes.
const runningOnNode =
  typeof process !== 'undefined' && process.release?.name === 'node';

describe.runIf(runningOnNode)(
  'runWithTracingChannelSpan runtime switch',
  () => {
    const message = {
      type: 'languageModelCall' as const,
      event: { callId: 'call-1' },
    };

    function subscribe(start: () => void) {
      const subscribers = {
        start,
        end() {},
        asyncStart() {},
        asyncEnd() {},
        error() {},
      };
      const channel = diagnosticsChannel.tracingChannel(
        AI_SDK_TELEMETRY_TRACING_CHANNEL,
      );
      channel.subscribe(subscribers);
      return () => channel.unsubscribe(subscribers);
    }

    beforeEach(() => {
      vi.mocked(isNodeRuntime).mockReset();
    });

    it('skips the diagnostics channel when not running on Node', async () => {
      vi.mocked(isNodeRuntime).mockReturnValue(false);

      const start = vi.fn();
      const unsubscribe = subscribe(start);

      try {
        const result = await runWithTracingChannelSpan(
          message,
          async () => 'result',
        );

        expect(result).toBe('result');
        // The non-Node branch returns before loading the channel, so an
        // existing subscriber is never invoked.
        expect(start).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    });

    it('handles rejected span completion when not running on Node', async () => {
      vi.mocked(isNodeRuntime).mockReturnValue(false);

      const completion = Promise.reject(new Error('completion failed'));
      const catchSpy = vi.spyOn(completion, 'catch');

      try {
        expect(
          openTelemetryChannelSpanContext({
            message,
            completion,
          }),
        ).toBeUndefined();

        expect(catchSpy).toHaveBeenCalledTimes(1);
      } finally {
        await completion.catch(() => {});
      }
    });

    it('traces through the diagnostics channel when running on Node', async () => {
      vi.mocked(isNodeRuntime).mockReturnValue(true);

      const start = vi.fn();
      const unsubscribe = subscribe(start);

      try {
        const result = await runWithTracingChannelSpan(
          message,
          async () => 'result',
        );

        expect(result).toBe('result');
        // The Node branch loads the channel and traces execution, so the
        // subscriber receives the start event with our message context.
        expect(start).toHaveBeenCalledTimes(1);
        expect(start.mock.calls[0]![0]).toMatchObject(message);
      } finally {
        unsubscribe();
      }
    });

    it.each([true, false])(
      'redacts long-lived completion metadata with recordResult=%s',
      async recordResult => {
        vi.mocked(isNodeRuntime).mockReturnValue(true);
        const result = {
          request: {
            body: withTelemetryRedaction(
              { credential: 'test-token' },
              value => ({ ...value, credential: '[redacted]' }),
            ),
          },
        };
        const asyncEnd = vi.fn();
        const channel = diagnosticsChannel.tracingChannel(
          AI_SDK_TELEMETRY_TRACING_CHANNEL,
        );
        const subscribers = {
          start() {},
          end() {},
          asyncStart() {},
          asyncEnd,
          error() {},
        };
        channel.subscribe(subscribers);
        try {
          const completion = Promise.resolve(result);
          openTelemetryChannelSpanContext({
            message: { type: 'streamText', event: {} },
            completion,
            recordResult,
          });
          await completion;
          expect(asyncEnd).toHaveBeenCalledOnce();
          expect(asyncEnd.mock.calls[0][0].result).toEqual(
            recordResult
              ? {
                  request: {
                    body: { credential: '[redacted]' },
                  },
                }
              : undefined,
          );
          expect(result.request.body.credential).toBe('test-token');
        } finally {
          channel.unsubscribe(subscribers);
        }
      },
    );

    it('propagates stream replacement by ai:telemetry subscriber back to execution result', async () => {
      vi.mocked(isNodeRuntime).mockReturnValue(true);

      const originalStream = new ReadableStream({
        start(controller) {
          controller.enqueue('chunk-1');
          controller.close();
        },
      });

      const result = {
        stream: originalStream,
        request: {
          body: withTelemetryRedaction({ credential: 'secret-token' }, val => ({
            ...val,
            credential: '[redacted]',
          })),
        },
      };

      const transformedStream = new ReadableStream({
        start(controller) {
          controller.enqueue('transformed-chunk');
          controller.close();
        },
      });

      const channel = diagnosticsChannel.tracingChannel(
        AI_SDK_TELEMETRY_TRACING_CHANNEL,
      );
      const subscribers = {
        start() {},
        end() {},
        asyncStart() {},
        asyncEnd(message: unknown) {
          const ctx = message as { result?: { stream?: unknown } };
          if (ctx.result?.stream) {
            // Simulate Sentry / dd-trace tapping result.stream via pipeThrough():
            // calling pipeThrough locks originalStream
            (ctx.result.stream as ReadableStream).pipeThrough(
              new TransformStream(),
            );
            ctx.result.stream = transformedStream;
          }
        },
        error() {},
      };
      channel.subscribe(subscribers);

      try {
        const execution = await runWithTracingChannelSpan(
          message,
          async () => result,
        );

        // The execution result must have received the replaced stream and not be locked
        expect(execution.stream).toBe(transformedStream);
        expect(execution.stream.locked).toBe(false);
        expect(originalStream.locked).toBe(true);
        expect(execution.request.body.credential).toBe('secret-token');
      } finally {
        channel.unsubscribe(subscribers);
      }
    });

    it('propagates stream replacement when subscriber replaces ctx.result object', async () => {
      vi.mocked(isNodeRuntime).mockReturnValue(true);

      const originalStream = new ReadableStream({
        start(controller) {
          controller.enqueue('chunk-1');
          controller.close();
        },
      });

      const result = {
        stream: originalStream,
        request: {
          body: withTelemetryRedaction({ credential: 'secret-token' }, val => ({
            ...val,
            credential: '[redacted]',
          })),
        },
      };

      const newStream = new ReadableStream({
        start(controller) {
          controller.enqueue('new-chunk');
          controller.close();
        },
      });

      const channel = diagnosticsChannel.tracingChannel(
        AI_SDK_TELEMETRY_TRACING_CHANNEL,
      );
      const subscribers = {
        start() {},
        end() {},
        asyncStart() {},
        asyncEnd(message: unknown) {
          const ctx = message as { result?: unknown };
          ctx.result = {
            ...(ctx.result as object),
            stream: newStream,
          };
        },
        error() {},
      };
      channel.subscribe(subscribers);

      try {
        const execution = await runWithTracingChannelSpan(
          message,
          async () => result,
        );

        expect(execution.stream).toBe(newStream);
        expect(execution.stream.locked).toBe(false);
        expect(execution.request.body.credential).toBe('secret-token');
      } finally {
        channel.unsubscribe(subscribers);
      }
    });
  },
);
