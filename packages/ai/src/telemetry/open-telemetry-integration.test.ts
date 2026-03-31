import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Attributes,
  Span,
  SpanOptions,
  SpanStatusCode,
  Tracer,
} from '@opentelemetry/api';
import { OpenTelemetryIntegration } from './open-telemetry-integration';
import type { TelemetryIntegration } from './telemetry-integration';

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

function getSetAttributesArg(span: MockSpan, callIndex = 0): Attributes {
  return (span.setAttributes as ReturnType<typeof vi.fn>).mock.calls[
    callIndex
  ][0] as Attributes;
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

const model = { provider: 'test-provider', modelId: 'test-model' };

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
      modelId: 'test-model',
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

function makeChunkEvent(
  chunk: Parameters<NonNullable<TelemetryIntegration['onChunk']>>[0]['chunk'],
) {
  return { chunk } as Parameters<
    NonNullable<TelemetryIntegration['onChunk']>
  >[0];
}

describe('OpenTelemetryIntegration', () => {
  let tracer: MockTracer;
  let otelIntegration: TelemetryIntegration;

  beforeEach(() => {
    tracer = createMockTracer();
    callId = `test-call-${++callIdCounter}`;
    otelIntegration = new OpenTelemetryIntegration({ tracer });
  });

  describe('onStart', () => {
    it('creates a root span', () => {
      otelIntegration.onStart!(makeOnStartEvent());

      expect(tracer.startSpan).toHaveBeenCalledTimes(1);
      expect(tracer.spans).toHaveLength(1);
      expect(tracer.spans[0].name).toBe('ai.generateText');
    });

    it('sets model attributes on the root span', () => {
      otelIntegration.onStart!(makeOnStartEvent());

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['ai.model.provider']).toBe('test-provider');
      expect(attrs['ai.model.id']).toBe('test-model');
    });

    it('sets prompt as input attribute', () => {
      otelIntegration.onStart!(makeOnStartEvent());

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['ai.prompt']).toContain('Hello');
    });

    it('sets operation name attributes', () => {
      otelIntegration.onStart!(makeOnStartEvent());

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['ai.operationId']).toBe('ai.generateText');
      expect(attrs['operation.name']).toBe('ai.generateText');
    });

    it('does not create a span when telemetry is disabled', () => {
      otelIntegration.onStart!(
        makeOnStartEvent({
          isEnabled: false,
        }),
      );

      expect(tracer.startSpan).not.toHaveBeenCalled();
    });

    it('does not create a span when isEnabled is undefined', () => {
      otelIntegration.onStart?.(makeOnStartEvent({ isEnabled: undefined }));

      expect(tracer.startSpan).not.toHaveBeenCalled();
    });

    it('uses a tracer configured for the call id', () => {
      const configuredTracer = createMockTracer();
      const configuredIntegration = new OpenTelemetryIntegration({
        tracer: configuredTracer,
      });

      configuredIntegration.onStart!(makeOnStartEvent());

      expect(configuredTracer.startSpan).toHaveBeenCalledTimes(1);
    });
  });

  describe('onStepStart', () => {
    it('creates a step span as child of root span', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());

      expect(tracer.startSpan).toHaveBeenCalledTimes(2);
      expect(tracer.spans).toHaveLength(2);
      expect(tracer.spans[1].name).toBe('ai.generateText.doGenerate');
    });

    it('uses ai.streamText.doStream for streamText operations', () => {
      otelIntegration.onStart!(
        makeOnStartEvent({ operationId: 'ai.streamText' }),
      );
      otelIntegration.onStepStart!(makeStepStartEvent());

      expect(tracer.spans[1].name).toBe('ai.streamText.doStream');
    });

    it('sets gen_ai attributes on step span', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());

      const attrs = getStartSpanAttributes(tracer, 1);
      expect(attrs['gen_ai.system']).toBe('test-provider');
      expect(attrs['gen_ai.request.model']).toBe('test-model');
    });

    it('does not create step span without prior onStart', () => {
      otelIntegration.onStepStart!(makeStepStartEvent());

      expect(tracer.startSpan).not.toHaveBeenCalled();
    });

    it('does not create step span for unknown callId', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(
        makeStepStartEvent({ callId: 'unknown-id' }),
      );

      expect(tracer.spans).toHaveLength(1);
    });

    it('includes prompt messages when provided', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(
        makeStepStartEvent({
          promptMessages: [
            { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
          ],
        }),
      );

      const attrs = getStartSpanAttributes(tracer, 1);
      expect(attrs['ai.prompt.messages']).toBeDefined();
    });

    it('includes tool choice and tools when provided', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(
        makeStepStartEvent({
          stepTools: [{ type: 'function', name: 'myTool' }],
          stepToolChoice: { type: 'auto' },
        }),
      );

      const attrs = getStartSpanAttributes(tracer, 1);
      expect(attrs['ai.prompt.tools']).toBeDefined();
      expect(attrs['ai.prompt.toolChoice']).toBeDefined();
    });
  });

  describe('onToolCallStart', () => {
    it('creates a tool span as child of step span', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());

      expect(tracer.startSpan).toHaveBeenCalledTimes(3);
      expect(tracer.spans).toHaveLength(3);
      expect(tracer.spans[2].name).toBe('ai.toolCall');
    });

    it('sets tool call attributes', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());

      const attrs = getStartSpanAttributes(tracer, 2);
      expect(attrs['ai.toolCall.name']).toBe('myTool');
      expect(attrs['ai.toolCall.id']).toBe('tool-call-1');
    });

    it('sets tool call args as output attribute', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());

      const attrs = getStartSpanAttributes(tracer, 2);
      expect(attrs['ai.toolCall.args']).toBe(JSON.stringify({ query: 'test' }));
    });

    it('does not create tool span without prior step span', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());

      expect(tracer.spans).toHaveLength(1);
    });

    it('creates multiple tool spans for concurrent tool calls', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());

      otelIntegration.onToolCallStart!(
        makeToolCallStartEvent({
          toolCall: {
            toolCallId: 'tool-1',
            toolName: 'toolA',
            input: {},
          },
        }),
      );
      otelIntegration.onToolCallStart!(
        makeToolCallStartEvent({
          toolCall: {
            toolCallId: 'tool-2',
            toolName: 'toolB',
            input: {},
          },
        }),
      );

      expect(tracer.spans).toHaveLength(4);
      expect(tracer.spans[2].name).toBe('ai.toolCall');
      expect(tracer.spans[3].name).toBe('ai.toolCall');
    });
  });

  describe('onToolCallFinish', () => {
    it('ends the tool span on success', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());
      otelIntegration.onToolCallFinish!(makeToolCallFinishEvent(true));

      const toolSpan = tracer.spans[2];
      expect(toolSpan.ended).toBe(true);
    });

    it('sets result attribute on successful tool call', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());
      otelIntegration.onToolCallFinish!(makeToolCallFinishEvent(true));

      const toolSpan = tracer.spans[2];
      expect(toolSpan.setAttributes).toHaveBeenCalled();
    });

    it('records error on failed tool call', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());
      otelIntegration.onToolCallFinish!(makeToolCallFinishEvent(false));

      const toolSpan = tracer.spans[2];
      expect(toolSpan.ended).toBe(true);
      expect(toolSpan.recordException).toHaveBeenCalled();
      expect(toolSpan.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ code: SpanStatusCode.ERROR }),
      );
    });

    it('does nothing for unknown tool call id', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());

      otelIntegration.onToolCallFinish!(
        makeToolCallFinishEvent(true, {
          toolCall: {
            toolCallId: 'unknown-tool',
            toolName: 'myTool',
            input: {},
          },
        }),
      );

      const toolSpan = tracer.spans[2];
      expect(toolSpan.ended).toBe(false);
    });

    it('removes tool span from state after finishing', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());
      otelIntegration.onToolCallFinish!(makeToolCallFinishEvent(true));

      otelIntegration.onToolCallFinish!(makeToolCallFinishEvent(true));

      expect(tracer.spans[2].end).toHaveBeenCalledTimes(1);
    });
  });

  describe('onStepFinish', () => {
    it('ends the step span', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(makeStepFinishEvent());

      const stepSpan = tracer.spans[1];
      expect(stepSpan.ended).toBe(true);
    });

    it('sets response attributes on step span', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(makeStepFinishEvent());

      const stepSpan = tracer.spans[1];
      expect(stepSpan.setAttributes).toHaveBeenCalled();

      const setAttrsCall = getSetAttributesArg(stepSpan);
      expect(setAttrsCall['ai.response.finishReason']).toBe('stop');
      expect(setAttrsCall['ai.usage.inputTokens']).toBe(10);
      expect(setAttrsCall['ai.usage.outputTokens']).toBe(20);
      expect(setAttrsCall['ai.response.id']).toBe('resp-1');
      expect(setAttrsCall['ai.response.model']).toBe('test-model');
    });

    it('sets gen_ai response attributes', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(makeStepFinishEvent());

      const stepSpan = tracer.spans[1];
      const setAttrsCall = getSetAttributesArg(stepSpan);
      expect(setAttrsCall['gen_ai.response.finish_reasons']).toEqual(['stop']);
      expect(setAttrsCall['gen_ai.response.id']).toBe('resp-1');
      expect(setAttrsCall['gen_ai.response.model']).toBe('test-model');
      expect(setAttrsCall['gen_ai.usage.input_tokens']).toBe(10);
      expect(setAttrsCall['gen_ai.usage.output_tokens']).toBe(20);
    });

    it('includes text in output attributes', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(
        makeStepFinishEvent({ text: 'Generated text' }),
      );

      const stepSpan = tracer.spans[1];
      const setAttrsCall = getSetAttributesArg(stepSpan);
      expect(setAttrsCall['ai.response.text']).toBe('Generated text');
    });

    it('includes reasoning when present', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(
        makeStepFinishEvent({
          reasoning: [
            { type: 'reasoning', text: 'Step 1' },
            { type: 'reasoning', text: 'Step 2' },
          ],
        }),
      );

      const stepSpan = tracer.spans[1];
      const setAttrsCall = getSetAttributesArg(stepSpan);
      expect(setAttrsCall['ai.response.reasoning']).toBe('Step 1\nStep 2');
    });

    it('includes tool calls when present', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(
        makeStepFinishEvent({
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'myTool',
              input: { q: 'test' },
            },
          ],
        }),
      );

      const stepSpan = tracer.spans[1];
      const setAttrsCall = getSetAttributesArg(stepSpan);
      expect(setAttrsCall['ai.response.toolCalls']).toBeDefined();
      const parsed = JSON.parse(
        setAttrsCall['ai.response.toolCalls'] as string,
      );
      expect(parsed[0].toolName).toBe('myTool');
    });

    it('includes files when present', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(
        makeStepFinishEvent({
          files: [
            {
              mediaType: 'image/png',
              base64: 'iVBORw0KGgo=',
            },
          ],
        }),
      );

      const stepSpan = tracer.spans[1];
      const setAttrsCall = getSetAttributesArg(stepSpan);
      expect(setAttrsCall['ai.response.files']).toBeDefined();
      const parsed = JSON.parse(setAttrsCall['ai.response.files'] as string);
      expect(parsed).toEqual([
        {
          type: 'file',
          mediaType: 'image/png',
          data: 'iVBORw0KGgo=',
        },
      ]);
    });

    it('does not include files when empty', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(makeStepFinishEvent({ files: [] }));

      const stepSpan = tracer.spans[1];
      const setAttrsCall = getSetAttributesArg(stepSpan);
      expect(setAttrsCall['ai.response.files']).toBeUndefined();
    });

    it('does nothing without prior step span', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepFinish!(makeStepFinishEvent());

      expect(tracer.spans).toHaveLength(1);
    });

    it('allows a new step span after finishing a step', () => {
      otelIntegration.onStart!(makeOnStartEvent());

      otelIntegration.onStepStart!(makeStepStartEvent({ stepNumber: 0 }));
      otelIntegration.onStepFinish!(makeStepFinishEvent({ stepNumber: 0 }));

      otelIntegration.onStepStart!(makeStepStartEvent({ stepNumber: 1 }));
      otelIntegration.onStepFinish!(makeStepFinishEvent({ stepNumber: 1 }));

      expect(tracer.spans).toHaveLength(3);
      expect(tracer.spans[1].ended).toBe(true);
      expect(tracer.spans[2].ended).toBe(true);
    });
  });

  describe('onFinish', () => {
    it('ends the root span', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(makeStepFinishEvent());
      otelIntegration.onFinish!(makeFinishEvent());

      const rootSpan = tracer.spans[0];
      expect(rootSpan.ended).toBe(true);
    });

    it('sets aggregated usage attributes on root span', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(makeStepFinishEvent());
      otelIntegration.onFinish!(
        makeFinishEvent({
          totalUsage: {
            inputTokens: 50,
            outputTokens: 100,
            totalTokens: 150,
          },
        }),
      );

      const rootSpan = tracer.spans[0];
      const setAttrsCall = getSetAttributesArg(rootSpan);
      expect(setAttrsCall['ai.usage.inputTokens']).toBe(50);
      expect(setAttrsCall['ai.usage.outputTokens']).toBe(100);
      expect(setAttrsCall['ai.usage.totalTokens']).toBe(150);
    });

    it('sets finish reason on root span', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(makeStepFinishEvent());
      otelIntegration.onFinish!(makeFinishEvent());

      const rootSpan = tracer.spans[0];
      const setAttrsCall = getSetAttributesArg(rootSpan);
      expect(setAttrsCall['ai.response.finishReason']).toBe('stop');
    });

    it('includes files in root span when present', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(makeStepFinishEvent());
      otelIntegration.onFinish!(
        makeFinishEvent({
          files: [
            {
              mediaType: 'image/png',
              base64: 'iVBORw0KGgo=',
            },
          ],
        }),
      );

      const rootSpan = tracer.spans[0];
      const setAttrsCall = getSetAttributesArg(rootSpan);
      expect(setAttrsCall['ai.response.files']).toBeDefined();
      const parsed = JSON.parse(setAttrsCall['ai.response.files'] as string);
      expect(parsed).toEqual([
        {
          type: 'file',
          mediaType: 'image/png',
          data: 'iVBORw0KGgo=',
        },
      ]);
    });

    it('cleans up call state after finishing', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(makeStepFinishEvent());
      otelIntegration.onFinish!(makeFinishEvent());

      otelIntegration.onStepStart!(makeStepStartEvent());
      expect(tracer.spans).toHaveLength(2);
    });

    it('does nothing without prior onStart', () => {
      otelIntegration.onFinish!(makeFinishEvent());

      expect(tracer.spans).toHaveLength(0);
    });
  });

  describe('onChunk', () => {
    it('adds event to step span for ai.stream.firstChunk', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());

      otelIntegration.onChunk!(
        makeChunkEvent({
          type: 'ai.stream.firstChunk',
          callId,
          stepNumber: 0,
          attributes: { 'ai.stream.msToFirstChunk': 42 },
        }),
      );

      const stepSpan = tracer.spans[1];
      expect(stepSpan.addEvent).toHaveBeenCalledWith(
        'ai.stream.firstChunk',
        expect.objectContaining({ 'ai.stream.msToFirstChunk': 42 }),
      );
    });

    it('adds event to step span for ai.stream.finish', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());

      otelIntegration.onChunk!(
        makeChunkEvent({
          type: 'ai.stream.finish',
          callId,
          stepNumber: 0,
          attributes: { 'ai.stream.msToFinish': 500 },
        }),
      );

      const stepSpan = tracer.spans[1];
      expect(stepSpan.addEvent).toHaveBeenCalledWith(
        'ai.stream.finish',
        expect.objectContaining({ 'ai.stream.msToFinish': 500 }),
      );
    });

    it('sets attributes on step span when chunk has attributes', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());

      otelIntegration.onChunk!(
        makeChunkEvent({
          type: 'ai.stream.firstChunk',
          callId,
          stepNumber: 0,
          attributes: { 'ai.stream.msToFirstChunk': 42 },
        }),
      );

      const stepSpan = tracer.spans[1];
      expect(stepSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({ 'ai.stream.msToFirstChunk': 42 }),
      );
    });

    it('ignores chunks without callId in the chunk body', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());

      otelIntegration.onChunk!(
        makeChunkEvent({
          type: 'text-delta',
          id: 'td-1',
          text: 'hello',
        }),
      );

      const stepSpan = tracer.spans[1];
      expect(stepSpan.addEvent).not.toHaveBeenCalled();
    });

    it('does not set attributes when chunk attributes are empty', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());

      otelIntegration.onChunk!(
        makeChunkEvent({
          type: 'ai.stream.firstChunk',
          callId,
          stepNumber: 0,
          attributes: {},
        }),
      );

      const stepSpan = tracer.spans[1];
      expect(stepSpan.addEvent).toHaveBeenCalled();
      expect(stepSpan.setAttributes).not.toHaveBeenCalled();
    });
  });

  describe('onError', () => {
    it('records error on root span and ends it', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());

      const error = new Error('something went wrong');
      otelIntegration.onError!({ callId, error });

      const rootSpan = tracer.spans[0];
      expect(rootSpan.recordException).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Error',
          message: 'something went wrong',
        }),
      );
      expect(rootSpan.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          code: SpanStatusCode.ERROR,
          message: 'something went wrong',
        }),
      );
      expect(rootSpan.ended).toBe(true);
    });

    it('records error on step span and ends it when active', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());

      const error = new Error('step error');
      otelIntegration.onError!({ callId, error });

      const stepSpan = tracer.spans[1];
      expect(stepSpan.recordException).toHaveBeenCalled();
      expect(stepSpan.ended).toBe(true);
    });

    it('handles non-Error objects', () => {
      otelIntegration.onStart!(makeOnStartEvent());

      otelIntegration.onError!({ callId, error: 'string error' });

      const rootSpan = tracer.spans[0];
      expect(rootSpan.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ code: SpanStatusCode.ERROR }),
      );
      expect(rootSpan.ended).toBe(true);
    });

    it('does nothing without callId', () => {
      otelIntegration.onStart!(makeOnStartEvent());

      otelIntegration.onError!({ error: new Error('no callId') });

      const rootSpan = tracer.spans[0];
      expect(rootSpan.ended).toBe(false);
    });

    it('does nothing for unknown callId', () => {
      otelIntegration.onStart!(makeOnStartEvent());

      otelIntegration.onError!({
        callId: 'unknown',
        error: new Error('unknown'),
      });

      const rootSpan = tracer.spans[0];
      expect(rootSpan.ended).toBe(false);
    });

    it('cleans up call state after error', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onError!({ callId, error: new Error('fail') });

      otelIntegration.onStepStart!(makeStepStartEvent());
      expect(tracer.spans).toHaveLength(1);
    });
  });

  describe('telemetry disabled / recordInputs / recordOutputs', () => {
    it('does not record input attributes when recordInputs is false', () => {
      otelIntegration.onStart!(makeOnStartEvent({ recordInputs: false }));

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['ai.prompt']).toBeUndefined();
    });

    it('does not record output attributes when recordOutputs is false', () => {
      otelIntegration.onStart!(makeOnStartEvent({ recordOutputs: false }));
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onStepFinish!(
        makeStepFinishEvent({ text: 'secret output' }),
      );

      const stepSpan = tracer.spans[1];
      const setAttrsCall = getSetAttributesArg(stepSpan);
      expect(setAttrsCall['ai.response.text']).toBeUndefined();
    });

    it('records non-input/output attributes even when recordInputs is false', () => {
      otelIntegration.onStart!(makeOnStartEvent({ recordInputs: false }));

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['ai.model.provider']).toBe('test-provider');
      expect(attrs['ai.model.id']).toBe('test-model');
    });

    it('does not record tool call args when recordOutputs is false', () => {
      otelIntegration.onStart!(makeOnStartEvent({ recordOutputs: false }));
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());

      const attrs = getStartSpanAttributes(tracer, 2);
      expect(attrs['ai.toolCall.args']).toBeUndefined();
    });

    it('does not record tool call result when recordOutputs is false', () => {
      otelIntegration.onStart!(makeOnStartEvent({ recordOutputs: false }));
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());
      otelIntegration.onToolCallFinish!(makeToolCallFinishEvent(true));

      const toolSpan = tracer.spans[2];
      const setAttrsCalls = (toolSpan.setAttributes as ReturnType<typeof vi.fn>)
        .mock.calls;
      if (setAttrsCalls.length > 0) {
        expect(
          (setAttrsCalls[0][0] as Attributes)['ai.toolCall.result'],
        ).toBeUndefined();
      }
    });
  });

  describe('full lifecycle', () => {
    it('creates correct span hierarchy for generateText with tool call', () => {
      otelIntegration.onStart!(makeOnStartEvent());
      otelIntegration.onStepStart!(makeStepStartEvent());
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());
      otelIntegration.onToolCallFinish!(makeToolCallFinishEvent(true));
      otelIntegration.onStepFinish!(makeStepFinishEvent());
      otelIntegration.onFinish!(makeFinishEvent());

      expect(tracer.spans).toHaveLength(3);
      expect(tracer.spans[0].name).toBe('ai.generateText');
      expect(tracer.spans[1].name).toBe('ai.generateText.doGenerate');
      expect(tracer.spans[2].name).toBe('ai.toolCall');

      expect(tracer.spans[0].ended).toBe(true);
      expect(tracer.spans[1].ended).toBe(true);
      expect(tracer.spans[2].ended).toBe(true);
    });

    it('creates correct span hierarchy for multi-step generation', () => {
      otelIntegration.onStart!(makeOnStartEvent());

      otelIntegration.onStepStart!(makeStepStartEvent({ stepNumber: 0 }));
      otelIntegration.onToolCallStart!(makeToolCallStartEvent());
      otelIntegration.onToolCallFinish!(makeToolCallFinishEvent(true));
      otelIntegration.onStepFinish!(makeStepFinishEvent({ stepNumber: 0 }));

      otelIntegration.onStepStart!(makeStepStartEvent({ stepNumber: 1 }));
      otelIntegration.onStepFinish!(makeStepFinishEvent({ stepNumber: 1 }));

      otelIntegration.onFinish!(makeFinishEvent());

      expect(tracer.spans).toHaveLength(4);
      expect(tracer.spans[0].name).toBe('ai.generateText');
      expect(tracer.spans[1].name).toBe('ai.generateText.doGenerate');
      expect(tracer.spans[2].name).toBe('ai.toolCall');
      expect(tracer.spans[3].name).toBe('ai.generateText.doGenerate');

      for (const span of tracer.spans) {
        expect(span.ended).toBe(true);
      }
    });

    it('handles concurrent calls with different callIds', () => {
      const callId1 = 'call-1';
      const callId2 = 'call-2';

      otelIntegration.onStart!(makeOnStartEvent({ callId: callId1 }));
      otelIntegration.onStart!(makeOnStartEvent({ callId: callId2 }));

      expect(tracer.spans).toHaveLength(2);

      otelIntegration.onStepStart!(makeStepStartEvent({ callId: callId1 }));
      otelIntegration.onStepStart!(makeStepStartEvent({ callId: callId2 }));

      expect(tracer.spans).toHaveLength(4);

      otelIntegration.onStepFinish!(makeStepFinishEvent({ callId: callId1 }));
      otelIntegration.onFinish!(makeFinishEvent({ callId: callId1 }));

      expect(tracer.spans[0].ended).toBe(true);
      expect(tracer.spans[2].ended).toBe(true);

      expect(tracer.spans[1].ended).toBe(false);
      expect(tracer.spans[3].ended).toBe(false);

      otelIntegration.onStepFinish!(makeStepFinishEvent({ callId: callId2 }));
      otelIntegration.onFinish!(makeFinishEvent({ callId: callId2 }));

      for (const span of tracer.spans) {
        expect(span.ended).toBe(true);
      }
    });

    it('creates correct span hierarchy for streamText', () => {
      otelIntegration.onStart!(
        makeOnStartEvent({ operationId: 'ai.streamText' }),
      );
      otelIntegration.onStepStart!(makeStepStartEvent());

      otelIntegration.onChunk!(
        makeChunkEvent({
          type: 'ai.stream.firstChunk',
          callId,
          stepNumber: 0,
          attributes: { 'ai.stream.msToFirstChunk': 10 },
        }),
      );

      otelIntegration.onChunk!(
        makeChunkEvent({
          type: 'ai.stream.finish',
          callId,
          stepNumber: 0,
          attributes: { 'ai.stream.msToFinish': 200 },
        }),
      );

      otelIntegration.onStepFinish!(makeStepFinishEvent());
      otelIntegration.onFinish!(makeFinishEvent());

      expect(tracer.spans).toHaveLength(2);
      expect(tracer.spans[0].name).toBe('ai.streamText');
      expect(tracer.spans[1].name).toBe('ai.streamText.doStream');

      const stepSpan = tracer.spans[1];
      expect(stepSpan.events).toHaveLength(2);
      expect(stepSpan.events[0].name).toBe('ai.stream.firstChunk');
      expect(stepSpan.events[1].name).toBe('ai.stream.finish');

      for (const span of tracer.spans) {
        expect(span.ended).toBe(true);
      }
    });
  });

  describe('functionId in telemetry', () => {
    it('includes functionId in operation name', () => {
      otelIntegration.onStart!(
        makeOnStartEvent({
          functionId: 'my-chat',
        }),
      );

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['operation.name']).toBe('ai.generateText my-chat');
      expect(attrs['resource.name']).toBe('my-chat');
      expect(attrs['ai.telemetry.functionId']).toBe('my-chat');
    });
  });

  describe('metadata in telemetry', () => {
    it('includes metadata as telemetry attributes', () => {
      otelIntegration.onStart!(
        makeOnStartEvent({
          metadata: { userId: 'user-123', sessionId: 'sess-456' },
        }),
      );

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(attrs['ai.telemetry.metadata.userId']).toBe('user-123');
      expect(attrs['ai.telemetry.metadata.sessionId']).toBe('sess-456');
    });
  });
});
