import { AsyncLocalStorage } from 'node:async_hooks';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import { tool } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { generateText } from '../generate-text';
import { isStepCount } from '../generate-text/stop-condition';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { createTelemetryDispatcher } from './create-telemetry-dispatcher';
import {
  AI_SDK_TELEMETRY_TRACING_CHANNEL,
  type TelemetryTracingChannelMessage,
} from './tracing-channel';
import { isNodeRuntime } from '../util/is-node-runtime';

async function collectTracingChannelStartMessages(
  run: () => Promise<void>,
): Promise<TelemetryTracingChannelMessage[]> {
  const messages: TelemetryTracingChannelMessage[] = [];
  const subscriber = (message: unknown) => {
    const telemetry = message as TelemetryTracingChannelMessage;
    messages.push({
      type: telemetry.type,
      event:
        telemetry.event != null && typeof telemetry.event === 'object'
          ? { ...telemetry.event }
          : telemetry.event,
    });
  };

  const tracingChannel = diagnosticsChannel.tracingChannel(
    AI_SDK_TELEMETRY_TRACING_CHANNEL,
  );
  const subscribers = {
    start: subscriber,
    end() {},
    asyncStart() {},
    asyncEnd() {},
    error() {},
  };

  tracingChannel.subscribe(subscribers);

  try {
    await run();
  } finally {
    tracingChannel.unsubscribe(subscribers);
  }

  return messages;
}

async function collectTracingChannelEventSequence(
  run: () => Promise<void>,
): Promise<string[]> {
  const events: string[] = [];
  const store = new AsyncLocalStorage<TelemetryTracingChannelMessage>();

  const tracingChannel = diagnosticsChannel.tracingChannel(
    AI_SDK_TELEMETRY_TRACING_CHANNEL,
  );
  const subscribers = {
    start() {},
    end() {},
    asyncStart() {},
    asyncEnd(message: unknown) {
      events.push(
        `asyncEnd ${(message as TelemetryTracingChannelMessage).type}`,
      );
    },
    error() {},
  };

  tracingChannel.start.bindStore(store, message => {
    events.push(
      `bindStart ${(message as TelemetryTracingChannelMessage).type}`,
    );
    return message as TelemetryTracingChannelMessage;
  });
  tracingChannel.subscribe(subscribers);

  try {
    await run();
  } finally {
    tracingChannel.unsubscribe(subscribers);
    tracingChannel.start.unbindStore(store);
  }

  return events;
}

describe.runIf(isNodeRuntime())('telemetry tracing channel publisher', () => {
  beforeEach(() => {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
  });

  it('traces lifecycle events even when no integrations are configured', async () => {
    const event = { callId: 'tracing-channel-without-integrations' };

    const messages = await collectTracingChannelStartMessages(async () => {
      const telemetry = createTelemetryDispatcher({});

      await telemetry.onStart!(event as any);
    });

    expect(messages).toMatchInlineSnapshot(`
      [
        {
          "event": {
            "callId": "tracing-channel-without-integrations",
            "functionId": undefined,
            "recordInputs": undefined,
            "recordOutputs": undefined,
          },
          "type": "onStart",
        },
      ]
    `);
  });

  it('does not trace lifecycle events when telemetry is disabled', async () => {
    const event = { callId: 'tracing-channel-disabled' };

    const messages = await collectTracingChannelStartMessages(async () => {
      const telemetry = createTelemetryDispatcher({
        telemetry: { isEnabled: false },
      });

      await telemetry.onStart?.(event as any);
    });

    expect(
      messages.filter(message => {
        return (message.event as { callId?: string }).callId === event.callId;
      }),
    ).toEqual([]);
  });

  it('applies telemetry settings per call', async () => {
    const enabledEvent = { callId: 'tracing-channel-enabled-call' };
    const disabledEvent = { callId: 'tracing-channel-disabled-call' };

    const messages = await collectTracingChannelStartMessages(async () => {
      const enabledTelemetry = createTelemetryDispatcher({
        telemetry: { functionId: 'enabled-function' },
      });
      const disabledTelemetry = createTelemetryDispatcher({
        telemetry: { isEnabled: false, functionId: 'disabled-function' },
      });

      await disabledTelemetry.onStart?.(disabledEvent as any);
      await enabledTelemetry.onStart!(enabledEvent as any);
    });

    expect(
      messages.filter(message => {
        const callId = (message.event as { callId?: string }).callId;
        return (
          callId === enabledEvent.callId || callId === disabledEvent.callId
        );
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "event": {
            "callId": "tracing-channel-enabled-call",
            "functionId": "enabled-function",
            "recordInputs": undefined,
            "recordOutputs": undefined,
          },
          "type": "onStart",
        },
      ]
    `);
  });

  it('traces rerank end events', async () => {
    const event = { callId: 'tracing-channel-rerank-end' };

    const messages = await collectTracingChannelStartMessages(async () => {
      const telemetry = createTelemetryDispatcher({});

      await telemetry.onRerankEnd!(event as any);
    });

    expect(messages).toMatchInlineSnapshot(`
      [
        {
          "event": {
            "callId": "tracing-channel-rerank-end",
            "functionId": undefined,
            "recordInputs": undefined,
            "recordOutputs": undefined,
          },
          "type": "onRerankEnd",
        },
      ]
    `);
  });

  it('traces execution wrappers with call context', async () => {
    const messages = await collectTracingChannelStartMessages(async () => {
      const telemetry = createTelemetryDispatcher({
        telemetry: { functionId: 'execution-function' },
      });

      await telemetry.executeLanguageModelCall!({
        callId: 'language-model-call',
        event: {
          provider: 'mock-provider',
          modelId: 'mock-model',
        } as any,
        execute: async () => 'result',
      });
    });

    expect(messages).toMatchInlineSnapshot(`
      [
        {
          "event": {
            "callId": "language-model-call",
            "functionId": "execution-function",
            "modelId": "mock-model",
            "provider": "mock-provider",
            "recordInputs": undefined,
            "recordOutputs": undefined,
          },
          "type": "executeLanguageModelCall",
        },
      ]
    `);
  });

  it('propagates language model execution context through async work', async () => {
    const store = new AsyncLocalStorage<TelemetryTracingChannelMessage>();
    const tracingChannel = diagnosticsChannel.tracingChannel(
      AI_SDK_TELEMETRY_TRACING_CHANNEL,
    );
    const subscribers = {
      start() {},
      end() {},
      asyncStart() {},
      asyncEnd() {},
      error() {},
    };
    let capturedContext: TelemetryTracingChannelMessage | undefined;

    tracingChannel.start.bindStore(
      store,
      message => message as TelemetryTracingChannelMessage,
    );
    tracingChannel.subscribe(subscribers);

    try {
      const telemetry = createTelemetryDispatcher({
        telemetry: { functionId: 'execution-function' },
      });

      await telemetry.executeLanguageModelCall!({
        callId: 'language-model-call',
        event: {
          provider: 'mock-provider',
          modelId: 'mock-model',
        } as any,
        execute: async () => {
          await Promise.resolve();
          capturedContext = store.getStore();
          return 'result';
        },
      });
    } finally {
      tracingChannel.unsubscribe(subscribers);
      tracingChannel.start.unbindStore(store);
    }

    expect(capturedContext).toMatchInlineSnapshot(`
      {
        "event": {
          "callId": "language-model-call",
          "functionId": "execution-function",
          "modelId": "mock-model",
          "provider": "mock-provider",
          "recordInputs": undefined,
          "recordOutputs": undefined,
        },
        "result": "result",
        "type": "executeLanguageModelCall",
      }
    `);
  });

  it('propagates tool execution context through async work', async () => {
    const store = new AsyncLocalStorage<TelemetryTracingChannelMessage>();
    const tracingChannel = diagnosticsChannel.tracingChannel(
      AI_SDK_TELEMETRY_TRACING_CHANNEL,
    );
    const subscribers = {
      start() {},
      end() {},
      asyncStart() {},
      asyncEnd() {},
      error() {},
    };
    let capturedContext: TelemetryTracingChannelMessage | undefined;

    tracingChannel.start.bindStore(
      store,
      message => message as TelemetryTracingChannelMessage,
    );
    tracingChannel.subscribe(subscribers);

    try {
      const telemetry = createTelemetryDispatcher({
        telemetry: { functionId: 'execution-function' },
      });

      await telemetry.executeTool!({
        callId: 'tool-call',
        toolCallId: 'tool-call-id',
        event: {
          toolCall: {
            type: 'tool-call',
            toolCallId: 'tool-call-id',
            toolName: 'mockTool',
            input: {},
            dynamic: false,
          },
          messages: [],
          toolContext: undefined,
        } as any,
        execute: async () => {
          await Promise.resolve();
          capturedContext = store.getStore();
          return 'result';
        },
      });
    } finally {
      tracingChannel.unsubscribe(subscribers);
      tracingChannel.start.unbindStore(store);
    }

    expect(capturedContext).toMatchInlineSnapshot(`
      {
        "event": {
          "callId": "tool-call",
          "functionId": "execution-function",
          "messages": [],
          "recordInputs": undefined,
          "recordOutputs": undefined,
          "toolCall": {
            "dynamic": false,
            "input": {},
            "toolCallId": "tool-call-id",
            "toolName": "mockTool",
            "type": "tool-call",
          },
          "toolContext": undefined,
        },
        "result": "result",
        "type": "executeTool",
      }
    `);
  });

  it('traces the current generateText lifecycle sequence with a tool call', async () => {
    let responseCount = 0;

    const sequence = await collectTracingChannelEventSequence(async () => {
      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            switch (responseCount++) {
              case 0:
                return {
                  finishReason: { unified: 'tool-calls', raw: undefined },
                  usage: {
                    inputTokens: {
                      total: 3,
                      noCache: 3,
                      cacheRead: undefined,
                      cacheWrite: undefined,
                    },
                    outputTokens: {
                      total: 10,
                      text: 10,
                      reasoning: undefined,
                    },
                  },
                  warnings: [],
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'weather-tool-call',
                      toolName: 'weather',
                      input: JSON.stringify({ city: 'San Francisco' }),
                    },
                  ],
                };

              case 1:
                return {
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: {
                    inputTokens: {
                      total: 5,
                      noCache: 5,
                      cacheRead: undefined,
                      cacheWrite: undefined,
                    },
                    outputTokens: {
                      total: 7,
                      text: 7,
                      reasoning: undefined,
                    },
                  },
                  warnings: [],
                  content: [{ type: 'text', text: 'It is sunny.' }],
                };

              default:
                throw new Error(`Unexpected response count: ${responseCount}`);
            }
          },
        }),
        prompt: 'What is the weather in San Francisco?',
        stopWhen: isStepCount(3),
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async ({ city }) => `Weather in ${city}: sunny`,
          }),
        },
        telemetry: {
          functionId: 'tracing-channel-generate-text-test',
        },
      });
    });

    expect(sequence).toMatchInlineSnapshot(`
      [
        "bindStart onStart",
        "asyncEnd onStart",
        "bindStart onStepStart",
        "asyncEnd onStepStart",
        "bindStart onLanguageModelCallStart",
        "asyncEnd onLanguageModelCallStart",
        "bindStart executeLanguageModelCall",
        "asyncEnd executeLanguageModelCall",
        "bindStart onLanguageModelCallEnd",
        "asyncEnd onLanguageModelCallEnd",
        "bindStart onToolExecutionStart",
        "asyncEnd onToolExecutionStart",
        "bindStart executeTool",
        "asyncEnd executeTool",
        "bindStart onToolExecutionEnd",
        "asyncEnd onToolExecutionEnd",
        "bindStart onStepFinish",
        "asyncEnd onStepFinish",
        "bindStart onStepStart",
        "asyncEnd onStepStart",
        "bindStart onLanguageModelCallStart",
        "asyncEnd onLanguageModelCallStart",
        "bindStart executeLanguageModelCall",
        "asyncEnd executeLanguageModelCall",
        "bindStart onLanguageModelCallEnd",
        "asyncEnd onLanguageModelCallEnd",
        "bindStart onStepFinish",
        "asyncEnd onStepFinish",
        "bindStart onEnd",
        "asyncEnd onEnd",
      ]
    `);
  });
});
