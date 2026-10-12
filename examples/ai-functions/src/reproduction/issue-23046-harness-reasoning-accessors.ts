import {
  HarnessAgent,
  type HarnessAgentAdapter,
  type HarnessAgentAdapterSession,
  type HarnessAgentPromptTurnOptions,
  type HarnessAgentStreamPart,
} from '@ai-sdk/harness/agent';
import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import assert from 'node:assert/strict';

const failureSignal =
  'ISSUE_23046: top-level reasoning accessors lost final-step reasoning';

class ReproducedBugError extends Error {}

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 2,
    text: 1,
    reasoning: 1,
  },
};
const finishReason = { unified: 'stop', raw: 'stop' } as const;
const events: HarnessAgentStreamPart[] = [
  { type: 'reasoning-start', id: 'r' },
  {
    type: 'reasoning-delta',
    id: 'r',
    delta: 'Synthetic reasoning.',
  },
  { type: 'reasoning-end', id: 'r' },
  { type: 'text-start', id: 't' },
  { type: 'text-delta', id: 't', delta: 'Answer.' },
  { type: 'text-end', id: 't' },
  { type: 'finish-step', finishReason, usage },
  { type: 'finish', finishReason, totalUsage: usage },
];

function createHarness(): HarnessAgentAdapter {
  const adapterSession = {
    sessionId: 'mock-session',
    isResume: false,
    async doPromptTurn({ emit }: HarnessAgentPromptTurnOptions) {
      const done = Promise.resolve().then(() => {
        for (const event of events) {
          emit(event);
        }
      });
      return {
        done,
        async submitToolResult() {},
        async submitToolApproval() {},
      };
    },
    async doDestroy() {},
  } as unknown as HarnessAgentAdapterSession;

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'mock',
    builtinTools: {},
    async doStart() {
      return adapterSession;
    },
  };
}

function createSandboxSession(): HarnessV1NetworkSandboxSession {
  const files = new Map<string, string>();
  const sandboxSession = {
    id: 'synthetic',
    defaultWorkingDirectory: '/work',
    ports: [],
    async run({ command }: { command: string }) {
      return {
        exitCode: 0,
        stderr: '',
        stdout: command === 'pwd' ? '/work\n' : '/home/agent',
      };
    },
    async readTextFile({ path }: { path: string }) {
      return files.get(path) ?? null;
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      files.set(path, content);
    },
    async stop() {},
    async destroy() {},
  };

  return {
    ...sandboxSession,
    restricted: () => sandboxSession,
  } as unknown as HarnessV1NetworkSandboxSession;
}

async function main() {
  const agent = new HarnessAgent({ harness: createHarness() });
  const session = await agent.createSession({
    sandboxSession: createSandboxSession(),
  });

  try {
    const result = await agent.stream({ session, prompt: 'Test' });
    const streamedParts = [];
    for await (const part of result.fullStream) {
      streamedParts.push(part);
    }

    const steps = await result.steps;
    const finalStep = await result.finalStep;
    const actual = {
      text: await result.text,
      reasoning: await result.reasoning,
      reasoningText: await result.reasoningText,
      stepReasoning: steps[0]?.reasoning,
      stepReasoningText: steps[0]?.reasoningText,
      finalStepReasoning: finalStep.reasoning,
      finalStepReasoningText: finalStep.reasoningText,
    };

    assert.equal(actual.text, 'Answer.');
    assert.deepEqual(
      streamedParts
        .filter(part => part.type === 'reasoning-delta')
        .map(part => part.text),
      ['Synthetic reasoning.'],
    );
    assert.deepEqual(actual.stepReasoning, [
      { type: 'reasoning', text: 'Synthetic reasoning.' },
    ]);
    assert.equal(actual.stepReasoningText, 'Synthetic reasoning.');
    assert.deepEqual(actual.finalStepReasoning, actual.stepReasoning);
    assert.equal(actual.finalStepReasoningText, actual.stepReasoningText);

    try {
      assert.deepEqual(actual.reasoning, actual.finalStepReasoning);
      assert.equal(actual.reasoningText, actual.finalStepReasoningText);
    } catch (error) {
      throw new ReproducedBugError(failureSignal, { cause: error });
    }

    console.log('Issue #23046 did not reproduce.');
  } finally {
    await session.destroy();
  }
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
