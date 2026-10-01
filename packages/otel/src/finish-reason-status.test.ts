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
import { generateText, streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
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
