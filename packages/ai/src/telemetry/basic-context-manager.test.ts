/**
 * Tests for OpenTelemetry span hierarchy with context managers that don't
 * propagate context across async boundaries.
 *
 * CHALLENGE:
 * OpenTelemetry's default context manager (and BasicContextManager) does not
 * propagate context across async boundaries. This means that when you call
 * `context.active()` inside an async callback, it returns the root context
 * instead of the context that was active when the async operation started.
 *
 * For example:
 *   const parentSpan = tracer.startSpan('parent');
 *   const ctx = trace.setSpan(context.active(), parentSpan);
 *   await context.with(ctx, async () => {
 *     // context.active() here returns the root context, not ctx!
 *     await someAsyncOperation();
 *     // context.active() here also returns root context
 *   });
 *
 * This breaks span hierarchy because child spans created inside async
 * callbacks won't have the correct parent span ID.
 *
 * SOLUTION:
 * Instead of relying on `context.active()` inside async callbacks, we:
 * 1. Capture the context synchronously at function entry (before any await)
 * 2. Pass this captured context explicitly through the call chain
 * 3. Use `tracer.startSpan(name, options, parentContext)` instead of
 *    `tracer.startActiveSpan()` to create spans with explicit parent context
 * 4. Construct child context using `trace.setSpan(parentCtx, span)` and pass
 *    it to nested operations
 *
 * This ensures correct span hierarchy regardless of which context manager
 * is being used.
 */
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import * as api from '@opentelemetry/api';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateText } from '../generate-text/generate-text';
import { streamText } from '../generate-text/stream-text';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';

describe('telemetry with BasicContextManager', () => {
  let provider: NodeTracerProvider;
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();
  });

  afterEach(async () => {
    await provider.shutdown();
    api.trace.disable();
    api.context.disable();
  });

  it('should place AI SDK spans under parent span when using BasicContextManager', async () => {
    const tracer = provider.getTracer('test');

    const parentSpan = tracer.startSpan('parent-operation');
    const parentSpanContext = api.trace.setSpan(api.context.active(), parentSpan);

    await api.context.with(parentSpanContext, async () => {
      await generateText({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello, world!' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 10 },
              outputTokens: { total: 20 },
            },
            warnings: [],
          }),
        }),
        prompt: 'test prompt',
        experimental_telemetry: { isEnabled: true },
      });
    });

    parentSpan.end();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const parentSpanId = parentSpan.spanContext().spanId;

    const aiGenerateTextSpan = spans.find(s => s.name === 'ai.generateText');
    expect(aiGenerateTextSpan).toBeDefined();
    expect(aiGenerateTextSpan!.parentSpanId).toBe(parentSpanId);
  });

  it('should place streamText spans under parent span when using BasicContextManager', async () => {
    const tracer = provider.getTracer('test');

    const parentSpan = tracer.startSpan('parent-operation');
    const parentSpanContext = api.trace.setSpan(api.context.active(), parentSpan);

    await api.context.with(parentSpanContext, async () => {
      const result = streamText({
        model: new MockLanguageModelV3({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello, world!' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: {
                  inputTokens: { total: 10 },
                  outputTokens: { total: 20 },
                },
              },
            ]),
          }),
        }),
        prompt: 'test prompt',
        experimental_telemetry: { isEnabled: true },
      });
      await result.text;
    });

    parentSpan.end();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const parentSpanId = parentSpan.spanContext().spanId;

    const aiStreamTextSpan = spans.find(s => s.name === 'ai.streamText');
    expect(aiStreamTextSpan).toBeDefined();
    expect(aiStreamTextSpan!.parentSpanId).toBe(parentSpanId);
  });
});
