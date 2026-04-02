import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Attributes,
  Span,
  SpanOptions,
  SpanStatusCode,
  Tracer,
} from '@opentelemetry/api';
import type { TelemetryIntegration } from 'ai';
import { GenAIOpenTelemetryIntegration } from './gen-ai-open-telemetry-integration';

type MockSpan = Span & {
  name: string;
  attributes: Attributes;
  events: Array<{ name: string; attributes?: Attributes }>;
  ended: boolean;
  status: { code: number; message?: string } | undefined;
  exceptions: unknown[];
};

function createMockSpan(name?: string): MockSpan {
  const span: MockSpan = {
    name: name ?? '',
    attributes: {},
    events: [],
    ended: false,
    status: undefined,
    exceptions: [],
    spanContext: () => ({
      traceId: 'trace-1',
      spanId: 'span-1',
      traceFlags: 1,
    }),
    setAttribute: vi.fn((key: string, value) => {
      span.attributes[key] = value;
      return span;
    }),
    setAttributes: vi.fn((attrs: Attributes) => {
      Object.assign(span.attributes, attrs);
      return span;
    }),
    addEvent: vi.fn((eventName: string, attrs?: Attributes) => {
      span.events.push({ name: eventName, attributes: attrs });
      return span;
    }),
    addLink: vi.fn(() => span),
    addLinks: vi.fn(() => span),
    setStatus: vi.fn(status => {
      span.status = status;
      return span;
    }),
    updateName: vi.fn(() => span),
    end: vi.fn(() => {
      span.ended = true;
    }),
    isRecording: vi.fn(() => true),
    recordException: vi.fn(exception => {
      span.exceptions.push(exception);
    }),
  };
  return span;
}

interface MockTracer extends Tracer {
  spans: MockSpan[];
}

function createMockTracer(): MockTracer {
  const tracer: MockTracer = {
    spans: [],
    startSpan: vi.fn((name: string, _options?, _context?) => {
      const span = createMockSpan(name);
      tracer.spans.push(span);
      return span;
    }),
    startActiveSpan: vi.fn() as Tracer['startActiveSpan'],
  };
  return tracer;
}

function getStartSpanAttributes(
  tracer: MockTracer,
  callIndex: number,
): Attributes {
  const mock = tracer.startSpan as ReturnType<typeof vi.fn>;
  return (
    (mock.mock.calls[callIndex][1] as SpanOptions | undefined)?.attributes ?? {}
  );
}

let callId: string;
let callIdCounter = 0;

function telemetryFields() {
  return {
    isEnabled: true as const,
    recordInputs: undefined,
    recordOutputs: undefined,
    functionId: undefined,
    metadata: undefined,
  };
}

const model = { provider: 'openai.chat', modelId: 'gpt-4' };

function makeOnStartEvent(overrides?: Record<string, unknown>) {
  return {
    callId,
    operationId: 'ai.generateText',
    provider: model.provider,
    modelId: model.modelId,
    system: undefined,
    prompt: 'Hello',
    messages: undefined,
    tools: undefined,
    toolChoice: undefined,
    activeTools: undefined,
    maxOutputTokens: 100,
    temperature: 0.7,
    topP: undefined,
    topK: undefined,
    presencePenalty: undefined,
    frequencyPenalty: undefined,
    stopSequences: undefined,
    seed: undefined,
    maxRetries: 2,
    timeout: undefined,
    headers: undefined,
    providerOptions: undefined,
    stopWhen: undefined,
    output: undefined,
    abortSignal: undefined,
    include: undefined,
    ...telemetryFields(),
    experimental_context: undefined,
    ...overrides,
  } as Parameters<NonNullable<TelemetryIntegration['onStart']>>[0];
}

function makeStepStartEvent(overrides?: Record<string, unknown>) {
  return {
    callId,
    stepNumber: 0,
    provider: model.provider,
    modelId: model.modelId,
    system: undefined,
    messages: [],
    tools: undefined,
    toolChoice: undefined,
    activeTools: undefined,
    steps: [],
    providerOptions: undefined,
    timeout: undefined,
    headers: undefined,
    stopWhen: undefined,
    output: undefined,
    abortSignal: undefined,
    include: undefined,
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    promptMessages: undefined,
    stepTools: undefined,
    stepToolChoice: undefined,
    ...overrides,
  } as Parameters<NonNullable<TelemetryIntegration['onStepStart']>>[0];
}

function makeStepFinishEvent(overrides?: Record<string, unknown>) {
  return {
    callId,
    stepNumber: 0,
    model,
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    content: [{ type: 'text' as const, text: 'Hello world' }],
    text: 'Hello world',
    reasoning: [],
    reasoningText: undefined,
    files: [],
    sources: [],
    toolCalls: [],
    staticToolCalls: [],
    dynamicToolCalls: [],
    toolResults: [],
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: 'stop' as const,
    rawFinishReason: 'stop',
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
    },
    warnings: undefined,
    request: { body: undefined },
    response: {
      id: 'resp-1',
      modelId: 'gpt-4-0613',
      timestamp: new Date('2025-01-01T00:00:00Z'),
      messages: [],
    },
    providerMetadata: undefined,
    ...overrides,
  } as Parameters<NonNullable<TelemetryIntegration['onStepFinish']>>[0];
}

function makeFinishEvent(overrides?: Record<string, unknown>) {
  return {
    ...makeStepFinishEvent(),
    steps: [],
    totalUsage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
    },
    ...overrides,
  } as Parameters<NonNullable<TelemetryIntegration['onFinish']>>[0];
}

function makeToolCallStartEvent(overrides?: Record<string, unknown>) {
  return {
    callId,
    stepNumber: 0,
    provider: model.provider,
    modelId: model.modelId,
    toolCall: {
      type: 'tool-call' as const,
      toolCallId: 'tool-call-1',
      toolName: 'myTool',
      input: { query: 'test' },
    },
    messages: [],
    abortSignal: undefined,
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    ...overrides,
  } as Parameters<NonNullable<TelemetryIntegration['onToolCallStart']>>[0];
}

function makeToolCallFinishEvent(
  success: boolean,
  overrides?: Record<string, unknown>,
) {
  const base = {
    callId,
    stepNumber: 0,
    provider: model.provider,
    modelId: model.modelId,
    toolCall: {
      type: 'tool-call' as const,
      toolCallId: 'tool-call-1',
      toolName: 'myTool',
      input: { query: 'test' },
    },
    messages: [],
    abortSignal: undefined,
    durationMs: 42,
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    ...overrides,
  };

  if (success) {
    return {
      ...base,
      success: true as const,
      output: { result: 'ok' },
    } as Parameters<NonNullable<TelemetryIntegration['onToolCallFinish']>>[0];
  }
  return {
    ...base,
    success: false as const,
    error: new Error('tool failed'),
  } as Parameters<NonNullable<TelemetryIntegration['onToolCallFinish']>>[0];
}

describe('GenAIOpenTelemetryIntegration', () => {
  let tracer: MockTracer;
  let integration: TelemetryIntegration;

  beforeEach(() => {
    tracer = createMockTracer();
    callId = `test-call-${++callIdCounter}`;
    integration = new GenAIOpenTelemetryIntegration({ tracer });
  });

  describe('onStart (generateText)', () => {
    it('creates a root span named invoke_agent {model}', () => {
      integration.onStart!(makeOnStartEvent());

      expect(tracer.startSpan).toHaveBeenCalledTimes(1);
      expect(tracer.spans[0].name).toBe('invoke_agent gpt-4');
    });

    it('sets gen_ai.operation.name to invoke_agent', () => {
      integration.onStart!(makeOnStartEvent());

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['gen_ai.operation.name']).toBe('invoke_agent');
    });

    it('maps provider name to well-known value', () => {
      integration.onStart!(makeOnStartEvent());

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['gen_ai.provider.name']).toBe('openai');
    });

    it('sets gen_ai.request.model', () => {
      integration.onStart!(makeOnStartEvent());

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['gen_ai.request.model']).toBe('gpt-4');
    });

    it('sets request parameters', () => {
      integration.onStart!(makeOnStartEvent());

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['gen_ai.request.max_tokens']).toBe(100);
      expect(attrs['gen_ai.request.temperature']).toBe(0.7);
    });

    it('sets system_instructions when system is provided', () => {
      integration.onStart!(makeOnStartEvent({ system: 'You are helpful' }));

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['gen_ai.system_instructions']).toBe(
        JSON.stringify([{ type: 'text', content: 'You are helpful' }]),
      );
    });

    it('does not create a span when telemetry is disabled', () => {
      integration.onStart!(makeOnStartEvent({ isEnabled: false }));

      expect(tracer.startSpan).not.toHaveBeenCalled();
    });

    it('preserves AI SDK metadata as gen_ai.ai_sdk attributes', () => {
      integration.onStart!(
        makeOnStartEvent({
          metadata: { environment: 'test' },
        }),
      );

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['gen_ai.ai_sdk.telemetry.metadata.environment']).toBe(
        'test',
      );
    });

    it('preserves functionId as gen_ai.agent.name', () => {
      integration.onStart!(makeOnStartEvent({ functionId: 'my-agent' }));

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['gen_ai.agent.name']).toBe('my-agent');
    });
  });

  describe('onStepStart', () => {
    it('creates a chat span as child of root span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());

      expect(tracer.startSpan).toHaveBeenCalledTimes(2);
      expect(tracer.spans[1].name).toBe('chat gpt-4');
    });

    it('sets gen_ai.operation.name to chat', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());

      const attrs = getStartSpanAttributes(tracer, 1);
      expect(attrs['gen_ai.operation.name']).toBe('chat');
    });

    it('sets gen_ai.provider.name on step span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());

      const attrs = getStartSpanAttributes(tracer, 1);
      expect(attrs['gen_ai.provider.name']).toBe('openai');
    });

    it('sets gen_ai.request.model on step span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());

      const attrs = getStartSpanAttributes(tracer, 1);
      expect(attrs['gen_ai.request.model']).toBe('gpt-4');
    });

    it('sets gen_ai.input.messages when promptMessages provided', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(
        makeStepStartEvent({
          promptMessages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
            },
          ],
        }),
      );

      const attrs = getStartSpanAttributes(tracer, 1);
      const messages = JSON.parse(attrs['gen_ai.input.messages'] as string);
      expect(messages).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
        },
      ]);
    });

    it('sets gen_ai.tool.definitions when stepTools provided', () => {
      const tools = [
        { type: 'function', name: 'get_weather', description: 'Get weather' },
      ];
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent({ stepTools: tools }));

      const attrs = getStartSpanAttributes(tracer, 1);
      expect(attrs['gen_ai.tool.definitions']).toBe(JSON.stringify(tools));
    });
  });

  describe('onStepFinish', () => {
    it('sets gen_ai response attributes on step span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(makeStepFinishEvent());

      const stepSpan = tracer.spans[1];
      expect(stepSpan.attributes['gen_ai.response.finish_reasons']).toEqual([
        'stop',
      ]);
      expect(stepSpan.attributes['gen_ai.response.id']).toBe('resp-1');
      expect(stepSpan.attributes['gen_ai.response.model']).toBe('gpt-4-0613');
    });

    it('sets gen_ai token usage attributes', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(makeStepFinishEvent());

      const stepSpan = tracer.spans[1];
      expect(stepSpan.attributes['gen_ai.usage.input_tokens']).toBe(10);
      expect(stepSpan.attributes['gen_ai.usage.output_tokens']).toBe(20);
    });

    it('sets gen_ai.output.messages in SemConv format', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(makeStepFinishEvent());

      const stepSpan = tracer.spans[1];
      const outputMessages = JSON.parse(
        stepSpan.attributes['gen_ai.output.messages'] as string,
      );
      expect(outputMessages).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Hello world' }],
          finish_reason: 'stop',
        },
      ]);
    });

    it('includes tool calls in output messages', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(
        makeStepFinishEvent({
          text: undefined,
          toolCalls: [
            {
              type: 'tool-call' as const,
              toolCallId: 'tc1',
              toolName: 'search',
              input: { q: 'test' },
            },
          ],
          finishReason: 'tool-calls',
        }),
      );

      const stepSpan = tracer.spans[1];
      const outputMessages = JSON.parse(
        stepSpan.attributes['gen_ai.output.messages'] as string,
      );
      expect(outputMessages[0].parts[0]).toEqual({
        type: 'tool_call',
        id: 'tc1',
        name: 'search',
        arguments: { q: 'test' },
      });
      expect(outputMessages[0].finish_reason).toBe('tool_call');
    });

    it('sets cache token attributes when available', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(
        makeStepFinishEvent({
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            reasoningTokens: 10,
            cachedInputTokens: 30,
            inputTokenDetails: {
              noCacheTokens: 70,
              cacheReadTokens: 20,
              cacheWriteTokens: 10,
            },
            outputTokenDetails: {
              textTokens: 40,
              reasoningTokens: 10,
            },
          },
        }),
      );

      const stepSpan = tracer.spans[1];
      expect(stepSpan.attributes['gen_ai.usage.cache_read.input_tokens']).toBe(
        20,
      );
      expect(
        stepSpan.attributes['gen_ai.usage.cache_creation.input_tokens'],
      ).toBe(10);
      expect(stepSpan.attributes['gen_ai.ai_sdk.usage.reasoning_tokens']).toBe(
        10,
      );
    });

    it('ends the step span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(makeStepFinishEvent());

      expect(tracer.spans[1].ended).toBe(true);
    });
  });

  describe('onToolCallStart / onToolCallFinish', () => {
    it('creates an execute_tool span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onToolCallStart!(makeToolCallStartEvent());

      expect(tracer.spans).toHaveLength(3);
      expect(tracer.spans[2].name).toBe('execute_tool myTool');
    });

    it('sets gen_ai tool attributes', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onToolCallStart!(makeToolCallStartEvent());

      const attrs = getStartSpanAttributes(tracer, 2);
      expect(attrs['gen_ai.operation.name']).toBe('execute_tool');
      expect(attrs['gen_ai.tool.name']).toBe('myTool');
      expect(attrs['gen_ai.tool.call.id']).toBe('tool-call-1');
      expect(attrs['gen_ai.tool.type']).toBe('function');
    });

    it('sets gen_ai.tool.call.arguments', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onToolCallStart!(makeToolCallStartEvent());

      const attrs = getStartSpanAttributes(tracer, 2);
      expect(attrs['gen_ai.tool.call.arguments']).toBe(
        JSON.stringify({ query: 'test' }),
      );
    });

    it('sets gen_ai.tool.call.result on success', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onToolCallStart!(makeToolCallStartEvent());
      integration.onToolCallFinish!(makeToolCallFinishEvent(true));

      const toolSpan = tracer.spans[2];
      expect(toolSpan.attributes['gen_ai.tool.call.result']).toBe(
        JSON.stringify({ result: 'ok' }),
      );
      expect(toolSpan.ended).toBe(true);
    });

    it('records error on tool failure', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onToolCallStart!(makeToolCallStartEvent());
      integration.onToolCallFinish!(makeToolCallFinishEvent(false));

      const toolSpan = tracer.spans[2];
      expect(toolSpan.status).toEqual({
        code: SpanStatusCode.ERROR,
        message: 'tool failed',
      });
      expect(toolSpan.ended).toBe(true);
    });
  });

  describe('onFinish (generateText)', () => {
    it('sets total usage on root span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(makeStepFinishEvent());
      integration.onFinish!(makeFinishEvent());

      const rootSpan = tracer.spans[0];
      expect(rootSpan.attributes['gen_ai.usage.input_tokens']).toBe(10);
      expect(rootSpan.attributes['gen_ai.usage.output_tokens']).toBe(20);
      expect(rootSpan.attributes['gen_ai.response.finish_reasons']).toEqual([
        'stop',
      ]);
    });

    it('sets gen_ai.output.messages on root span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(makeStepFinishEvent());
      integration.onFinish!(makeFinishEvent());

      const rootSpan = tracer.spans[0];
      const outputMessages = JSON.parse(
        rootSpan.attributes['gen_ai.output.messages'] as string,
      );
      expect(outputMessages[0].role).toBe('assistant');
      expect(outputMessages[0].finish_reason).toBe('stop');
    });

    it('ends the root span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(makeStepFinishEvent());
      integration.onFinish!(makeFinishEvent());

      expect(tracer.spans[0].ended).toBe(true);
    });
  });

  describe('onStart (generateObject)', () => {
    it('creates a root span with output.type json', () => {
      integration.onStart!(
        makeOnStartEvent({
          operationId: 'ai.generateObject',
          schema: { type: 'object' },
          schemaName: 'TestSchema',
          schemaDescription: 'A test schema',
          output: 'object',
        }),
      );

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['gen_ai.operation.name']).toBe('invoke_agent');
      expect(attrs['gen_ai.output.type']).toBe('json');
      expect(attrs['gen_ai.ai_sdk.schema.name']).toBe('TestSchema');
    });
  });

  describe('onStart (embed)', () => {
    it('creates an embeddings span', () => {
      integration.onStart!(
        makeOnStartEvent({
          operationId: 'ai.embed',
          value: 'test text',
        }),
      );

      expect(tracer.spans[0].name).toBe('embeddings gpt-4');
      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['gen_ai.operation.name']).toBe('embeddings');
    });
  });

  describe('onStart (rerank)', () => {
    it('creates a rerank span with custom operation name', () => {
      integration.onStart!(
        makeOnStartEvent({
          operationId: 'ai.rerank',
          documents: [{ text: 'doc1' }],
        }),
      );

      expect(tracer.spans[0].name).toBe('rerank gpt-4');
      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['gen_ai.operation.name']).toBe('rerank');
    });
  });

  describe('onChunk (streaming events)', () => {
    it('maps ai.stream.firstChunk to gen_ai.ai_sdk.stream.first_chunk', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());

      integration.onChunk!({
        chunk: {
          type: 'ai.stream.firstChunk',
          callId,
          attributes: {
            'ai.stream.msToFirstChunk': 150,
          },
        },
      } as any);

      const stepSpan = tracer.spans[1];
      expect(stepSpan.events).toHaveLength(1);
      expect(stepSpan.events[0].name).toBe('gen_ai.ai_sdk.stream.first_chunk');
      expect(
        stepSpan.events[0].attributes?.['gen_ai.ai_sdk.stream.msToFirstChunk'],
      ).toBe(150);
    });

    it('maps ai.stream.finish to gen_ai.ai_sdk.stream.finish', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());

      integration.onChunk!({
        chunk: {
          type: 'ai.stream.finish',
          callId,
          attributes: {},
        },
      } as any);

      const stepSpan = tracer.spans[1];
      expect(stepSpan.events[0].name).toBe('gen_ai.ai_sdk.stream.finish');
    });
  });

  describe('onError', () => {
    it('records error on root and step spans', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());

      integration.onError!({
        callId,
        error: new Error('something went wrong'),
      });

      const rootSpan = tracer.spans[0];
      const stepSpan = tracer.spans[1];

      expect(rootSpan.status).toEqual({
        code: SpanStatusCode.ERROR,
        message: 'something went wrong',
      });
      expect(stepSpan.status).toEqual({
        code: SpanStatusCode.ERROR,
        message: 'something went wrong',
      });
      expect(rootSpan.ended).toBe(true);
      expect(stepSpan.ended).toBe(true);
    });
  });

  describe('full lifecycle', () => {
    it('creates correct span hierarchy for multi-step tool loop', () => {
      integration.onStart!(makeOnStartEvent());

      integration.onStepStart!(makeStepStartEvent());
      integration.onToolCallStart!(makeToolCallStartEvent());
      integration.onToolCallFinish!(makeToolCallFinishEvent(true));
      integration.onStepFinish!(
        makeStepFinishEvent({ finishReason: 'tool-calls' }),
      );

      integration.onStepStart!(makeStepStartEvent({ stepNumber: 1 }));
      integration.onStepFinish!(makeStepFinishEvent({ stepNumber: 1 }));

      integration.onFinish!(makeFinishEvent());

      expect(tracer.spans).toHaveLength(5);
      expect(tracer.spans[0].name).toBe('invoke_agent gpt-4');
      expect(tracer.spans[1].name).toBe('chat gpt-4');
      expect(tracer.spans[2].name).toBe('execute_tool myTool');
      expect(tracer.spans[3].name).toBe('chat gpt-4');

      expect(tracer.spans.every(s => s.ended)).toBe(true);
    });

    it('does not use ai.* attribute prefix anywhere', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onToolCallStart!(makeToolCallStartEvent());
      integration.onToolCallFinish!(makeToolCallFinishEvent(true));
      integration.onStepFinish!(makeStepFinishEvent());
      integration.onFinish!(makeFinishEvent());

      for (const span of tracer.spans) {
        for (const key of Object.keys(span.attributes)) {
          expect(key).not.toMatch(/^ai\./);
        }
      }
    });
  });
});
