/**
 * Integration tests for WorkflowAgent telemetry with globally registered
 * integrations (https://github.com/vercel/ai/issues/22378).
 *
 * Run with: pnpm test:integration
 */
import { OpenTelemetry } from '@ai-sdk/otel';
import { trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { AI_SDK_TELEMETRY_TRACING_CHANNEL, registerTelemetry } from 'ai';
import { tracingChannel } from 'node:diagnostics_channel';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { start } from 'workflow/api';
import {
  agentGenerateWithGlobalTelemetry,
  agentStreamWithGlobalTelemetry,
  agentStreamWithGlobalTelemetryAndTools,
  agentStreamWithProviderExecutedTool,
  issueApprovalWithGlobalTelemetry,
  resumeApprovalWithGlobalTelemetry,
} from './test/telemetry-workflows.js';

const exporter = new InMemorySpanExporter();
trace.setGlobalTracerProvider(
  new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  }),
);

const events: string[] = [];
const spanContexts: unknown[] = [];
const eventContexts: unknown[] = [];
const toolEventContexts: unknown[] = [];
const callIds = new Set<string>();
const tracingChannelEvents: string[] = [];
const tracingChannelToolAsyncEndMessages: Array<{
  event: Record<string, unknown>;
  result?: unknown;
}> = [];

let failTelemetryStep = false;
let recordedToolExecutionMs: number | undefined;

registerTelemetry(
  new OpenTelemetry({
    enrichSpan: ({ runtimeContext }) => {
      spanContexts.push(runtimeContext);
      return undefined;
    },
  }),
  {
    onStart: event => {
      events.push('onStart');
      eventContexts.push(
        'runtimeContext' in event ? event.runtimeContext : undefined,
      );
      callIds.add(event.callId);
    },
    onStepStart: event => {
      events.push('onStepStart');
      eventContexts.push(
        'runtimeContext' in event ? event.runtimeContext : undefined,
      );
    },
    onLanguageModelCallStart: () =>
      void events.push('onLanguageModelCallStart'),
    onLanguageModelCallEnd: () => void events.push('onLanguageModelCallEnd'),
    onStepEnd: event => {
      events.push('onStepEnd');
      eventContexts.push(
        'runtimeContext' in event ? event.runtimeContext : undefined,
      );
    },
    onEnd: event => {
      events.push('onEnd');
      eventContexts.push(
        'runtimeContext' in event ? event.runtimeContext : undefined,
      );
    },
    executeLanguageModelCall: ({ execute }) => {
      events.push('executeLanguageModelCall');
      return execute();
    },
    onToolExecutionStart: event => {
      events.push('onToolExecutionStart');
      toolEventContexts.push(
        'toolContext' in event ? event.toolContext : undefined,
      );
    },
    executeTool: ({ execute }) => {
      if (failTelemetryStep) {
        throw new Error('Simulated telemetry step failure');
      }
      events.push('executeTool');
      return execute();
    },
    onToolExecutionEnd: event => {
      events.push('onToolExecutionEnd');
      if (
        event != null &&
        typeof event === 'object' &&
        'toolExecutionMs' in event &&
        typeof (event as any).toolExecutionMs === 'number'
      ) {
        recordedToolExecutionMs = (event as any).toolExecutionMs;
      }
    },
  },
);

tracingChannel(AI_SDK_TELEMETRY_TRACING_CHANNEL).subscribe({
  start: message =>
    void tracingChannelEvents.push((message as { type: string }).type),
  end: () => {},
  asyncStart: () => {},
  asyncEnd: message => {
    const msg = message as {
      type: string;
      event: Record<string, unknown>;
      result?: unknown;
    };
    if (msg.type === 'executeTool') {
      tracingChannelToolAsyncEndMessages.push({
        event: { ...msg.event },
        result: msg.result,
      });
    }
  },
  error: () => {},
});

beforeEach(() => {
  exporter.reset();
  events.length = 0;
  spanContexts.length = 0;
  eventContexts.length = 0;
  toolEventContexts.length = 0;
  callIds.clear();
  tracingChannelEvents.length = 0;
  tracingChannelToolAsyncEndMessages.length = 0;
  failTelemetryStep = false;
  recordedToolExecutionMs = undefined;
});

function getAiSpanNames() {
  return exporter
    .getFinishedSpans()
    .filter(span => span.instrumentationScope.name === 'gen_ai')
    .map(span => span.name);
}

const expectedEvents = [
  'onStart',
  'onStepStart',
  'onLanguageModelCallStart',
  'executeLanguageModelCall',
  'onLanguageModelCallEnd',
  'onStepEnd',
  'onEnd',
];

const expectedSpans = [
  'chat workflow-test-model',
  'step 1',
  'ai.workflowAgent.stream workflow-test-model',
];

describe('WorkflowAgent telemetry with global integrations', () => {
  it('stream: dispatches model call telemetry from the model step', async () => {
    const run = await start(agentStreamWithGlobalTelemetry, ['hello']);

    expect(await run.returnValue).toEqual({
      text: 'Echo: hello',
      // the workflow body runs in an isolated realm without the registry
      integrationsInWorkflow: null,
      integrationsInStep: 2,
    });
    expect(events).toEqual(expectedEvents);
    expect([...callIds][0]).toMatch(/^call-/);
    expect(tracingChannelEvents).toContain('languageModelCall');
    expect(getAiSpanNames()).toEqual(expectedSpans);
  });

  it('generate: dispatches model call telemetry from the model step', async () => {
    const run = await start(agentGenerateWithGlobalTelemetry, ['hello']);

    expect(await run.returnValue).toEqual({ text: 'Echo: hello' });
    expect(events).toEqual(expectedEvents);
    expect(tracingChannelEvents).toContain('languageModelCall');
    expect(getAiSpanNames()).toEqual(expectedSpans);
  });

  it.each(['stream', 'generate'] as const)(
    '%s: includes only opted-in runtime context in model-step telemetry',
    async mode => {
      for (const includeTraceIdentity of [undefined, false, true]) {
        spanContexts.length = 0;
        eventContexts.length = 0;
        const run =
          mode === 'stream'
            ? await start(agentStreamWithGlobalTelemetry, [
                'hello',
                includeTraceIdentity,
              ])
            : await start(agentGenerateWithGlobalTelemetry, [
                'hello',
                includeTraceIdentity,
              ]);
        await run.returnValue;

        const expectedContext = includeTraceIdentity
          ? { traceIdentity: { sessionId: 'chat_1', userId: 'user_1' } }
          : {};
        expect(spanContexts).toEqual(Array(3).fill(expectedContext));
        expect(eventContexts).toEqual(Array(4).fill(expectedContext));
      }
    },
  );

  it('stream: dispatches tool call telemetry from the tool step', async () => {
    const run = await start(agentStreamWithGlobalTelemetryAndTools, ['world']);
    const returnValue = await run.returnValue;

    expect(returnValue).toEqual({
      text: 'Workflow completed',
      stepsCount: 2,
    });
    expect(events).toContain('onToolExecutionStart');
    expect(events).toContain('executeTool');
    expect(events).toContain('onToolExecutionEnd');
    expect(tracingChannelEvents).toContain('executeTool');

    const spanNames = getAiSpanNames();
    expect(spanNames).toContain('execute_tool echoStep');

    const toolSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'execute_tool echoStep');
    expect(toolSpan).toBeDefined();
    expect(toolSpan?.attributes['gen_ai.operation.name']).toBe('execute_tool');
    expect(toolSpan?.attributes['gen_ai.tool.name']).toBe('echoStep');

    expect(toolSpan?.attributes['gen_ai.execute_tool.duration']).toBeDefined();
    expect(recordedToolExecutionMs).toBeDefined();
    expect(toolSpan?.attributes['gen_ai.execute_tool.duration']).toBe(
      recordedToolExecutionMs! / 1000,
    );
    expect(tracingChannelToolAsyncEndMessages).toHaveLength(1);
    expect(tracingChannelToolAsyncEndMessages[0].result).toEqual({
      output: expect.objectContaining({
        type: 'tool-result',
        toolName: 'echoStep',
        output: 'echo:world',
      }),
      toolExecutionMs: recordedToolExecutionMs,
    });
  });

  it('stream: records error on span when tool fails', async () => {
    const run = await start(agentStreamWithGlobalTelemetryAndTools, [
      'world',
      { toolThrows: true },
    ]);
    const returnValue = await run.returnValue;

    expect(returnValue).toEqual({
      text: 'Workflow completed',
      stepsCount: 2,
    });
    expect(events).toContain('onToolExecutionStart');
    expect(events).toContain('onToolExecutionEnd');

    const spanNames = getAiSpanNames();
    expect(spanNames).toContain('execute_tool throwingStep');

    const errorSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'execute_tool throwingStep');
    expect(errorSpan).toBeDefined();
    expect(errorSpan?.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(errorSpan?.events.some(e => e.name === 'exception')).toBe(true);
  });

  it('stream: filters included tool context according to includeToolsContext', async () => {
    for (const includeToolsContext of [false, true]) {
      events.length = 0;
      toolEventContexts.length = 0;
      tracingChannelToolAsyncEndMessages.length = 0;
      const run = await start(agentStreamWithGlobalTelemetryAndTools, [
        'world',
        { includeToolsContext },
      ]);
      await run.returnValue;

      const expectedContext = includeToolsContext
        ? { allowedKey: 'public-data' }
        : {};
      expect(toolEventContexts).toEqual([expectedContext]);
      expect(tracingChannelToolAsyncEndMessages).toHaveLength(1);
      expect(tracingChannelToolAsyncEndMessages[0].event.toolContext).toEqual(
        expectedContext,
      );
    }
  });

  it('stream: provider-executed tool produces exactly one extension span', async () => {
    const run = await start(agentStreamWithProviderExecutedTool, [
      'test search',
    ]);
    const returnValue = await run.returnValue;

    expect(returnValue.stepsCount).toBe(1);

    const extensionSpans = exporter
      .getFinishedSpans()
      .filter(span => span.name === 'execute_tool webSearch');

    expect(extensionSpans).toHaveLength(1);
    expect(extensionSpans[0].attributes['gen_ai.operation.name']).toBe(
      'execute_tool',
    );
    expect(extensionSpans[0].attributes['gen_ai.tool.name']).toBe('webSearch');
    expect(extensionSpans[0].attributes['gen_ai.tool.type']).toBe('extension');
  });

  it('generate: resumed approved tool produces an execute_tool span', async () => {
    vi.stubEnv('WORKFLOW_TOOL_APPROVAL_SECRET', 'test-approval-secret');
    try {
      const issueRun = await start(issueApprovalWithGlobalTelemetry, []);
      const messages = await issueRun.returnValue;
      expect(messages).toBeDefined();

      exporter.reset();

      const resumeRun = await start(resumeApprovalWithGlobalTelemetry, [
        messages,
        true,
      ]);
      const result = await resumeRun.returnValue;
      expect(result.text).toBe('Approval done.');

      const approvedToolSpans = exporter
        .getFinishedSpans()
        .filter(span => span.name === 'execute_tool actionStep');

      expect(approvedToolSpans).toHaveLength(1);
      expect(approvedToolSpans[0].attributes['gen_ai.operation.name']).toBe(
        'execute_tool',
      );
      expect(approvedToolSpans[0].attributes['gen_ai.tool.name']).toBe(
        'actionStep',
      );
      expect(approvedToolSpans[0].attributes['gen_ai.tool.type']).toBe(
        'function',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('stream: a failing telemetry step does not fail the agent run', async () => {
    failTelemetryStep = true;
    try {
      const run = await start(agentStreamWithGlobalTelemetryAndTools, [
        'world',
      ]);
      const returnValue = await run.returnValue;

      expect(returnValue).toEqual({
        text: 'Workflow completed',
        stepsCount: 2,
      });
    } finally {
      failTelemetryStep = false;
    }
  });
});
