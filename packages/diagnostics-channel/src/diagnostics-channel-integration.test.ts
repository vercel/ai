import * as diagnostics_channel from 'node:diagnostics_channel';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TelemetryIntegration } from 'ai';
import {
  createDiagnosticsChannelIntegration,
  AI_SDK_CHANNEL_NAMES,
} from './diagnostics-channel-integration';

let callId: string;

const model = { provider: 'test-provider', modelId: 'test-model' };

function telemetryFields() {
  return {
    isEnabled: true as const,
    recordInputs: undefined,
    recordOutputs: undefined,
    functionId: undefined,
    metadata: undefined,
  };
}

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
    context: undefined,
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
    context: undefined,
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
    context: undefined,
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
    context: undefined,
    ...overrides,
  } as Parameters<NonNullable<TelemetryIntegration['onToolCallStart']>>[0];
}

function makeToolCallFinishEvent(overrides?: Record<string, unknown>) {
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
    durationMs: 42,
    functionId: undefined,
    metadata: undefined,
    context: undefined,
    success: true as const,
    output: { result: 'ok' },
    ...overrides,
  } as Parameters<NonNullable<TelemetryIntegration['onToolCallFinish']>>[0];
}

function makeChunkEvent() {
  return {
    chunk: {
      type: 'text-delta' as const,
      id: 'text-1',
      text: 'Hello',
    },
  } as Parameters<NonNullable<TelemetryIntegration['onChunk']>>[0];
}

function makeEmbedStartEvent() {
  return {
    callId,
    embedCallId: 'embed-call-1',
    operationId: 'ai.embed.doEmbed',
    provider: model.provider,
    modelId: model.modelId,
    values: ['test input'],
    ...telemetryFields(),
  } as Parameters<NonNullable<TelemetryIntegration['onEmbedStart']>>[0];
}

function makeEmbedFinishEvent() {
  return {
    callId,
    embedCallId: 'embed-call-1',
    operationId: 'ai.embed.doEmbed',
    provider: model.provider,
    modelId: model.modelId,
    values: ['test input'],
    embeddings: [[0.1, 0.2, 0.3]],
    usage: { tokens: 5 },
  } as Parameters<NonNullable<TelemetryIntegration['onEmbedFinish']>>[0];
}

function makeRerankStartEvent() {
  return {
    callId,
    operationId: 'ai.rerank.doRerank',
    provider: model.provider,
    modelId: model.modelId,
    documents: ['doc1', 'doc2'],
    documentsType: 'text',
    query: 'test query',
    topN: undefined,
    ...telemetryFields(),
  } as Parameters<NonNullable<TelemetryIntegration['onRerankStart']>>[0];
}

function makeRerankFinishEvent() {
  return {
    callId,
    operationId: 'ai.rerank.doRerank',
    provider: model.provider,
    modelId: model.modelId,
    documentsType: 'text',
    ranking: [{ index: 0, relevanceScore: 0.9 }],
  } as Parameters<NonNullable<TelemetryIntegration['onRerankFinish']>>[0];
}

function makeObjectStepStartEvent() {
  return {
    callId,
    stepNumber: 0 as const,
    provider: model.provider,
    modelId: model.modelId,
    providerOptions: undefined,
    headers: undefined,
    abortSignal: undefined,
    functionId: undefined,
    metadata: undefined,
  } as Parameters<NonNullable<TelemetryIntegration['onObjectStepStart']>>[0];
}

function makeObjectStepFinishEvent() {
  return {
    callId,
    stepNumber: 0 as const,
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
    objectText: '{"key":"value"}',
    reasoning: undefined,
    warnings: undefined,
    request: { body: undefined },
    response: {
      id: 'resp-1',
      modelId: 'test-model',
      timestamp: new Date('2025-01-01T00:00:00Z'),
    },
    providerMetadata: undefined,
    functionId: undefined,
    metadata: undefined,
    msToFirstChunk: undefined,
  } as Parameters<NonNullable<TelemetryIntegration['onObjectStepFinish']>>[0];
}

describe('createDiagnosticsChannelIntegration', () => {
  let integration: TelemetryIntegration;
  const subscribers: Array<{
    name: string;
    handler: (message: unknown, name: string | symbol) => void;
  }> = [];

  function subscribe(
    channelName: string,
  ): Array<{ message: unknown; name: string | symbol }> {
    const received: Array<{ message: unknown; name: string | symbol }> = [];
    const handler = (message: unknown, name: string | symbol) => {
      received.push({ message, name });
    };
    diagnostics_channel.subscribe(channelName, handler);
    subscribers.push({ name: channelName, handler });
    return received;
  }

  beforeEach(() => {
    callId = `call-${Date.now()}`;
    integration = createDiagnosticsChannelIntegration();
  });

  afterEach(() => {
    for (const { name, handler } of subscribers) {
      diagnostics_channel.unsubscribe(name, handler);
    }
    subscribers.length = 0;
  });

  it('publishes onStart events to the operation:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.operationStart);
    const event = makeOnStartEvent();

    integration.onStart!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
    expect(received[0].name).toBe(AI_SDK_CHANNEL_NAMES.operationStart);
  });

  it('publishes onStepStart events to the step:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.stepStart);
    const event = makeStepStartEvent();

    integration.onStepStart!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onToolCallStart events to the tool-call:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.toolCallStart);
    const event = makeToolCallStartEvent();

    integration.onToolCallStart!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onToolCallFinish events to the tool-call:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.toolCallFinish);
    const event = makeToolCallFinishEvent();

    integration.onToolCallFinish!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onChunk events to the chunk channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.chunk);
    const event = makeChunkEvent();

    integration.onChunk!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onStepFinish events to the step:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.stepFinish);
    const event = makeStepFinishEvent();

    integration.onStepFinish!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onEmbedStart events to the embed:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.embedStart);
    const event = makeEmbedStartEvent();

    integration.onEmbedStart!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onEmbedFinish events to the embed:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.embedFinish);
    const event = makeEmbedFinishEvent();

    integration.onEmbedFinish!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onRerankStart events to the rerank:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.rerankStart);
    const event = makeRerankStartEvent();

    integration.onRerankStart!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onRerankFinish events to the rerank:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.rerankFinish);
    const event = makeRerankFinishEvent();

    integration.onRerankFinish!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onObjectStepStart events to the object-step:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.objectStepStart);
    const event = makeObjectStepStartEvent();

    integration.onObjectStepStart!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onObjectStepFinish events to the object-step:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.objectStepFinish);
    const event = makeObjectStepFinishEvent();

    integration.onObjectStepFinish!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onFinish events to the operation:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.operationFinish);
    const event = makeFinishEvent();

    integration.onFinish!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('publishes onError events to the error channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.error);
    const event = { callId, error: new Error('test error') };

    integration.onError!(event);

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe(event);
  });

  it('does not publish when there are no subscribers', () => {
    const channel = diagnostics_channel.channel(
      AI_SDK_CHANNEL_NAMES.operationStart,
    );
    expect(channel.hasSubscribers).toBe(false);

    const event = makeOnStartEvent();
    integration.onStart!(event);
  });

  it('publishes multiple events to the same channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.operationStart);

    const event1 = makeOnStartEvent({ callId: 'call-1' });
    const event2 = makeOnStartEvent({ callId: 'call-2' });

    integration.onStart!(event1);
    integration.onStart!(event2);

    expect(received).toHaveLength(2);
    expect(received[0].message).toBe(event1);
    expect(received[1].message).toBe(event2);
  });

  it('delivers events to multiple subscribers on the same channel', () => {
    const received1 = subscribe(AI_SDK_CHANNEL_NAMES.operationStart);
    const received2 = subscribe(AI_SDK_CHANNEL_NAMES.operationStart);

    const event = makeOnStartEvent();
    integration.onStart!(event);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect(received1[0].message).toBe(event);
    expect(received2[0].message).toBe(event);
  });
});
