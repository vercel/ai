/**
 * Tests span hierarchy with context managers that don't propagate context
 * across async boundaries. The challenge is that `context.active()` inside
 * async callbacks returns root context instead of the parent context.
 */
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import * as api from '@opentelemetry/api';
import { Context, ContextManager, ROOT_CONTEXT } from '@opentelemetry/api';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod/v4';
import { generateText } from '../generate-text/generate-text';
import { streamText } from '../generate-text/stream-text';
import { generateObject } from '../generate-object/generate-object';
import { streamObject } from '../generate-object/stream-object';
import { embed } from '../embed/embed';
import { embedMany } from '../embed/embed-many';
import { rerank } from '../rerank/rerank';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { MockEmbeddingModelV3 } from '../test/mock-embedding-model-v3';
import { MockRerankingModelV3 } from '../test/mock-reranking-model-v3';

/**
 * A context manager that only propagates context synchronously.
 * Context is lost after any async boundary (when a Promise is awaited).
 * This simulates the behavior of context managers that don't use
 * AsyncLocalStorage or similar mechanisms.
 */
class SyncOnlyContextManager implements ContextManager {
  private _currentContext: Context = ROOT_CONTEXT;

  active(): Context {
    return this._currentContext;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const previousContext = this._currentContext;
    this._currentContext = context;
    try {
      return fn.call(thisArg, ...args);
    } finally {
      // Restore previous context immediately after fn returns.
      // If fn returns a Promise, context is already restored before
      // the Promise resolves, simulating context loss across async boundaries.
      this._currentContext = previousContext;
    }
  }

  bind<T extends (...args: unknown[]) => unknown>(
    context: Context,
    target: T,
  ): T {
    // For simplicity, just return the target without binding context
    return target;
  }

  enable(): this {
    return this;
  }

  disable(): this {
    this._currentContext = ROOT_CONTEXT;
    return this;
  }
}

describe('telemetry span hierarchy', () => {
  let provider: NodeTracerProvider;
  let exporter: InMemorySpanExporter;
  let contextManager: SyncOnlyContextManager;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    contextManager = new SyncOnlyContextManager();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register({ contextManager });
  });

  afterEach(async () => {
    await provider.shutdown();
    api.trace.disable();
    api.context.disable();
  });

  it('should place generateText spans under parent span', async () => {
    const tracer = provider.getTracer('test');

    const parentSpan = tracer.startSpan('parent-operation');
    const parentSpanContext = api.trace.setSpan(
      api.context.active(),
      parentSpan,
    );

    await api.context.with(parentSpanContext, async () => {
      await generateText({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'testTool',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 10,
                noCache: 10,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 20, text: 20, reasoning: undefined },
            },
            warnings: [],
          }),
        }),
        tools: {
          testTool: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'tool result',
          },
        },
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

    // Verify tool execution span is under generateText span
    const aiToolCallSpan = spans.find(s => s.name === 'ai.toolCall');
    expect(aiToolCallSpan).toBeDefined();
    expect(aiToolCallSpan!.parentSpanId).toBe(
      aiGenerateTextSpan!.spanContext().spanId,
    );
  });

  it('should place streamText spans under parent span', async () => {
    const tracer = provider.getTracer('test');

    const parentSpan = tracer.startSpan('parent-operation');
    const parentSpanContext = api.trace.setSpan(
      api.context.active(),
      parentSpan,
    );

    await api.context.with(parentSpanContext, async () => {
      const result = streamText({
        model: new MockLanguageModelV3({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'testTool',
                input: '{ "value": "test" }',
              },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: {
                  inputTokens: {
                    total: 10,
                    noCache: 10,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 20, text: 20, reasoning: undefined },
                },
              },
            ]),
          }),
        }),
        tools: {
          testTool: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'tool result',
          },
        },
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

    // Verify tool execution span is under streamText span
    const aiToolCallSpan = spans.find(s => s.name === 'ai.toolCall');
    expect(aiToolCallSpan).toBeDefined();
    expect(aiToolCallSpan!.parentSpanId).toBe(
      aiStreamTextSpan!.spanContext().spanId,
    );
  });

  it('should place generateObject spans under parent span', async () => {
    const tracer = provider.getTracer('test');

    const parentSpan = tracer.startSpan('parent-operation');
    const parentSpanContext = api.trace.setSpan(
      api.context.active(),
      parentSpan,
    );

    await api.context.with(parentSpanContext, async () => {
      await generateObject({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            content: [{ type: 'text', text: '{ "content": "Hello" }' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 10,
                noCache: 10,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 20, text: 20, reasoning: undefined },
            },
            warnings: [],
          }),
        }),
        schema: z.object({ content: z.string() }),
        prompt: 'test prompt',
        experimental_telemetry: { isEnabled: true },
      });
    });

    parentSpan.end();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const parentSpanId = parentSpan.spanContext().spanId;

    const aiGenerateObjectSpan = spans.find(
      s => s.name === 'ai.generateObject',
    );
    expect(aiGenerateObjectSpan).toBeDefined();
    expect(aiGenerateObjectSpan!.parentSpanId).toBe(parentSpanId);
  });

  it('should place streamObject spans under parent span', async () => {
    const tracer = provider.getTracer('test');

    const parentSpan = tracer.startSpan('parent-operation');
    const parentSpanContext = api.trace.setSpan(
      api.context.active(),
      parentSpan,
    );

    await api.context.with(parentSpanContext, async () => {
      const result = streamObject({
        model: new MockLanguageModelV3({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: '{ "content": "Hello" }' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: {
                  inputTokens: {
                    total: 10,
                    noCache: 10,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 20, text: 20, reasoning: undefined },
                },
              },
            ]),
          }),
        }),
        schema: z.object({ content: z.string() }),
        prompt: 'test prompt',
        experimental_telemetry: { isEnabled: true },
      });
      // Consume stream before awaiting object
      for await (const _ of result.partialObjectStream) {
      }
    });

    parentSpan.end();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const parentSpanId = parentSpan.spanContext().spanId;

    const aiStreamObjectSpan = spans.find(s => s.name === 'ai.streamObject');
    expect(aiStreamObjectSpan).toBeDefined();
    expect(aiStreamObjectSpan!.parentSpanId).toBe(parentSpanId);
  });

  it('should place embed spans under parent span', async () => {
    const tracer = provider.getTracer('test');

    const parentSpan = tracer.startSpan('parent-operation');
    const parentSpanContext = api.trace.setSpan(
      api.context.active(),
      parentSpan,
    );

    await api.context.with(parentSpanContext, async () => {
      await embed({
        model: new MockEmbeddingModelV3({
          doEmbed: async () => ({
            embeddings: [[0.1, 0.2, 0.3]],
            warnings: [],
          }),
        }),
        value: 'test value',
        experimental_telemetry: { isEnabled: true },
      });
    });

    parentSpan.end();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const parentSpanId = parentSpan.spanContext().spanId;

    const aiEmbedSpan = spans.find(s => s.name === 'ai.embed');
    expect(aiEmbedSpan).toBeDefined();
    expect(aiEmbedSpan!.parentSpanId).toBe(parentSpanId);
  });

  it('should place embedMany spans under parent span', async () => {
    const tracer = provider.getTracer('test');

    const parentSpan = tracer.startSpan('parent-operation');
    const parentSpanContext = api.trace.setSpan(
      api.context.active(),
      parentSpan,
    );

    await api.context.with(parentSpanContext, async () => {
      await embedMany({
        model: new MockEmbeddingModelV3({
          doEmbed: async () => ({
            embeddings: [
              [0.1, 0.2],
              [0.3, 0.4],
            ],
            warnings: [],
          }),
        }),
        values: ['test1', 'test2'],
        experimental_telemetry: { isEnabled: true },
      });
    });

    parentSpan.end();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const parentSpanId = parentSpan.spanContext().spanId;

    const aiEmbedManySpan = spans.find(s => s.name === 'ai.embedMany');
    expect(aiEmbedManySpan).toBeDefined();
    expect(aiEmbedManySpan!.parentSpanId).toBe(parentSpanId);
  });

  it('should place rerank spans under parent span', async () => {
    const tracer = provider.getTracer('test');

    const parentSpan = tracer.startSpan('parent-operation');
    const parentSpanContext = api.trace.setSpan(
      api.context.active(),
      parentSpan,
    );

    await api.context.with(parentSpanContext, async () => {
      await rerank({
        model: new MockRerankingModelV3({
          doRerank: async () => ({
            ranking: [{ index: 0, relevanceScore: 0.9 }],
          }),
        }),
        documents: ['doc1'],
        query: 'test query',
        experimental_telemetry: { isEnabled: true },
      });
    });

    parentSpan.end();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const parentSpanId = parentSpan.spanContext().spanId;

    const aiRerankSpan = spans.find(s => s.name === 'ai.rerank');
    expect(aiRerankSpan).toBeDefined();
    expect(aiRerankSpan!.parentSpanId).toBe(parentSpanId);
  });
});
