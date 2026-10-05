import { WorkflowAgent } from '@ai-sdk/workflow';
import { streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const firstOutputDelayMs = 200;
const finishDelayMs = 200;
const minimumFirstOutputMs = 100;
const minimumResponseMs = 250;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const slowModel = () =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        async start(controller) {
          await sleep(firstOutputDelayMs);
          controller.enqueue({ type: 'text-start', id: '1' });
          controller.enqueue({
            type: 'text-delta',
            id: '1',
            delta: 'Hello',
          });
          await sleep(finishDelayMs);
          controller.enqueue({ type: 'text-end', id: '1' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 10,
                noCache: 10,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 20,
                text: 20,
                reasoning: undefined,
              },
            },
          });
          controller.close();
        },
      }),
    }),
  });

type Performance = {
  responseTimeMs: number;
  stepTimeMs: number;
  effectiveOutputTokensPerSecond: number;
  outputTokensPerSecond: number | undefined;
  inputTokensPerSecond: number | undefined;
  effectiveTotalTokensPerSecond: number;
  timeToFirstOutputMs: number | undefined;
};

function performanceFailures(label: string, performance: Performance) {
  const failures: string[] = [];

  if (performance.responseTimeMs < minimumResponseMs) {
    failures.push(`${label}.responseTimeMs=${performance.responseTimeMs}`);
  }
  if (performance.stepTimeMs < minimumResponseMs) {
    failures.push(`${label}.stepTimeMs=${performance.stepTimeMs}`);
  }
  if (
    performance.timeToFirstOutputMs == null ||
    performance.timeToFirstOutputMs < minimumFirstOutputMs
  ) {
    failures.push(
      `${label}.timeToFirstOutputMs=${String(performance.timeToFirstOutputMs)}`,
    );
  }
  if (performance.effectiveOutputTokensPerSecond <= 0) {
    failures.push(
      `${label}.effectiveOutputTokensPerSecond=${performance.effectiveOutputTokensPerSecond}`,
    );
  }
  if (
    performance.outputTokensPerSecond == null ||
    performance.outputTokensPerSecond <= 0
  ) {
    failures.push(
      `${label}.outputTokensPerSecond=${String(performance.outputTokensPerSecond)}`,
    );
  }
  if (
    performance.inputTokensPerSecond == null ||
    performance.inputTokensPerSecond <= 0
  ) {
    failures.push(
      `${label}.inputTokensPerSecond=${String(performance.inputTokensPerSecond)}`,
    );
  }
  if (performance.effectiveTotalTokensPerSecond <= 0) {
    failures.push(
      `${label}.effectiveTotalTokensPerSecond=${performance.effectiveTotalTokensPerSecond}`,
    );
  }

  return failures;
}

async function main() {
  const coreResult = streamText({ model: slowModel(), prompt: 'hi' });
  const corePerformance = (await coreResult.steps)[0]?.performance;

  if (corePerformance == null) {
    throw new Error('Baseline failure: streamText did not return a step.');
  }

  const baselineFailures = performanceFailures('streamText', corePerformance);
  if (baselineFailures.length > 0) {
    throw new Error(
      `Baseline failure: streamText did not measure the delayed stream: ${baselineFailures.join(', ')}`,
    );
  }

  let callbackPerformance: Performance | undefined;
  const agent = new WorkflowAgent({ model: slowModel() });
  const agentResult = await agent.stream({
    messages: [{ role: 'user', content: 'hi' }],
    onStepEnd(step) {
      callbackPerformance = step.performance;
    },
  });
  const resultPerformance = agentResult.steps[0]?.performance;

  if (resultPerformance == null || callbackPerformance == null) {
    throw new Error(
      'WorkflowAgent failure: the result or onStepEnd callback did not contain a step.',
    );
  }

  console.log(
    JSON.stringify(
      {
        streamText: corePerformance,
        workflowAgentResult: resultPerformance,
        workflowAgentOnStepEnd: callbackPerformance,
      },
      null,
      2,
    ),
  );

  const workflowFailures = [
    ...performanceFailures('result.steps[0]', resultPerformance),
    ...performanceFailures('onStepEnd', callbackPerformance),
  ];

  if (workflowFailures.length > 0) {
    throw new Error(
      `ISSUE_22072_REPRODUCED: WorkflowAgent.stream() returned placeholder performance metrics: ${workflowFailures.join(', ')}`,
    );
  }

  console.log(
    'Issue #22072 is fixed: WorkflowAgent.stream() measured performance in both result.steps and onStepEnd.',
  );
}

await main();
