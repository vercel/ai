/**
 * Integration tests for WorkflowAgent telemetry with globally registered
 * integrations (https://github.com/vercel/ai/issues/22378,
 * https://github.com/vercel/ai/issues/23618).
 *
 * Run with: pnpm test:integration
 */
import { OpenTelemetry, OpenTelemetryIdGenerator } from '@ai-sdk/otel';
import { trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  AI_SDK_TELEMETRY_TRACING_CHANNEL,
  registerTelemetry,
  stepCountIs,
  streamText,
} from 'ai';
import { tracingChannel } from 'node:diagnostics_channel';
import { beforeEach, describe, expect, it } from 'vitest';
import { start } from 'workflow/api';
import { z } from 'zod/v4';
import { mockSequenceModel } from './providers/mock.js';
import {
  agentClientToolStopWithGlobalTelemetry,
  agentGenerateWithGlobalTelemetry,
  agentStreamWithGlobalTelemetry,
  agentToolLoopWithGlobalTelemetry,
  agentWithClientToolTelemetry,
  agentWithRedactedProviderTools,
} from './test/telemetry-workflows.js';

const exporter = new InMemorySpanExporter();
const durable = new OpenTelemetryIdGenerator();
trace.setGlobalTracerProvider(
  new BasicTracerProvider({
    idGenerator: durable,
    sampler: durable,
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  }),
);

const events: string[] = [];
const spanContexts: unknown[] = [];
const eventContexts: unknown[] = [];
const callIds = new Set<string>();
const tracingChannelEvents: string[] = [];

registerTelemetry(
  new OpenTelemetry({
    durable,
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
  },
);

tracingChannel(AI_SDK_TELEMETRY_TRACING_CHANNEL).subscribe({
  start: message =>
    void tracingChannelEvents.push((message as { type: string }).type),
  end: () => {},
  asyncStart: () => {},
  asyncEnd: () => {},
  error: () => {},
});

beforeEach(() => {
  exporter.reset();
  events.length = 0;
  spanContexts.length = 0;
  eventContexts.length = 0;
  callIds.clear();
  tracingChannelEvents.length = 0;
});

function getAiSpanNames() {
  return exporter
    .getFinishedSpans()
    .filter(span => span.instrumentationScope.name === 'gen_ai')
    .map(span => span.name);
}

// The provider call runs in the integrations' context inside the model step.
// The run's lifecycle events are reported when the run ends
// (https://github.com/vercel/ai/issues/23618).
const expectedEvents = [
  'executeLanguageModelCall',
  'onStart',
  'onStepStart',
  'onLanguageModelCallStart',
  'onLanguageModelCallEnd',
  'onStepEnd',
  'onEnd',
];

const expectedSpans = [
  'chat workflow-test-model',
  'step 1',
  'invoke_agent workflow-test-model',
];

describe('WorkflowAgent telemetry with global integrations', () => {
  it.each(['generate', 'stream'] as const)(
    '%s: ends every step span when stopping on a client-side tool',
    async mode => {
      const run = await start(agentWithClientToolTelemetry, [mode]);
      expect(await run.returnValue).toEqual({
        stepCount: 2,
        lastTool: 'askUser',
        // Preserve the public callback behavior on the paused-tool path.
        stepEndCallbacks: mode === 'generate' ? 2 : 1,
      });

      expect(events.filter(event => event === 'onStepEnd')).toHaveLength(2);
      expect(events.slice(-2)).toEqual(['onStepEnd', 'onEnd']);
      expect(getSpanTree().shape).toEqual({
        'invoke_agent workflow-test-model': [
          {
            'step 1': ['chat workflow-test-model', 'execute_tool addNumbers'],
          },
          { 'step 2': ['chat workflow-test-model'] },
        ],
      });
    },
  );

  it.each(['generate', 'stream'] as const)(
    '%s: redacts provider tools after the durable model-step boundary',
    async mode => {
      const run = await start(agentWithRedactedProviderTools, [mode]);
      expect(await run.returnValue).toBe('done');
      const definitions = exporter
        .getFinishedSpans()
        .filter(span => span.name === 'chat workflow-test-model')
        .map(span => span.attributes['gen_ai.tool.definitions']);
      expect(definitions).toHaveLength(1);
      expect(JSON.parse(definitions[0] as string)).toEqual([
        {
          type: 'provider',
          id: 'test.remote',
          name: 'remote',
          args: { credential: '[redacted]', region: 'test' },
        },
      ]);
    },
  );

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

  it('reports a multi-step run as one span tree like streamText', async () => {
    const result = streamText({
      model: mockSequenceModel([
        {
          type: 'tool-call',
          toolName: 'addNumbers',
          input: JSON.stringify({ a: 2, b: 3 }),
        },
        { type: 'text', text: 'The sum is 5' },
      ]),
      tools: {
        addNumbers: {
          description: 'Add two numbers',
          inputSchema: z.object({ a: z.number(), b: z.number() }),
          execute: async ({ a, b }: { a: number; b: number }) => a + b,
        },
      },
      telemetry: { functionId: 'issue-23618' },
      messages: [{ role: 'user', content: 'Add 2 and 3' }],
      stopWhen: stepCountIs(2),
    });
    await result.consumeStream();
    const baseline = getSpanTree();
    exporter.reset();

    const run = await start(agentToolLoopWithGlobalTelemetry, [2, 3]);
    expect(await run.returnValue).toEqual({
      stepCount: 2,
      text: 'The sum is 5',
    });
    const tree = getSpanTree();

    expect(tree.shape).toEqual(baseline.shape);
    expect(tree.shape).toEqual({
      'invoke_agent workflow-test-model': [
        {
          'step 1': ['chat workflow-test-model', 'execute_tool addNumbers'],
        },
        { 'step 2': ['chat workflow-test-model'] },
      ],
    });
    const attribute = ({ spans }: typeof tree, name: string, key: string) =>
      JSON.parse(
        spans.find(span => span.name === name)!.attributes[key] as string,
      );
    expect(
      attribute(
        tree,
        'invoke_agent workflow-test-model',
        'gen_ai.input.messages',
      ),
    ).toEqual(
      attribute(
        baseline,
        'invoke_agent workflow-test-model',
        'gen_ai.input.messages',
      ),
    );
    expect(
      attribute(
        tree,
        'invoke_agent workflow-test-model',
        'gen_ai.output.messages',
      ),
    ).toEqual(
      attribute(
        baseline,
        'invoke_agent workflow-test-model',
        'gen_ai.output.messages',
      ),
    );
    expect(
      attribute(tree, 'chat workflow-test-model', 'gen_ai.tool.definitions'),
    ).toEqual(
      attribute(
        baseline,
        'chat workflow-test-model',
        'gen_ai.tool.definitions',
      ),
    );
    for (const span of tree.spans) {
      const parent = tree.parentOf(span);
      if (parent == null) continue;
      expect(hrTimeToMs(span.startTime)).toBeGreaterThanOrEqual(
        hrTimeToMs(parent.startTime),
      );
      expect(hrTimeToMs(span.endTime)).toBeLessThanOrEqual(
        hrTimeToMs(parent.endTime),
      );
    }
  });

  it('stream: ends the last step span when a tool without execute stops the run', async () => {
    const run = await start(agentClientToolStopWithGlobalTelemetry, [2, 3]);
    expect(await run.returnValue).toEqual({
      stepCount: 2,
      toolCalls: ['askUser'],
    });

    expect(getSpanTree().shape).toEqual({
      'invoke_agent workflow-test-model': [
        {
          'step 1': ['chat workflow-test-model', 'execute_tool addNumbers'],
        },
        { 'step 2': ['chat workflow-test-model'] },
      ],
    });
  });
});

function hrTimeToMs([seconds, nanoseconds]: [number, number]): number {
  return seconds * 1000 + nanoseconds / 1e6;
}

/** AI SDK spans with their nesting, children in start order. */
function getSpanTree() {
  const spans = exporter
    .getFinishedSpans()
    .filter(span => span.instrumentationScope.name === 'gen_ai')
    .sort((a, b) => hrTimeToMs(a.startTime) - hrTimeToMs(b.startTime));
  const byId = new Map(spans.map(span => [span.spanContext().spanId, span]));
  const parentOf = (span: ReadableSpan) =>
    byId.get(span.parentSpanContext?.spanId ?? '');
  const shapeOf = (span: ReadableSpan): unknown => {
    const children = spans.filter(child => parentOf(child) === span);
    return children.length === 0
      ? span.name
      : { [span.name]: children.map(shapeOf) };
  };
  const roots = spans.filter(span => parentOf(span) == null);
  return {
    spans,
    parentOf,
    shape: roots.length === 1 ? shapeOf(roots[0]) : roots.map(shapeOf),
  };
}
