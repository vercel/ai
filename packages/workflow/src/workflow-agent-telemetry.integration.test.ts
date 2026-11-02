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
import { beforeEach, describe, expect, it } from 'vitest';
import { start } from 'workflow/api';
import {
  agentGenerateWithGlobalTelemetry,
  agentStreamWithGlobalTelemetry,
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
const callIds = new Set<string>();
const tracingChannelEvents: string[] = [];

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
});
