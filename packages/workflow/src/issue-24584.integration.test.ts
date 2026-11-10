import { OpenTelemetry, OpenTelemetryIdGenerator } from '@ai-sdk/otel';
import { trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { registerTelemetry } from 'ai';
import { afterAll, expect, it } from 'vitest';
import { start } from 'workflow/api';
import { issue24584Workflow } from './test/issue-24584-workflow.js';

const exporter = new InMemorySpanExporter();
const durable = new OpenTelemetryIdGenerator();
const provider = new BasicTracerProvider({
  idGenerator: durable,
  sampler: durable,
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);
let stepEnds = 0;
registerTelemetry(new OpenTelemetry({ durable }), {
  onStepEnd: () => void stepEnds++,
});
afterAll(() => provider.shutdown());

it.each([
  ['generate', 'client-tool'],
  ['stream', 'text'],
  ['stream', 'client-tool'],
] as const)(
  '%s ending in %s exports both steps and their model calls in one tree',
  async (mode, ending) => {
    exporter.reset();
    stepEnds = 0;
    const run = await start(issue24584Workflow, [mode, ending]);
    const result = await run.returnValue;
    await provider.forceFlush();

    // Preconditions concern only the intended run, never the broken telemetry.
    expect(result.steps).toBe(2);
    expect(result.executedTools).toEqual(['addNumbers']);
    expect(result.lastTool).toBe(
      ending === 'client-tool' ? 'askUser' : undefined,
    );

    const spans = exporter
      .getFinishedSpans()
      .filter(span => span.instrumentationScope.name === 'gen_ai');
    const root = spans.find(span => span.name.startsWith('invoke_agent '));
    const steps = spans.filter(span => /^step \d+$/.test(span.name));
    const chats = spans.filter(span => span.name.startsWith('chat '));
    const byId = new Map(spans.map(span => [span.spanContext().spanId, span]));
    const orphans = chats.filter(
      span => !byId.has(span.parentSpanContext?.spanId ?? ''),
    );
    console.log(
      JSON.stringify({
        mode,
        ending,
        exportedSpans: spans.map(span => span.name),
        orphanedModelCalls: orphans.length,
        stepEnds,
      }),
    );

    expect(root).toBeDefined();
    expect(chats).toHaveLength(2);
    // Primary invariant: the finished run exports each model call's step,
    // attached to the agent. Do not depend on span export ordering or IDs.
    expect(
      steps.length === 2 &&
        orphans.length === 0 &&
        steps.every(
          step => step.parentSpanContext?.spanId === root?.spanContext().spanId,
        ) &&
        chats.every(chat =>
          steps.some(
            step =>
              step.spanContext().spanId === chat.parentSpanContext?.spanId,
          ),
        ),
      'ISSUE-24584: completed run must export both step spans without orphaned model calls',
    ).toBe(true);
    // Secondary diagnostic: the durable lifecycle must close both steps.
    expect(stepEnds).toBe(2);
  },
);
