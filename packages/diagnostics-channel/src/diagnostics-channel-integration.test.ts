import * as diagnostics_channel from 'node:diagnostics_channel';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TelemetryIntegration } from 'ai';
import {
  createDiagnosticsChannelIntegration,
  AI_SDK_CHANNEL_NAMES,
} from './diagnostics-channel-integration';

const callId = 'call-1';
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

  function subscribe(channelName: string): Array<unknown> {
    const received: Array<unknown> = [];
    const handler = (message: unknown) => {
      received.push(message);
    };
    diagnostics_channel.subscribe(channelName, handler);
    subscribers.push({ name: channelName, handler });
    return received;
  }

  beforeEach(() => {
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
    integration.onStart!(makeOnStartEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "abortSignal": undefined,
          "activeTools": undefined,
          "callId": "call-1",
          "context": undefined,
          "frequencyPenalty": undefined,
          "functionId": undefined,
          "headers": undefined,
          "include": undefined,
          "isEnabled": true,
          "maxOutputTokens": 100,
          "maxRetries": 2,
          "messages": undefined,
          "metadata": undefined,
          "modelId": "test-model",
          "operationId": "ai.generateText",
          "output": undefined,
          "presencePenalty": undefined,
          "prompt": "Hello",
          "provider": "test-provider",
          "providerOptions": undefined,
          "recordInputs": undefined,
          "recordOutputs": undefined,
          "seed": undefined,
          "stopSequences": undefined,
          "stopWhen": undefined,
          "system": undefined,
          "temperature": 0.7,
          "timeout": undefined,
          "toolChoice": undefined,
          "tools": undefined,
          "topK": undefined,
          "topP": undefined,
        },
      ]
    `);
  });

  it('publishes onStepStart events to the step:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.stepStart);
    integration.onStepStart!(makeStepStartEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "abortSignal": undefined,
          "activeTools": undefined,
          "callId": "call-1",
          "context": undefined,
          "functionId": undefined,
          "headers": undefined,
          "include": undefined,
          "messages": [],
          "metadata": undefined,
          "modelId": "test-model",
          "output": undefined,
          "provider": "test-provider",
          "providerOptions": undefined,
          "stepNumber": 0,
          "steps": [],
          "stopWhen": undefined,
          "system": undefined,
          "timeout": undefined,
          "toolChoice": undefined,
          "tools": undefined,
        },
      ]
    `);
  });

  it('publishes onToolCallStart events to the tool-call:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.toolCallStart);
    integration.onToolCallStart!(makeToolCallStartEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "abortSignal": undefined,
          "callId": "call-1",
          "context": undefined,
          "functionId": undefined,
          "messages": [],
          "metadata": undefined,
          "modelId": "test-model",
          "provider": "test-provider",
          "stepNumber": 0,
          "toolCall": {
            "input": {
              "query": "test",
            },
            "toolCallId": "tool-call-1",
            "toolName": "myTool",
            "type": "tool-call",
          },
        },
      ]
    `);
  });

  it('publishes onToolCallFinish events to the tool-call:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.toolCallFinish);
    integration.onToolCallFinish!(makeToolCallFinishEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "abortSignal": undefined,
          "callId": "call-1",
          "context": undefined,
          "durationMs": 42,
          "functionId": undefined,
          "messages": [],
          "metadata": undefined,
          "modelId": "test-model",
          "output": {
            "result": "ok",
          },
          "provider": "test-provider",
          "stepNumber": 0,
          "success": true,
          "toolCall": {
            "input": {
              "query": "test",
            },
            "toolCallId": "tool-call-1",
            "toolName": "myTool",
            "type": "tool-call",
          },
        },
      ]
    `);
  });

  it('publishes onChunk events to the chunk channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.chunk);
    integration.onChunk!(makeChunkEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "chunk": {
            "id": "text-1",
            "text": "Hello",
            "type": "text-delta",
          },
        },
      ]
    `);
  });

  it('publishes onStepFinish events to the step:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.stepFinish);
    integration.onStepFinish!(makeStepFinishEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "callId": "call-1",
          "content": [
            {
              "text": "Hello world",
              "type": "text",
            },
          ],
          "context": undefined,
          "dynamicToolCalls": [],
          "dynamicToolResults": [],
          "files": [],
          "finishReason": "stop",
          "functionId": undefined,
          "metadata": undefined,
          "model": {
            "modelId": "test-model",
            "provider": "test-provider",
          },
          "providerMetadata": undefined,
          "rawFinishReason": "stop",
          "reasoning": [],
          "reasoningText": undefined,
          "request": {
            "body": undefined,
          },
          "response": {
            "id": "resp-1",
            "messages": [],
            "modelId": "test-model",
            "timestamp": 2025-01-01T00:00:00.000Z,
          },
          "sources": [],
          "staticToolCalls": [],
          "staticToolResults": [],
          "stepNumber": 0,
          "text": "Hello world",
          "toolCalls": [],
          "toolResults": [],
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokenDetails": {
              "cacheReadTokens": undefined,
              "cacheWriteTokens": undefined,
              "noCacheTokens": undefined,
            },
            "inputTokens": 10,
            "outputTokenDetails": {
              "reasoningTokens": undefined,
              "textTokens": undefined,
            },
            "outputTokens": 20,
            "reasoningTokens": undefined,
            "totalTokens": 30,
          },
          "warnings": undefined,
        },
      ]
    `);
  });

  it('publishes onEmbedStart events to the embed:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.embedStart);
    integration.onEmbedStart!(makeEmbedStartEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "callId": "call-1",
          "embedCallId": "embed-call-1",
          "functionId": undefined,
          "isEnabled": true,
          "metadata": undefined,
          "modelId": "test-model",
          "operationId": "ai.embed.doEmbed",
          "provider": "test-provider",
          "recordInputs": undefined,
          "recordOutputs": undefined,
          "values": [
            "test input",
          ],
        },
      ]
    `);
  });

  it('publishes onEmbedFinish events to the embed:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.embedFinish);
    integration.onEmbedFinish!(makeEmbedFinishEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "callId": "call-1",
          "embedCallId": "embed-call-1",
          "embeddings": [
            [
              0.1,
              0.2,
              0.3,
            ],
          ],
          "modelId": "test-model",
          "operationId": "ai.embed.doEmbed",
          "provider": "test-provider",
          "usage": {
            "tokens": 5,
          },
          "values": [
            "test input",
          ],
        },
      ]
    `);
  });

  it('publishes onRerankStart events to the rerank:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.rerankStart);
    integration.onRerankStart!(makeRerankStartEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "callId": "call-1",
          "documents": [
            "doc1",
            "doc2",
          ],
          "documentsType": "text",
          "functionId": undefined,
          "isEnabled": true,
          "metadata": undefined,
          "modelId": "test-model",
          "operationId": "ai.rerank.doRerank",
          "provider": "test-provider",
          "query": "test query",
          "recordInputs": undefined,
          "recordOutputs": undefined,
          "topN": undefined,
        },
      ]
    `);
  });

  it('publishes onRerankFinish events to the rerank:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.rerankFinish);
    integration.onRerankFinish!(makeRerankFinishEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "callId": "call-1",
          "documentsType": "text",
          "modelId": "test-model",
          "operationId": "ai.rerank.doRerank",
          "provider": "test-provider",
          "ranking": [
            {
              "index": 0,
              "relevanceScore": 0.9,
            },
          ],
        },
      ]
    `);
  });

  it('publishes onObjectStepStart events to the object-step:start channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.objectStepStart);
    integration.onObjectStepStart!(makeObjectStepStartEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "abortSignal": undefined,
          "callId": "call-1",
          "functionId": undefined,
          "headers": undefined,
          "metadata": undefined,
          "modelId": "test-model",
          "provider": "test-provider",
          "providerOptions": undefined,
          "stepNumber": 0,
        },
      ]
    `);
  });

  it('publishes onObjectStepFinish events to the object-step:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.objectStepFinish);
    integration.onObjectStepFinish!(makeObjectStepFinishEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "callId": "call-1",
          "finishReason": "stop",
          "functionId": undefined,
          "metadata": undefined,
          "modelId": "test-model",
          "msToFirstChunk": undefined,
          "objectText": "{"key":"value"}",
          "provider": "test-provider",
          "providerMetadata": undefined,
          "reasoning": undefined,
          "request": {
            "body": undefined,
          },
          "response": {
            "id": "resp-1",
            "modelId": "test-model",
            "timestamp": 2025-01-01T00:00:00.000Z,
          },
          "stepNumber": 0,
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokenDetails": {
              "cacheReadTokens": undefined,
              "cacheWriteTokens": undefined,
              "noCacheTokens": undefined,
            },
            "inputTokens": 10,
            "outputTokenDetails": {
              "reasoningTokens": undefined,
              "textTokens": undefined,
            },
            "outputTokens": 20,
            "reasoningTokens": undefined,
            "totalTokens": 30,
          },
          "warnings": undefined,
        },
      ]
    `);
  });

  it('publishes onFinish events to the operation:finish channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.operationFinish);
    integration.onFinish!(makeFinishEvent());
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "callId": "call-1",
          "content": [
            {
              "text": "Hello world",
              "type": "text",
            },
          ],
          "context": undefined,
          "dynamicToolCalls": [],
          "dynamicToolResults": [],
          "files": [],
          "finishReason": "stop",
          "functionId": undefined,
          "metadata": undefined,
          "model": {
            "modelId": "test-model",
            "provider": "test-provider",
          },
          "providerMetadata": undefined,
          "rawFinishReason": "stop",
          "reasoning": [],
          "reasoningText": undefined,
          "request": {
            "body": undefined,
          },
          "response": {
            "id": "resp-1",
            "messages": [],
            "modelId": "test-model",
            "timestamp": 2025-01-01T00:00:00.000Z,
          },
          "sources": [],
          "staticToolCalls": [],
          "staticToolResults": [],
          "stepNumber": 0,
          "steps": [],
          "text": "Hello world",
          "toolCalls": [],
          "toolResults": [],
          "totalUsage": {
            "cachedInputTokens": undefined,
            "inputTokenDetails": {
              "cacheReadTokens": undefined,
              "cacheWriteTokens": undefined,
              "noCacheTokens": undefined,
            },
            "inputTokens": 10,
            "outputTokenDetails": {
              "reasoningTokens": undefined,
              "textTokens": undefined,
            },
            "outputTokens": 20,
            "reasoningTokens": undefined,
            "totalTokens": 30,
          },
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokenDetails": {
              "cacheReadTokens": undefined,
              "cacheWriteTokens": undefined,
              "noCacheTokens": undefined,
            },
            "inputTokens": 10,
            "outputTokenDetails": {
              "reasoningTokens": undefined,
              "textTokens": undefined,
            },
            "outputTokens": 20,
            "reasoningTokens": undefined,
            "totalTokens": 30,
          },
          "warnings": undefined,
        },
      ]
    `);
  });

  it('publishes onError events to the error channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.error);
    integration.onError!({ callId, error: new Error('test error') });
    expect(received).toMatchInlineSnapshot(`
      [
        {
          "callId": "call-1",
          "error": [Error: test error],
        },
      ]
    `);
  });

  it('does not publish when there are no subscribers', () => {
    const channel = diagnostics_channel.channel(
      AI_SDK_CHANNEL_NAMES.operationStart,
    );
    expect(channel.hasSubscribers).toMatchInlineSnapshot(`false`);
    integration.onStart!(makeOnStartEvent());
  });

  it('publishes multiple events to the same channel', () => {
    const received = subscribe(AI_SDK_CHANNEL_NAMES.operationStart);
    integration.onStart!(makeOnStartEvent({ callId: 'call-1' }));
    integration.onStart!(makeOnStartEvent({ callId: 'call-2' }));
    expect(received.length).toMatchInlineSnapshot(`2`);
  });

  it('delivers events to multiple subscribers on the same channel', () => {
    const received1 = subscribe(AI_SDK_CHANNEL_NAMES.operationStart);
    const received2 = subscribe(AI_SDK_CHANNEL_NAMES.operationStart);
    integration.onStart!(makeOnStartEvent());
    expect(received1).toMatchInlineSnapshot(`
      [
        {
          "abortSignal": undefined,
          "activeTools": undefined,
          "callId": "call-1",
          "context": undefined,
          "frequencyPenalty": undefined,
          "functionId": undefined,
          "headers": undefined,
          "include": undefined,
          "isEnabled": true,
          "maxOutputTokens": 100,
          "maxRetries": 2,
          "messages": undefined,
          "metadata": undefined,
          "modelId": "test-model",
          "operationId": "ai.generateText",
          "output": undefined,
          "presencePenalty": undefined,
          "prompt": "Hello",
          "provider": "test-provider",
          "providerOptions": undefined,
          "recordInputs": undefined,
          "recordOutputs": undefined,
          "seed": undefined,
          "stopSequences": undefined,
          "stopWhen": undefined,
          "system": undefined,
          "temperature": 0.7,
          "timeout": undefined,
          "toolChoice": undefined,
          "tools": undefined,
          "topK": undefined,
          "topP": undefined,
        },
      ]
    `);
    expect(received2).toMatchInlineSnapshot(`
      [
        {
          "abortSignal": undefined,
          "activeTools": undefined,
          "callId": "call-1",
          "context": undefined,
          "frequencyPenalty": undefined,
          "functionId": undefined,
          "headers": undefined,
          "include": undefined,
          "isEnabled": true,
          "maxOutputTokens": 100,
          "maxRetries": 2,
          "messages": undefined,
          "metadata": undefined,
          "modelId": "test-model",
          "operationId": "ai.generateText",
          "output": undefined,
          "presencePenalty": undefined,
          "prompt": "Hello",
          "provider": "test-provider",
          "providerOptions": undefined,
          "recordInputs": undefined,
          "recordOutputs": undefined,
          "seed": undefined,
          "stopSequences": undefined,
          "stopWhen": undefined,
          "system": undefined,
          "temperature": 0.7,
          "timeout": undefined,
          "toolChoice": undefined,
          "tools": undefined,
          "topK": undefined,
          "topP": undefined,
        },
      ]
    `);
  });
});
