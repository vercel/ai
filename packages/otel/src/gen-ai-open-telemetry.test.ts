import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Attributes, Span, SpanOptions, Tracer } from '@opentelemetry/api';
import type { Telemetry } from 'ai';
import { GenAIOpenTelemetry } from './gen-ai-open-telemetry';

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

function serializeSpan(span: MockSpan, tracer: MockTracer) {
  const spanIndex = tracer.spans.indexOf(span);
  const initAttributes =
    spanIndex >= 0 ? getStartSpanAttributes(tracer, spanIndex) : {};

  return {
    name: span.name,
    ended: span.ended,
    ...(span.status ? { status: span.status } : {}),
    initAttributes,
    runtimeAttributes: span.attributes,
    ...(span.events.length > 0 ? { events: span.events } : {}),
    ...(span.exceptions.length > 0 ? { exceptions: span.exceptions } : {}),
  };
}

function serializeTrace(tracer: MockTracer) {
  return tracer.spans.map(span => serializeSpan(span, tracer));
}

function parseJsonAttributes(
  attrs: Attributes,
  ...keys: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === 'string') {
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
    }
  }
  return result;
}

let callId: string;
let callIdCounter = 0;

function telemetryFields() {
  return {
    recordInputs: undefined,
    recordOutputs: undefined,
    functionId: undefined,
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
    messages: [{ role: 'user', content: 'Hello' }],
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
    toolsContext: {},
    ...telemetryFields(),
    runtimeContext: {},
    ...overrides,
  } as Parameters<NonNullable<Telemetry['onStart']>>[0];
}

function makeStepStartEvent(overrides?: Record<string, unknown>) {
  return {
    callId,
    provider: model.provider,
    modelId: model.modelId,
    stepNumber: 0,
    system: undefined,
    messages: [],
    tools: undefined,
    toolChoice: undefined,
    activeTools: undefined,
    steps: [],
    providerOptions: undefined,
    abortSignal: undefined,
    include: undefined,
    output: undefined,
    runtimeContext: {},
    ...telemetryFields(),
    toolsContext: {},
    promptMessages: undefined,
    stepTools: undefined,
    stepToolChoice: undefined,
    ...overrides,
  } as Parameters<NonNullable<Telemetry['onStepStart']>>[0];
}

function makeLanguageModelCallStartEvent(overrides?: Record<string, unknown>) {
  return {
    callId,
    provider: model.provider,
    modelId: model.modelId,
    messages: [],
    tools: undefined,
    ...overrides,
  } as Parameters<NonNullable<Telemetry['onLanguageModelCallStart']>>[0];
}

function makeLanguageModelCallEndEvent(overrides?: Record<string, unknown>) {
  return {
    callId,
    provider: model.provider,
    modelId: model.modelId,
    finishReason: 'stop' as const,
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
    content: [{ type: 'text', text: 'Hello world' }],
    responseId: 'test-response-id',
    ...overrides,
  } as Parameters<NonNullable<Telemetry['onLanguageModelCallEnd']>>[0];
}

function makeStepFinishEvent(overrides?: Record<string, unknown>) {
  return {
    callId,
    stepNumber: 0,
    model,
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
    ...telemetryFields(),
    runtimeContext: {},
    toolsContext: {},
    ...overrides,
  } as Parameters<NonNullable<Telemetry['onStepFinish']>>[0];
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
  } as Parameters<NonNullable<Telemetry['onFinish']>>[0];
}

function makeToolCallStartEvent(overrides?: Record<string, unknown>) {
  return {
    callId,
    toolCall: {
      type: 'tool-call' as const,
      toolCallId: 'tool-call-1',
      toolName: 'myTool',
      input: { query: 'test' },
    },
    abortSignal: undefined,
    ...telemetryFields(),
    messages: [],
    toolContext: {},
    toolsContext: {},
    ...overrides,
  } as Parameters<NonNullable<Telemetry['onToolExecutionStart']>>[0];
}

function makeToolCallFinishEvent(
  success: boolean,
  overrides?: Record<string, unknown>,
) {
  const base = {
    callId,
    toolCall: {
      type: 'tool-call' as const,
      toolCallId: 'tool-call-1',
      toolName: 'myTool',
      input: { query: 'test' },
    },
    abortSignal: undefined,
    durationMs: 42,
    ...telemetryFields(),
    messages: [],
    toolContext: {},
    toolsContext: {},
    ...overrides,
  };

  if (success) {
    return {
      ...base,
      toolOutput: {
        type: 'tool-result' as const,
        toolCallId: 'tool-call-1',
        toolName: 'myTool',
        input: { query: 'test' },
        output: { result: 'ok' },
        dynamic: false,
      },
    } as Parameters<NonNullable<Telemetry['onToolExecutionEnd']>>[0];
  }
  return {
    ...base,
    toolOutput: {
      type: 'tool-error' as const,
      toolCallId: 'tool-call-1',
      toolName: 'myTool',
      input: { query: 'test' },
      error: new Error('tool failed'),
      dynamic: false,
    },
  } as Parameters<NonNullable<Telemetry['onToolExecutionEnd']>>[0];
}

describe('GenAIOpenTelemetry', () => {
  let tracer: MockTracer;
  let integration: Telemetry;

  beforeEach(() => {
    tracer = createMockTracer();
    callId = `test-call-${++callIdCounter}`;
    integration = new GenAIOpenTelemetry({ tracer });
  });

  describe('onStart (generateText)', () => {
    it('creates root span with correct attributes', () => {
      integration.onStart!(makeOnStartEvent());

      expect(tracer.startSpan).toHaveBeenCalledTimes(1);
      expect(serializeSpan(tracer.spans[0], tracer)).toMatchInlineSnapshot(`
        {
          "ended": false,
          "initAttributes": {
            "gen_ai.input.messages": "[{"role":"user","parts":[{"type":"text","content":"Hello"}]}]",
            "gen_ai.operation.name": "invoke_agent",
            "gen_ai.provider.name": "openai",
            "gen_ai.request.max_tokens": 100,
            "gen_ai.request.model": "gpt-4",
            "gen_ai.request.temperature": 0.7,
          },
          "name": "invoke_agent gpt-4",
          "runtimeAttributes": {},
        }
      `);
    });

    it('sets system_instructions when system is provided', () => {
      integration.onStart!(makeOnStartEvent({ system: 'You are helpful' }));

      const attrs = getStartSpanAttributes(tracer, 0);
      expect(parseJsonAttributes(attrs, 'gen_ai.system_instructions'))
        .toMatchInlineSnapshot(`
        {
          "gen_ai.system_instructions": [
            {
              "content": "You are helpful",
              "type": "text",
            },
          ],
        }
      `);
    });

    it('preserves functionId as gen_ai.agent.name', () => {
      integration.onStart!(
        makeOnStartEvent({
          functionId: 'my-agent',
        }),
      );

      const attrs = getStartSpanAttributes(tracer, 0);
      expect({
        agentName: attrs['gen_ai.agent.name'],
      }).toMatchInlineSnapshot(`
        {
          "agentName": "my-agent",
        }
      `);
    });
  });

  describe('onStepStart', () => {
    it('creates agent_step and chat spans with correct attributes', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());

      expect(tracer.startSpan).toHaveBeenCalledTimes(3);
      expect(serializeSpan(tracer.spans[1], tracer)).toMatchInlineSnapshot(`
        {
          "ended": false,
          "initAttributes": {
            "gen_ai.operation.name": "agent_step",
          },
          "name": "step 1",
          "runtimeAttributes": {},
        }
      `);
      expect(serializeSpan(tracer.spans[2], tracer)).toMatchInlineSnapshot(`
        {
          "ended": false,
          "initAttributes": {
            "gen_ai.operation.name": "chat",
            "gen_ai.provider.name": "openai",
            "gen_ai.request.max_tokens": 100,
            "gen_ai.request.model": "gpt-4",
            "gen_ai.request.temperature": 0.7,
          },
          "name": "chat gpt-4",
          "runtimeAttributes": {},
        }
      `);
    });

    it('sets gen_ai.input.messages when messages are provided', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(
        makeLanguageModelCallStartEvent({
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        }),
      );

      const attrs = getStartSpanAttributes(tracer, 2);
      expect(parseJsonAttributes(attrs, 'gen_ai.input.messages'))
        .toMatchInlineSnapshot(`
        {
          "gen_ai.input.messages": [
            {
              "parts": [
                {
                  "content": "Hello",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
        }
      `);
    });

    it('sets gen_ai.tool.definitions when tools provided', () => {
      const tools = [
        { type: 'function', name: 'get_weather', description: 'Get weather' },
      ];
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(
        makeLanguageModelCallStartEvent({ tools }),
      );

      const attrs = getStartSpanAttributes(tracer, 2);
      expect(parseJsonAttributes(attrs, 'gen_ai.tool.definitions'))
        .toMatchInlineSnapshot(`
        {
          "gen_ai.tool.definitions": [
            {
              "description": "Get weather",
              "name": "get_weather",
              "type": "function",
            },
          ],
        }
      `);
    });
  });

  describe('onStepFinish', () => {
    it('sets response attributes and token usage on the chat span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onLanguageModelCallEnd!(makeLanguageModelCallEndEvent());
      integration.onStepFinish!(makeStepFinishEvent());

      expect(serializeSpan(tracer.spans[2], tracer)).toMatchInlineSnapshot(`
        {
          "ended": true,
          "initAttributes": {
            "gen_ai.operation.name": "chat",
            "gen_ai.provider.name": "openai",
            "gen_ai.request.max_tokens": 100,
            "gen_ai.request.model": "gpt-4",
            "gen_ai.request.temperature": 0.7,
          },
          "name": "chat gpt-4",
          "runtimeAttributes": {
            "gen_ai.output.messages": "[{"role":"assistant","parts":[{"type":"text","content":"Hello world"}],"finish_reason":"stop"}]",
            "gen_ai.response.finish_reasons": [
              "stop",
            ],
            "gen_ai.response.id": "test-response-id",
            "gen_ai.usage.input_tokens": 10,
            "gen_ai.usage.output_tokens": 20,
          },
        }
      `);
    });

    it('formats output messages in SemConv format', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onLanguageModelCallEnd!(makeLanguageModelCallEndEvent());
      integration.onStepFinish!(makeStepFinishEvent());

      const chatSpan = tracer.spans[2];
      expect(parseJsonAttributes(chatSpan.attributes, 'gen_ai.output.messages'))
        .toMatchInlineSnapshot(`
        {
          "gen_ai.output.messages": [
            {
              "finish_reason": "stop",
              "parts": [
                {
                  "content": "Hello world",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
        }
      `);
    });

    it('includes tool calls in output messages', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onLanguageModelCallEnd!(
        makeLanguageModelCallEndEvent({
          content: [
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

      const chatSpan = tracer.spans[2];
      expect(parseJsonAttributes(chatSpan.attributes, 'gen_ai.output.messages'))
        .toMatchInlineSnapshot(`
        {
          "gen_ai.output.messages": [
            {
              "finish_reason": "tool_call",
              "parts": [
                {
                  "arguments": {
                    "q": "test",
                  },
                  "id": "tc1",
                  "name": "search",
                  "type": "tool_call",
                },
              ],
              "role": "assistant",
            },
          ],
        }
      `);
    });

    it('sets cache token attributes when available', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onLanguageModelCallEnd!(
        makeLanguageModelCallEndEvent({
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

      const chatSpan = tracer.spans[2];
      expect({
        inputTokens: chatSpan.attributes['gen_ai.usage.input_tokens'],
        outputTokens: chatSpan.attributes['gen_ai.usage.output_tokens'],
        cacheRead: chatSpan.attributes['gen_ai.usage.cache_read.input_tokens'],
        cacheCreation:
          chatSpan.attributes['gen_ai.usage.cache_creation.input_tokens'],
      }).toMatchInlineSnapshot(`
        {
          "cacheCreation": 10,
          "cacheRead": 20,
          "inputTokens": 100,
          "outputTokens": 50,
        }
      `);
    });
  });

  describe('onToolExecutionStart / onToolExecutionEnd', () => {
    it('creates an execute_tool span with correct attributes', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onToolExecutionStart!(makeToolCallStartEvent());

      expect(tracer.spans).toHaveLength(4);
      expect(serializeSpan(tracer.spans[3], tracer)).toMatchInlineSnapshot(`
        {
          "ended": false,
          "initAttributes": {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.call.arguments": "{"query":"test"}",
            "gen_ai.tool.call.id": "tool-call-1",
            "gen_ai.tool.name": "myTool",
            "gen_ai.tool.type": "function",
          },
          "name": "execute_tool myTool",
          "runtimeAttributes": {},
        }
      `);
    });

    it('parents chat and execute_tool spans under the same step span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onToolExecutionStart!(makeToolCallStartEvent());

      const mock = tracer.startSpan as ReturnType<typeof vi.fn>;
      expect(mock.mock.calls[2][2]).toBe(mock.mock.calls[3][2]);
    });

    it('sets gen_ai.tool.call.result on success', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onToolExecutionStart!(makeToolCallStartEvent());
      integration.onToolExecutionEnd!(makeToolCallFinishEvent(true));

      expect(serializeSpan(tracer.spans[3], tracer)).toMatchInlineSnapshot(`
        {
          "ended": true,
          "initAttributes": {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.call.arguments": "{"query":"test"}",
            "gen_ai.tool.call.id": "tool-call-1",
            "gen_ai.tool.name": "myTool",
            "gen_ai.tool.type": "function",
          },
          "name": "execute_tool myTool",
          "runtimeAttributes": {
            "gen_ai.tool.call.result": "{"result":"ok"}",
          },
        }
      `);
    });

    it('records error on tool failure', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onToolExecutionStart!(makeToolCallStartEvent());
      integration.onToolExecutionEnd!(makeToolCallFinishEvent(false));

      const toolSpan = tracer.spans[3];
      expect({
        status: toolSpan.status,
        ended: toolSpan.ended,
      }).toMatchInlineSnapshot(`
        {
          "ended": true,
          "status": {
            "code": 2,
            "message": "tool failed",
          },
        }
      `);
    });
  });

  describe('onFinish (generateText)', () => {
    it('sets total usage and output on root span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(makeStepFinishEvent());
      integration.onFinish!(makeFinishEvent());

      expect(serializeSpan(tracer.spans[0], tracer)).toMatchInlineSnapshot(`
        {
          "ended": true,
          "initAttributes": {
            "gen_ai.input.messages": "[{"role":"user","parts":[{"type":"text","content":"Hello"}]}]",
            "gen_ai.operation.name": "invoke_agent",
            "gen_ai.provider.name": "openai",
            "gen_ai.request.max_tokens": 100,
            "gen_ai.request.model": "gpt-4",
            "gen_ai.request.temperature": 0.7,
          },
          "name": "invoke_agent gpt-4",
          "runtimeAttributes": {
            "gen_ai.output.messages": "[{"role":"assistant","parts":[{"type":"text","content":"Hello world"}],"finish_reason":"stop"}]",
            "gen_ai.response.finish_reasons": [
              "stop",
            ],
            "gen_ai.usage.input_tokens": 10,
            "gen_ai.usage.output_tokens": 20,
          },
        }
      `);
    });

    it('formats output messages on root span', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onStepFinish!(makeStepFinishEvent());
      integration.onFinish!(makeFinishEvent());

      const rootSpan = tracer.spans[0];
      expect(parseJsonAttributes(rootSpan.attributes, 'gen_ai.output.messages'))
        .toMatchInlineSnapshot(`
        {
          "gen_ai.output.messages": [
            {
              "finish_reason": "stop",
              "parts": [
                {
                  "content": "Hello world",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
        }
      `);
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
      expect({
        operationName: attrs['gen_ai.operation.name'],
        outputType: attrs['gen_ai.output.type'],
      }).toMatchInlineSnapshot(`
        {
          "operationName": "invoke_agent",
          "outputType": "json",
        }
      `);
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

      expect(serializeSpan(tracer.spans[0], tracer)).toMatchInlineSnapshot(`
        {
          "ended": false,
          "initAttributes": {
            "gen_ai.operation.name": "embeddings",
            "gen_ai.provider.name": "openai",
            "gen_ai.request.model": "gpt-4",
          },
          "name": "embeddings gpt-4",
          "runtimeAttributes": {},
        }
      `);
    });
  });

  describe('onStart (rerank)', () => {
    it('creates a rerank span', () => {
      integration.onStart!(
        makeOnStartEvent({
          operationId: 'ai.rerank',
          documents: [{ text: 'doc1' }],
        }),
      );

      expect(serializeSpan(tracer.spans[0], tracer)).toMatchInlineSnapshot(`
        {
          "ended": false,
          "initAttributes": {
            "gen_ai.operation.name": "rerank",
            "gen_ai.provider.name": "openai",
            "gen_ai.request.model": "gpt-4",
          },
          "name": "rerank gpt-4",
          "runtimeAttributes": {},
        }
      `);
    });
  });

  describe('onChunk (streaming events)', () => {
    it('is a no-op for stream chunk events', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());

      integration.onChunk!({
        chunk: {
          type: 'ai.stream.firstChunk',
          callId,
          stepNumber: 0,
          attributes: {
            'ai.stream.msToFirstChunk': 150,
          },
        },
      });

      const chatSpan = tracer.spans[2];
      expect(chatSpan.events).toMatchInlineSnapshot(`[]`);
    });

    it('does not emit events for stream finish', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());

      integration.onChunk!({
        chunk: {
          type: 'ai.stream.finish',
          callId,
          stepNumber: 0,
          attributes: {},
        },
      });

      const chatSpan = tracer.spans[2];
      expect(chatSpan.events).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('onError', () => {
    it('records error on root, step, and chat spans', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());

      integration.onError!({
        callId,
        error: new Error('something went wrong'),
      });

      expect(
        tracer.spans.map(s => ({
          name: s.name,
          status: s.status,
          ended: s.ended,
        })),
      ).toMatchInlineSnapshot(`
        [
          {
            "ended": true,
            "name": "invoke_agent gpt-4",
            "status": {
              "code": 2,
              "message": "something went wrong",
            },
          },
          {
            "ended": true,
            "name": "step 1",
            "status": {
              "code": 2,
              "message": "something went wrong",
            },
          },
          {
            "ended": true,
            "name": "chat gpt-4",
            "status": {
              "code": 2,
              "message": "something went wrong",
            },
          },
        ]
      `);
    });
  });

  describe('full lifecycle', () => {
    it('creates correct span hierarchy for multi-step tool loop', () => {
      integration.onStart!(makeOnStartEvent());

      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(
        makeLanguageModelCallStartEvent({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      );
      integration.onLanguageModelCallEnd!(
        makeLanguageModelCallEndEvent({
          finishReason: 'tool-calls',
          content: [
            {
              type: 'tool-call' as const,
              toolCallId: 'tool-call-1',
              toolName: 'myTool',
              input: { query: 'test' },
            },
          ],
        }),
      );
      integration.onToolExecutionStart!(makeToolCallStartEvent());
      integration.onToolExecutionEnd!(makeToolCallFinishEvent(true));
      integration.onStepFinish!(
        makeStepFinishEvent({
          finishReason: 'tool-calls',
          toolCalls: [
            {
              type: 'tool-call' as const,
              toolCallId: 'tool-call-1',
              toolName: 'myTool',
              input: { query: 'test' },
            },
          ],
          text: undefined,
        }),
      );

      integration.onStepStart!(makeStepStartEvent({ steps: [{}] }));
      integration.onLanguageModelCallStart!(
        makeLanguageModelCallStartEvent({
          messages: [{ role: 'assistant', content: 'Tool result received' }],
        }),
      );
      integration.onLanguageModelCallEnd!(makeLanguageModelCallEndEvent());
      integration.onStepFinish!(makeStepFinishEvent({ stepNumber: 1 }));

      integration.onFinish!(makeFinishEvent());

      expect(
        tracer.spans.map(s => ({
          name: s.name,
          ended: s.ended,
        })),
      ).toMatchInlineSnapshot(`
        [
          {
            "ended": true,
            "name": "invoke_agent gpt-4",
          },
          {
            "ended": true,
            "name": "step 1",
          },
          {
            "ended": true,
            "name": "chat gpt-4",
          },
          {
            "ended": true,
            "name": "execute_tool myTool",
          },
          {
            "ended": true,
            "name": "step 2",
          },
          {
            "ended": true,
            "name": "chat gpt-4",
          },
        ]
      `);
    });

    it('full trace snapshot for single-step generateText', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onLanguageModelCallEnd!(makeLanguageModelCallEndEvent());
      integration.onStepFinish!(makeStepFinishEvent());
      integration.onFinish!(makeFinishEvent());

      expect(serializeTrace(tracer)).toMatchInlineSnapshot(`
        [
          {
            "ended": true,
            "initAttributes": {
              "gen_ai.input.messages": "[{"role":"user","parts":[{"type":"text","content":"Hello"}]}]",
              "gen_ai.operation.name": "invoke_agent",
              "gen_ai.provider.name": "openai",
              "gen_ai.request.max_tokens": 100,
              "gen_ai.request.model": "gpt-4",
              "gen_ai.request.temperature": 0.7,
            },
            "name": "invoke_agent gpt-4",
            "runtimeAttributes": {
              "gen_ai.output.messages": "[{"role":"assistant","parts":[{"type":"text","content":"Hello world"}],"finish_reason":"stop"}]",
              "gen_ai.response.finish_reasons": [
                "stop",
              ],
              "gen_ai.usage.input_tokens": 10,
              "gen_ai.usage.output_tokens": 20,
            },
          },
          {
            "ended": true,
            "initAttributes": {
              "gen_ai.operation.name": "agent_step",
            },
            "name": "step 1",
            "runtimeAttributes": {},
          },
          {
            "ended": true,
            "initAttributes": {
              "gen_ai.operation.name": "chat",
              "gen_ai.provider.name": "openai",
              "gen_ai.request.max_tokens": 100,
              "gen_ai.request.model": "gpt-4",
              "gen_ai.request.temperature": 0.7,
            },
            "name": "chat gpt-4",
            "runtimeAttributes": {
              "gen_ai.output.messages": "[{"role":"assistant","parts":[{"type":"text","content":"Hello world"}],"finish_reason":"stop"}]",
              "gen_ai.response.finish_reasons": [
                "stop",
              ],
              "gen_ai.response.id": "test-response-id",
              "gen_ai.usage.input_tokens": 10,
              "gen_ai.usage.output_tokens": 20,
            },
          },
        ]
      `);
    });

    it('full trace snapshot for multi-step tool loop', () => {
      integration.onStart!(makeOnStartEvent());

      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onLanguageModelCallEnd!(
        makeLanguageModelCallEndEvent({
          finishReason: 'tool-calls',
        }),
      );
      integration.onToolExecutionStart!(makeToolCallStartEvent());
      integration.onToolExecutionEnd!(makeToolCallFinishEvent(true));
      integration.onStepFinish!(
        makeStepFinishEvent({
          finishReason: 'tool-calls',
          toolCalls: [
            {
              type: 'tool-call' as const,
              toolCallId: 'tool-call-1',
              toolName: 'myTool',
              input: { query: 'test' },
            },
          ],
          text: undefined,
        }),
      );

      integration.onStepStart!(makeStepStartEvent({ steps: [{}] }));
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onLanguageModelCallEnd!(makeLanguageModelCallEndEvent());
      integration.onStepFinish!(makeStepFinishEvent({ stepNumber: 1 }));

      integration.onFinish!(makeFinishEvent());

      expect(serializeTrace(tracer)).toMatchInlineSnapshot(`
        [
          {
            "ended": true,
            "initAttributes": {
              "gen_ai.input.messages": "[{"role":"user","parts":[{"type":"text","content":"Hello"}]}]",
              "gen_ai.operation.name": "invoke_agent",
              "gen_ai.provider.name": "openai",
              "gen_ai.request.max_tokens": 100,
              "gen_ai.request.model": "gpt-4",
              "gen_ai.request.temperature": 0.7,
            },
            "name": "invoke_agent gpt-4",
            "runtimeAttributes": {
              "gen_ai.output.messages": "[{"role":"assistant","parts":[{"type":"text","content":"Hello world"}],"finish_reason":"stop"}]",
              "gen_ai.response.finish_reasons": [
                "stop",
              ],
              "gen_ai.usage.input_tokens": 10,
              "gen_ai.usage.output_tokens": 20,
            },
          },
          {
            "ended": true,
            "initAttributes": {
              "gen_ai.operation.name": "agent_step",
            },
            "name": "step 1",
            "runtimeAttributes": {},
          },
          {
            "ended": true,
            "initAttributes": {
              "gen_ai.operation.name": "chat",
              "gen_ai.provider.name": "openai",
              "gen_ai.request.max_tokens": 100,
              "gen_ai.request.model": "gpt-4",
              "gen_ai.request.temperature": 0.7,
            },
            "name": "chat gpt-4",
            "runtimeAttributes": {
              "gen_ai.output.messages": "[{"role":"assistant","parts":[{"type":"text","content":"Hello world"}],"finish_reason":"tool_call"}]",
              "gen_ai.response.finish_reasons": [
                "tool-calls",
              ],
              "gen_ai.response.id": "test-response-id",
              "gen_ai.usage.input_tokens": 10,
              "gen_ai.usage.output_tokens": 20,
            },
          },
          {
            "ended": true,
            "initAttributes": {
              "gen_ai.operation.name": "execute_tool",
              "gen_ai.tool.call.arguments": "{"query":"test"}",
              "gen_ai.tool.call.id": "tool-call-1",
              "gen_ai.tool.name": "myTool",
              "gen_ai.tool.type": "function",
            },
            "name": "execute_tool myTool",
            "runtimeAttributes": {
              "gen_ai.tool.call.result": "{"result":"ok"}",
            },
          },
          {
            "ended": true,
            "initAttributes": {
              "gen_ai.operation.name": "agent_step",
            },
            "name": "step 2",
            "runtimeAttributes": {},
          },
          {
            "ended": true,
            "initAttributes": {
              "gen_ai.operation.name": "chat",
              "gen_ai.provider.name": "openai",
              "gen_ai.request.max_tokens": 100,
              "gen_ai.request.model": "gpt-4",
              "gen_ai.request.temperature": 0.7,
            },
            "name": "chat gpt-4",
            "runtimeAttributes": {
              "gen_ai.output.messages": "[{"role":"assistant","parts":[{"type":"text","content":"Hello world"}],"finish_reason":"stop"}]",
              "gen_ai.response.finish_reasons": [
                "stop",
              ],
              "gen_ai.response.id": "test-response-id",
              "gen_ai.usage.input_tokens": 10,
              "gen_ai.usage.output_tokens": 20,
            },
          },
        ]
      `);
    });

    it('does not use ai.* attribute prefix anywhere', () => {
      integration.onStart!(makeOnStartEvent());
      integration.onStepStart!(makeStepStartEvent());
      integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());
      integration.onLanguageModelCallEnd!(makeLanguageModelCallEndEvent());
      integration.onToolExecutionStart!(makeToolCallStartEvent());
      integration.onToolExecutionEnd!(makeToolCallFinishEvent(true));
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
