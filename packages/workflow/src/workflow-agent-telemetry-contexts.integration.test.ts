/**
 * Integration tests for where a durable WorkflowAgent run captures the
 * telemetry integrations' durable contexts: in its first model step, without
 * a telemetry step of its own.
 *
 * Run with: pnpm test:integration
 */
import type { DurableTelemetryContext, Telemetry } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';
import { start } from 'workflow/api';
import {
  hydrateResourceIO,
  observabilityRevivers,
} from 'workflow/observability';
import { getWorld } from 'workflow/runtime';
import {
  agentAbortedBeforeModelStep,
  agentToolLoopWithGlobalTelemetry,
} from './test/telemetry-workflows.js';

async function steps(runId: string) {
  const page = await (
    await getWorld()
  ).steps.list({ runId, resolveData: 'all' });
  expect(page.hasMore).toBe(false);
  return page.data
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(step => hydrateResourceIO(step, observabilityRevivers))
    .map(step => ({
      // `step//./src/do-stream-step//doStreamStep` -> `doStreamStep`
      name: step.stepName.split('/').at(-1)!,
      args: (step.input as unknown as { args: any[] }).args,
    }));
}

const isTelemetryStep = ({ name }: { name: string }) => /telemetry/i.test(name);
const isModelStep = ({ name }: { name: string }) =>
  name === 'doStreamStep' || name === 'doGenerateStep';

/** The telemetry settings in the options of a model step. */
const modelStepTelemetry = ({ name, args }: { name: string; args: any[] }) =>
  args[name === 'doStreamStep' ? 4 : 3].telemetry;

type Received = { type: string; event: any };

/** An integration with a durable bridge that records what it receives. */
function createBoundIntegration(received: Received[]): Telemetry {
  const record = (type: string) => (event: unknown) =>
    void received.push({ type, event });
  return {
    experimental_durable: {
      captureContext: event => {
        received.push({ type: 'captureContext', event });
        return {
          traceId: `trace-of-${event.callId}`,
          rootSpanId: 'root',
          traceFlags: 1,
          samplingDecision: 2,
        } satisfies DurableTelemetryContext;
      },
    },
    onStart: record('onStart'),
    onStepStart: record('onStepStart'),
    onLanguageModelCallStart: record('onLanguageModelCallStart'),
    onLanguageModelCallEnd: record('onLanguageModelCallEnd'),
    onStepEnd: record('onStepEnd'),
    onEnd: record('onEnd'),
    onAbort: record('onAbort'),
    onError: record('onError'),
  };
}

beforeEach(() => {
  globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
});

describe('WorkflowAgent durable telemetry contexts', () => {
  it('runs no telemetry step when no integration is registered', async () => {
    const run = await start(agentToolLoopWithGlobalTelemetry, [2, 3]);
    expect(await run.returnValue).toEqual({
      stepCount: 2,
      text: 'The sum is 5',
    });

    const all = await steps(run.runId);
    expect(all.filter(isTelemetryStep)).toEqual([]);
    const modelSteps = all.filter(isModelStep);
    expect(modelSteps).toHaveLength(2);
    // The first model step reports that there is nothing to capture, so the
    // start event crosses the step boundary once.
    expect(modelStepTelemetry(modelSteps[0])).toMatchObject({
      startEvent: { operationId: 'ai.workflowAgent.stream' },
    });
    expect(modelStepTelemetry(modelSteps[1])).toMatchObject({ contexts: [] });
    expect(modelStepTelemetry(modelSteps[1])).not.toHaveProperty('startEvent');
  });

  it('uses the contexts captured in the first model step for every model step and the report', async () => {
    const received: Received[] = [];
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [
      createBoundIntegration(received),
    ];

    const run = await start(agentToolLoopWithGlobalTelemetry, [2, 3]);
    await run.returnValue;

    // Captured once, before the first model call, from the run's start event.
    const captures = received.filter(({ type }) => type === 'captureContext');
    expect(captures).toHaveLength(1);
    expect(received[0]).toBe(captures[0]);
    expect(captures[0].event).toMatchObject({
      operationId: 'ai.workflowAgent.stream',
      functionId: 'issue-23618',
      messages: [{ role: 'user', content: 'Add 2 and 3' }],
    });
    const context = {
      traceId: `trace-of-${captures[0].event.callId}`,
      rootSpanId: 'root',
      traceFlags: 1,
      samplingDecision: 2,
    };

    // Live model calls of both steps, then the replayed run.
    const live = received.filter(
      ({ type, event }) =>
        type === 'onLanguageModelCallStart' &&
        event.durableContext?.phase === 'live',
    );
    expect(live.map(({ event }) => event.durableContext)).toEqual([
      expect.objectContaining({ run: context, stepNumber: 0 }),
      expect.objectContaining({ run: context, stepNumber: 1 }),
    ]);
    const starts = received.filter(({ type }) => type === 'onStart');
    expect(starts.map(({ event }) => event.durableContext)).toEqual([
      { run: context, phase: 'replay' },
    ]);
    expect(received.at(-1)!.type).toBe('onEnd');

    const all = await steps(run.runId);
    expect(all.filter(isTelemetryStep).map(({ name }) => name)).toEqual([
      'reportWorkflowAgentTelemetry',
    ]);
    const modelSteps = all.filter(isModelStep);
    expect(modelStepTelemetry(modelSteps[0])).not.toHaveProperty('contexts');
    expect(modelStepTelemetry(modelSteps[1])).toMatchObject({
      contexts: [context],
    });
    expect(modelStepTelemetry(modelSteps[1])).not.toHaveProperty('startEvent');
  });

  it.each(['generate', 'stream'] as const)(
    '%s: captures in the report when the run ends before its first model step',
    async mode => {
      const received: Received[] = [];
      globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [
        createBoundIntegration(received),
      ];

      const run = await start(agentAbortedBeforeModelStep, [mode]);
      expect(await run.returnValue).toEqual(
        mode === 'generate' ? { errorName: 'AbortError' } : { stepCount: 0 },
      );

      expect(received.map(({ type }) => type)).toEqual([
        'captureContext',
        'onStart',
        'onAbort',
      ]);
      expect(received[1].event.durableContext).toEqual({
        run: expect.objectContaining({
          traceId: `trace-of-${received[0].event.callId}`,
        }),
        phase: 'replay',
      });
      const all = await steps(run.runId);
      expect(all.filter(isModelStep)).toEqual([]);
      expect(all.filter(isTelemetryStep).map(({ name }) => name)).toEqual([
        'reportWorkflowAgentTelemetry',
      ]);
    },
  );
});
