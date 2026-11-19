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
      'preserves subscriber stream replacements with redaction=%s',
      async redact => {
        vi.mocked(isNodeRuntime).mockReturnValue(true);
        const body = { credential: 'test-token' };
        const original = {
          stream: new ReadableStream<string>({
            start(controller) {
              controller.enqueue('hello');
              controller.close();
            },
          }),
          request: {
            body: redact
              ? withTelemetryRedaction(body, value => ({
                  ...value,
                  credential: '[redacted]',
                }))
              : body,
          },
        };
        const observedCredentials: string[] = [];
        const wrapStream = (context: unknown) => {
          const { result } = context as { result: typeof original };
          observedCredentials.push(result.request.body.credential);
          result.stream = result.stream.pipeThrough(
            new TransformStream<string, string>({
              transform(chunk, controller) {
                controller.enqueue(`${chunk}!`);
              },
            }),
          );
        };
        const channel = diagnosticsChannel.tracingChannel(
          AI_SDK_TELEMETRY_TRACING_CHANNEL,
        );
        const firstSubscriber = (context: unknown) => wrapStream(context);
        const secondSubscriber = (context: unknown) => wrapStream(context);
        channel.asyncEnd.subscribe(firstSubscriber);
        channel.asyncEnd.subscribe(secondSubscriber);

        try {
          const result = await runWithTracingChannelSpan(
            message,
            async () => original,
          );

          expect(result).toBe(original);
          expect(result.request.body).toBe(original.request.body);
          expect(result.request.body.credential).toBe('test-token');
          expect(observedCredentials).toEqual([
            redact ? '[redacted]' : 'test-token',
            redact ? '[redacted]' : 'test-token',
          ]);
          const reader = result.stream.getReader();
          expect(await reader.read()).toEqual({
            value: 'hello!!',
            done: false,
          });
          expect(await reader.read()).toEqual({ value: undefined, done: true });
        } finally {
          channel.asyncEnd.unsubscribe(firstSubscriber);
          channel.asyncEnd.unsubscribe(secondSubscriber);
        }
      },
    );

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
  },
);
