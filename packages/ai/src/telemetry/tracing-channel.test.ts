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

  it('does not trace callback-only lifecycle events', async () => {
    const event = { callId: 'tracing-channel-callback-only' };

    const messages = await collectTracingChannelStartMessages(async () => {
      const telemetry = createTelemetryDispatcher({});

      await telemetry.onStart!(event as any);
    });

    expect(messages).toEqual([]);
  });

  it('does not trace semantic spans when telemetry is disabled', async () => {
    const event = { callId: 'tracing-channel-disabled' };

    const messages = await collectTracingChannelStartMessages(async () => {
      const telemetry = createTelemetryDispatcher({
        telemetry: { isEnabled: false },
      });

      await telemetry.traceTelemetrySpan?.({
        type: 'generateText',
        event,
        execute: async () => undefined,
      });
    });

    expect(messages).toEqual([]);
  });

  it('traces semantic spans with telemetry settings', async () => {
    const event = { callId: 'tracing-channel-generate-text' };

    const messages = await collectTracingChannelStartMessages(async () => {
      const telemetry = createTelemetryDispatcher({
        telemetry: { functionId: 'enabled-function' },
      });

      await telemetry.traceTelemetrySpan!({
        type: 'generateText',
        event,
        execute: async () => undefined,
      });
    });

    expect(messages).toMatchInlineSnapshot(`
      [
        {
          "event": {
            "callId": "tracing-channel-generate-text",
            "functionId": "enabled-function",
            "recordInputs": undefined,
            "recordOutputs": undefined,
          },
          "type": "generateText",
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

      await telemetry.traceTelemetrySpan!({
        type: 'languageModelCall',
        event: {
          callId: 'language-model-call',
          provider: 'mock-provider',
          modelId: 'mock-model',
        },
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
        "type": "languageModelCall",
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

      await telemetry.traceTelemetrySpan!({
        type: 'executeTool',
        event: {
          callId: 'tool-call',
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
        "bindStart generateText",
        "bindStart step",
        "bindStart languageModelCall",
        "asyncEnd languageModelCall",
        "bindStart executeTool",
        "asyncEnd executeTool",
        "asyncEnd step",
        "bindStart step",
        "bindStart languageModelCall",
        "asyncEnd languageModelCall",
        "asyncEnd step",
        "asyncEnd generateText",
      ]
    `);
  });
});
