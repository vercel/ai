import assert, { AssertionError } from 'node:assert/strict';
import { generateText, isStepCount, jsonSchema, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const failureSignal =
  'ISSUE_22715: generateText waited for a pending stop condition after isStepCount(1) returned true';

async function main() {
  let releasePending!: (value: boolean) => void;
  const pendingCondition = new Promise<boolean>(resolve => {
    releasePending = resolve;
  });

  let signalPendingStarted!: () => void;
  const pendingStarted = new Promise<void>(resolve => {
    signalPendingStarted = resolve;
  });

  let settled = false;
  const run = generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'task',
            input: '{}',
          },
        ],
        warnings: [],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 1,
            text: 1,
            reasoning: undefined,
          },
        },
      }),
    }),
    prompt: 'Run the task.',
    tools: {
      task: tool({
        inputSchema: jsonSchema({
          type: 'object',
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => 'ok',
      }),
    },
    stopWhen: [
      isStepCount(1),
      () => {
        signalPendingStarted();
        return pendingCondition;
      },
    ],
  }).then(result => {
    settled = true;
    return result;
  });

  // A valid implementation may either start every predicate concurrently or
  // skip the pending predicate after the first predicate succeeds.
  await Promise.race([pendingStarted, run.then(() => undefined)]);
  await new Promise<void>(resolve => setImmediate(resolve));
  const settledBeforeRelease = settled;

  // Always release the controlled predicate so the broken implementation can
  // finish cleanly before the assertion reports the observed user impact.
  releasePending(false);
  await run;

  assert.equal(settledBeforeRelease, true, failureSignal);
  console.log('Issue #22715 did not reproduce.');
}

main().catch(error => {
  if (
    error instanceof AssertionError &&
    error.message.includes(failureSignal)
  ) {
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
