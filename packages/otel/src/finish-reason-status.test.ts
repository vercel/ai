import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { generateObject, generateText, streamObject, streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { LegacyOpenTelemetry } from './legacy-open-telemetry';
import { OpenTelemetry } from './open-telemetry';

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 7, noCache: 7, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};

describe.each([
  { name: 'LegacyOpenTelemetry', Integration: LegacyOpenTelemetry },
  { name: 'OpenTelemetry', Integration: OpenTelemetry },
])('$name finish reason status', ({ Integration }) => {
  function setup() {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    return {
      exporter,
      provider,
      integration: new Integration({ tracer: provider.getTracer('test') }),
    };
  }

  it.each(['streamText', 'streamObject'] as const)(
    'reports a %s setup failure to telemetry once',
    async api => {
      const { exporter, provider, integration } = setup();
      const error = new Error('provider setup failed');
      const telemetryOnError = vi.fn();
      const options = {
        model: new MockLanguageModelV4({
          doStream: async () => {
            throw error;
          },
        }),
        prompt: 'hi',
        maxRetries: 0,
        telemetry: {
          integrations: [integration, { onError: telemetryOnError }],
        },
        onError: () => {},
      };

      const stream =
        api === 'streamText'
          ? streamText(options).stream
          : streamObject({ ...options, output: 'no-schema' }).fullStream;
      for await (const _part of stream) {
        // Drain the error chunk that follows the setup failure.
      }

      expect(telemetryOnError).toHaveBeenCalledTimes(1);
      expect(telemetryOnError).toHaveBeenCalledWith(
        expect.objectContaining({ error }),
      );
      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(
        api === 'streamText' && Integration === OpenTelemetry ? 3 : 2,
      );
      for (const span of spans) {
        expect(span.status.code).toBe(SpanStatusCode.ERROR);
      }
      await provider.shutdown();
    },
  );

  describe.each(['generateObject', 'streamObject'] as const)('%s', api => {
    it.each(['error', 'stop'] as const)(
      'sets span status from the final %s finish reason',
      async finishReason => {
        const { exporter, provider, integration } = setup();
        const text = '{"value":"response"}';
        const finish = {
          finishReason: { unified: finishReason, raw: finishReason },
          usage,
        };
        const model = new MockLanguageModelV4({
          doGenerate: {
            content: [{ type: 'text', text }],
            ...finish,
            warnings: [],
          },
          doStream: {
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: text },
              { type: 'text-end', id: '0' },
              { type: 'finish', ...finish },
            ]),
          },
        });
        const options = {
          model,
          prompt: 'hi',
          telemetry: { integrations: integration },
        };

        if (api === 'generateObject') {
          const result = await generateObject({
            ...options,
            output: 'no-schema',
          });
          expect(result.object).toEqual({ value: 'response' });
        } else {
          const result = streamObject({ ...options, output: 'no-schema' });
          for await (const _part of result.fullStream) {
            // Consume the finish chunk before inspecting the exported spans.
          }
          expect(await result.object).toEqual({ value: 'response' });
        }

        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(2);
        for (const span of spans) {
          expect(span.status.code).toBe(
            finishReason === 'error'
              ? SpanStatusCode.ERROR
              : SpanStatusCode.UNSET,
          );
        }
        await provider.shutdown();
      },
    );
  });

  it.each(['error', 'stop'] as const)(
    'sets generateText span status from the final %s finish reason',
    async finishReason => {
      const { exporter, provider, integration } = setup();
      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: {
            content: [{ type: 'text', text: 'response' }],
            finishReason: { unified: finishReason, raw: finishReason },
            usage,
            warnings: [],
          },
        }),
        prompt: 'hi',
        telemetry: { integrations: integration },
      });

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(Integration === LegacyOpenTelemetry ? 2 : 3);
      for (const span of spans) {
        expect(span.status.code).toBe(
          finishReason === 'error'
            ? SpanStatusCode.ERROR
            : SpanStatusCode.UNSET,
        );
      }
      await provider.shutdown();
    },
  );

  it.each(['error', 'stop'] as const)(
    'waits for streamText completion and uses the final %s finish reason',
    async finishReason => {
      const { exporter, provider, integration } = setup();
      const telemetryOnError = vi.fn();
      let controller!: ReadableStreamDefaultController<LanguageModelV4StreamPart>;
      const result = streamText({
        model: new MockLanguageModelV4({
          doStream: {
            stream: new ReadableStream<LanguageModelV4StreamPart>({
              start(streamController) {
                controller = streamController;
                controller.enqueue({
                  type: 'response-metadata',
                  id: 'response-id',
                  modelId: 'response-model',
                });
                controller.enqueue({
                  type: 'error',
                  error: new Error('provider stream error'),
                });
              },
            }),
          },
        }),
        prompt: 'hi',
        telemetry: {
          integrations: [integration, { onError: telemetryOnError }],
        },
        onError: () => {},
      });

      const reader = result.stream.getReader();
      while ((await reader.read()).value?.type !== 'error') {}
      expect(exporter.getFinishedSpans()).toHaveLength(0);

      controller.enqueue({
        type: 'finish',
        finishReason: { unified: finishReason, raw: finishReason },
        usage,
      });
      controller.close();
      while (!(await reader.read()).done) {}
      reader.releaseLock();

      expect(await result.finishReason).toBe(finishReason);
      expect(telemetryOnError).not.toHaveBeenCalled();
      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(Integration === LegacyOpenTelemetry ? 2 : 3);
      for (const span of spans) {
        expect(span.status.code).toBe(
          finishReason === 'error'
            ? SpanStatusCode.ERROR
            : SpanStatusCode.UNSET,
        );
      }
      const responseSpan = spans.find(
        span => 'gen_ai.response.id' in span.attributes,
      );
      expect(responseSpan?.attributes).toMatchObject({
        'gen_ai.response.id': 'response-id',
        'gen_ai.response.model': 'response-model',
        'gen_ai.response.finish_reasons': [finishReason],
        'gen_ai.usage.input_tokens': 7,
        'gen_ai.usage.output_tokens': 3,
      });
      await provider.shutdown();
    },
  );
});
