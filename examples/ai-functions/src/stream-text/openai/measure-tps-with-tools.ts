import { performance } from 'node:perf_hooks';
import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool, type TelemetryIntegration } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

type StepMeasurement = {
  stepNumber: number;
  startedAtMs?: number;
  firstChunkAtMs?: number;
  firstTextAtMs?: number;
  finishedAtMs?: number;
  msToFirstChunk?: number;
  msToFinish?: number;
  sdkAverageOutputTokensPerSecond?: number;
  toolDurationMs: number;
  outputTokens?: number;
  textTokens?: number;
  finishReason?: string;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function elapsedMs(
  startAtMs: number | undefined,
  endAtMs: number | undefined,
): number | undefined {
  return startAtMs == null || endAtMs == null ? undefined : endAtMs - startAtMs;
}

function formatMs(value: number | undefined): string {
  return value == null ? 'n/a' : `${value.toFixed(0)} ms`;
}

function formatTokens(value: number | undefined): string {
  return value == null ? 'n/a' : value.toString();
}

function formatRate(
  tokens: number | undefined,
  durationMs: number | undefined,
): string {
  if (tokens == null || durationMs == null || durationMs <= 0) {
    return 'n/a';
  }

  return `${((tokens * 1000) / durationMs).toFixed(1)} tok/s`;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

run(async () => {
  const steps = new Map<number, StepMeasurement>();
  let currentStepNumber: number | undefined;

  let callStartedAtMs: number | undefined;
  let firstProviderChunkAtMs: number | undefined;
  let firstVisibleTextAtMs: number | undefined;
  let callFinishedAtMs: number | undefined;
  let totalOutputTokens: number | undefined;
  let totalTextTokens: number | undefined;

  const getStep = (stepNumber: number): StepMeasurement => {
    const existing = steps.get(stepNumber);

    if (existing != null) {
      return existing;
    }

    const created: StepMeasurement = {
      stepNumber,
      toolDurationMs: 0,
    };

    steps.set(stepNumber, created);

    return created;
  };

  const telemetryIntegration = {
    onChunk({ chunk }) {
      const timestampMs = performance.now();

      if (chunk.type === 'ai.stream.firstChunk') {
        const step = getStep(chunk.stepNumber);

        step.firstChunkAtMs ??= timestampMs;
        step.msToFirstChunk ??= asNumber(
          chunk.attributes?.['ai.response.msToFirstChunk'],
        );
        firstProviderChunkAtMs ??= timestampMs;
      }

      if (chunk.type === 'ai.stream.finish') {
        const step = getStep(chunk.stepNumber);

        step.finishedAtMs ??= timestampMs;
        step.msToFinish ??= asNumber(
          chunk.attributes?.['ai.response.msToFinish'],
        );
        step.sdkAverageOutputTokensPerSecond ??= asNumber(
          chunk.attributes?.['ai.response.avgOutputTokensPerSecond'],
        );
      }
    },
  } satisfies TelemetryIntegration;

  const result = streamText({
    model: openai('gpt-4o-mini'),
    prompt:
      'Use currentLocation to find where I am, then use weather to get the forecast for that location, then answer in one short paragraph.',
    stopWhen: stepCountIs(5),
    tools: {
      currentLocation: tool({
        description: 'Get the current location.',
        inputSchema: z.object({}),
        execute: async () => {
          await wait(250);

          return { location: 'San Francisco' };
        },
      }),
      weather: tool({
        description: 'Get the weather in a location.',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => {
          await wait(750);

          return {
            location,
            temperature: 63,
            conditions: 'foggy',
            precipitationChance: 15,
          };
        },
      }),
    },
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'stream-text-tps-with-tools-demo',
      integrations: telemetryIntegration,
    },
    experimental_onStart() {
      callStartedAtMs = performance.now();
    },
    experimental_onStepStart({ stepNumber }) {
      currentStepNumber = stepNumber;
      getStep(stepNumber).startedAtMs ??= performance.now();
    },
    experimental_onToolCallFinish({ stepNumber, durationMs }) {
      const targetStepNumber = stepNumber ?? currentStepNumber;

      if (targetStepNumber != null) {
        getStep(targetStepNumber).toolDurationMs += durationMs;
      }
    },
    onChunk({ chunk }) {
      if (chunk.type !== 'text-delta') {
        return;
      }

      const timestampMs = performance.now();

      firstVisibleTextAtMs ??= timestampMs;

      if (currentStepNumber != null) {
        getStep(currentStepNumber).firstTextAtMs ??= timestampMs;
      }
    },
    onStepFinish(step) {
      currentStepNumber = undefined;

      const measurement = getStep(step.stepNumber);

      measurement.finishedAtMs ??= performance.now();
      measurement.outputTokens = step.usage.outputTokens;
      measurement.textTokens = step.usage.outputTokenDetails.textTokens;
      measurement.finishReason = step.finishReason;
    },
    onFinish(event) {
      callFinishedAtMs = performance.now();
      totalOutputTokens = event.totalUsage.outputTokens;
      totalTextTokens = event.totalUsage.outputTokenDetails.textTokens;
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();

  const totalUsage = await result.totalUsage;
  const finalizedSteps = await result.steps;

  callFinishedAtMs ??= performance.now();
  totalOutputTokens ??= totalUsage.outputTokens;
  totalTextTokens ??= totalUsage.outputTokenDetails.textTokens;

  const totalDurationMs = elapsedMs(callStartedAtMs, callFinishedAtMs);
  const timeToFirstProviderChunkMs = elapsedMs(
    callStartedAtMs,
    firstProviderChunkAtMs,
  );
  const timeToFirstVisibleTextMs = elapsedMs(
    callStartedAtMs,
    firstVisibleTextAtMs,
  );
  const totalToolDurationMs = Array.from(steps.values()).reduce(
    (sum, step) => sum + step.toolDurationMs,
    0,
  );
  const estimatedModelOnlyDurationMs =
    totalDurationMs == null
      ? undefined
      : Math.max(totalDurationMs - totalToolDurationMs, 0);
  const postFirstTextDurationMs =
    firstVisibleTextAtMs == null || callFinishedAtMs == null
      ? undefined
      : Math.max(callFinishedAtMs - firstVisibleTextAtMs, 0);

  console.log('\n=== Overall metrics ===');
  console.log('Steps:', finalizedSteps.length);
  console.log('End-to-end wall time:', formatMs(totalDurationMs));
  console.log(
    'Time to first provider chunk:',
    formatMs(timeToFirstProviderChunkMs),
  );
  console.log(
    'Time to first visible text:',
    formatMs(timeToFirstVisibleTextMs),
  );
  console.log('Summed tool time:', formatMs(totalToolDurationMs));
  console.log('Total output tokens:', formatTokens(totalOutputTokens));
  console.log('Visible text tokens:', formatTokens(totalTextTokens));
  console.log(
    'End-to-end TPS (all output tokens):',
    formatRate(totalOutputTokens, totalDurationMs),
  );
  console.log(
    'End-to-end TPS (visible text tokens):',
    formatRate(totalTextTokens, totalDurationMs),
  );
  console.log(
    'Visible-text TPS after first text:',
    formatRate(totalTextTokens, postFirstTextDurationMs),
  );
  console.log(
    'Estimated model-only TPS (all output tokens):',
    formatRate(totalOutputTokens, estimatedModelOnlyDurationMs),
  );

  console.log('\n=== Per-step metrics ===');
  console.table(
    [...steps.values()]
      .sort((a, b) => a.stepNumber - b.stepNumber)
      .map(step => {
        const wallMs =
          step.msToFinish ?? elapsedMs(step.startedAtMs, step.finishedAtMs);
        const firstChunkMs =
          step.msToFirstChunk ??
          elapsedMs(step.startedAtMs, step.firstChunkAtMs);
        const firstTextMs = elapsedMs(step.startedAtMs, step.firstTextAtMs);
        const estimatedModelOnlyMs =
          wallMs == null
            ? undefined
            : Math.max(wallMs - step.toolDurationMs, 0);

        return {
          step: step.stepNumber,
          finishReason: step.finishReason ?? 'n/a',
          firstChunkMs: formatMs(firstChunkMs),
          firstTextMs: formatMs(firstTextMs),
          wallMs: formatMs(wallMs),
          toolMs: formatMs(step.toolDurationMs),
          outputTokens: formatTokens(step.outputTokens),
          textTokens: formatTokens(step.textTokens),
          wallTps: formatRate(step.outputTokens, wallMs),
          modelOnlyTps: formatRate(step.outputTokens, estimatedModelOnlyMs),
          sdkWallTps:
            step.sdkAverageOutputTokensPerSecond == null
              ? 'n/a'
              : `${step.sdkAverageOutputTokensPerSecond.toFixed(1)} tok/s`,
        };
      }),
  );

  console.log();
  console.log(
    'The closest internal step markers come from telemetry chunk events: ai.stream.firstChunk and ai.stream.finish.',
  );
  console.log(
    'Use totalUsage.outputTokens for all model output, or totalUsage.outputTokenDetails.textTokens for user-visible text only.',
  );
  console.log(
    'Subtracting tool durations is only an estimate of model-only time. It will not perfectly isolate provider time for provider-executed or deferred tools.',
  );
});
