import assert from 'node:assert/strict';
import { tracingChannel } from 'node:diagnostics_channel';
import { generateText, registerTelemetry, streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

type Context = Record<string, unknown>;
type ChannelMessage = {
  type: string;
  event: {
    operationId?: string;
    runtimeContext?: Context;
    toolsContext?: Record<string, Context>;
    toolContext?: Context;
  };
};

const channelStartEvents = new Map<string, ChannelMessage['event']>();
const channelToolContexts: Context[] = [];
const integrationStartEvents: Array<ChannelMessage['event']> = [];
const integrationToolContexts: Context[] = [];

const channel = tracingChannel('ai:telemetry');
const subscribers = {
  start(message: unknown) {
    const { type, event } = message as ChannelMessage;
    if (type === 'generateText' || type === 'streamText') {
      channelStartEvents.set(type, event);
    } else if (type === 'executeTool') {
      channelToolContexts.push(event.toolContext ?? {});
    }
  },
  end() {},
  asyncStart() {},
  asyncEnd() {},
  error() {},
};

function createTools() {
  return {
    lookup: tool({
      inputSchema: z.object({ q: z.string() }),
      contextSchema: z.object({
        tenantId: z.string(),
        dbPassword: z.string(),
      }),
      execute: async () => 'ok',
    }),
  };
}

const contextOptions = {
  runtimeContext: { requestId: 'req_123', apiToken: 'secret' },
  toolsContext: {
    lookup: { tenantId: 'tenant_1', dbPassword: 'hunter2' },
  },
  telemetry: {
    isEnabled: true,
    includeRuntimeContext: { requestId: true },
    includeToolsContext: { lookup: { tenantId: true } },
  },
} as const;

function createGenerateModel() {
  return new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'generate-call-1',
            toolName: 'lookup',
            input: JSON.stringify({ q: 'x' }),
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
        warnings: [],
      },
      {
        content: [{ type: 'text', text: 'Done' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      },
    ],
  });
}

function createStreamModel() {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'tool-input-start',
            id: 'stream-call-1',
            toolName: 'lookup',
          },
          {
            type: 'tool-input-delta',
            id: 'stream-call-1',
            delta: JSON.stringify({ q: 'x' }),
          },
          { type: 'tool-input-end', id: 'stream-call-1' },
          {
            type: 'tool-call',
            toolCallId: 'stream-call-1',
            toolName: 'lookup',
            input: JSON.stringify({ q: 'x' }),
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage,
          },
        ]),
      },
      {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Done' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      },
    ],
  });
}

function assertAllowedContextIsPreserved(
  event: ChannelMessage['event'],
  label: string,
) {
  assert.deepEqual(
    event.runtimeContext,
    { requestId: 'req_123' },
    `${label} should preserve only the opted-in runtime context`,
  );
  assert.deepEqual(
    event.toolsContext,
    { lookup: { tenantId: 'tenant_1' } },
    `${label} should preserve only the opted-in tools context`,
  );
}

async function main() {
  channel.subscribe(subscribers);
  registerTelemetry({
    onStart(event) {
      integrationStartEvents.push(event);
    },
    onToolExecutionStart(event) {
      integrationToolContexts.push(event.toolContext as Context);
    },
  });

  try {
    await generateText({
      model: createGenerateModel(),
      prompt: 'Hello',
      tools: createTools(),
      stopWhen: ({ steps }) => steps.length >= 2,
      ...contextOptions,
    });

    const streamResult = streamText({
      model: createStreamModel(),
      prompt: 'Hello',
      tools: createTools(),
      stopWhen: ({ steps }) => steps.length >= 2,
      ...contextOptions,
    });
    await streamResult.consumeStream();

    assert.equal(integrationStartEvents.length, 2);
    for (const [index, event] of integrationStartEvents.entries()) {
      assertAllowedContextIsPreserved(event, `integration start ${index + 1}`);
    }
    assert.deepEqual(integrationToolContexts, [
      { tenantId: 'tenant_1' },
      { tenantId: 'tenant_1' },
    ]);

    const generateStart = channelStartEvents.get('generateText');
    const streamStart = channelStartEvents.get('streamText');
    assert.ok(
      generateStart,
      'missing generateText tracing-channel start event',
    );
    assert.ok(streamStart, 'missing streamText tracing-channel start event');
    assert.equal(
      channelToolContexts.length,
      2,
      'expected executeTool tracing-channel events for both operations',
    );

    const leakedFields: string[] = [];
    for (const [label, event] of [
      ['generateText', generateStart],
      ['streamText', streamStart],
    ] as const) {
      if (event.runtimeContext?.apiToken === 'secret') {
        leakedFields.push(`${label}.runtimeContext.apiToken`);
      }
      if (event.toolsContext?.lookup?.dbPassword === 'hunter2') {
        leakedFields.push(`${label}.toolsContext.lookup.dbPassword`);
      }
    }
    for (const [index, toolContext] of channelToolContexts.entries()) {
      if (toolContext.dbPassword === 'hunter2') {
        leakedFields.push(`executeTool[${index}].toolContext.dbPassword`);
      }
    }

    if (leakedFields.length > 0) {
      console.error(
        'ISSUE_21442: ai:telemetry leaked context excluded by telemetry allowlists\n' +
          leakedFields.map(field => `- ${field}`).join('\n'),
      );
      process.exitCode = 1;
      return;
    }

    assertAllowedContextIsPreserved(
      generateStart,
      'generateText channel start',
    );
    assertAllowedContextIsPreserved(streamStart, 'streamText channel start');
    assert.deepEqual(channelToolContexts, [
      { tenantId: 'tenant_1' },
      { tenantId: 'tenant_1' },
    ]);
    console.log('Issue #21442 did not reproduce.');
  } finally {
    channel.unsubscribe(subscribers);
  }
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
