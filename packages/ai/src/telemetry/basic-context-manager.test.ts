/**
 * Tests that AI SDK spans are correctly placed under parent spans even when
 * using context managers that don't propagate context across async boundaries.
 * The fix captures context synchronously at function entry and passes it
 * explicitly through the call chain.
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
