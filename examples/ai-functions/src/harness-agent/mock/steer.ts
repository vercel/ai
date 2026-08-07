import type { HarnessV1PromptControl } from '@ai-sdk/harness';
import { HarnessAgent, type HarnessAgentAdapter } from '@ai-sdk/harness/agent';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { run } from '../../lib/run';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

const steerableHarness: HarnessAgentAdapter = {
  specificationVersion: 'harness-v1',
  harnessId: 'steerable-mock',
  builtinTools: {},
  async doStart({ sessionId }) {
    return {
      sessionId,
      isResume: false,
      async doPromptTurn({ emit }): Promise<HarnessV1PromptControl> {
        let finish!: () => void;
        const done = new Promise<void>(resolve => {
          finish = resolve;
        });
        let settled = false;

        emit({ type: 'stream-start' });

        return {
          submitToolResult: async () => {},
          submitUserMessage: async text => {
            if (settled) return;
            settled = true;
            emit({ type: 'text-start', id: 'steered-answer' });
            emit({
              type: 'text-delta',
              id: 'steered-answer',
              delta: `Steered instruction: ${text}`,
            });
            emit({ type: 'text-end', id: 'steered-answer' });
            emit({
              type: 'finish-step',
              finishReason: { unified: 'stop', raw: 'steered' },
              usage,
            });
            emit({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'steered' },
              totalUsage: usage,
            });
            finish();
          },
          done,
        };
      },
      doContinueTurn: async () => {
        throw new Error('This example does not suspend turns.');
      },
      doCompact: async () => {},
      doDetach: async () => ({
        type: 'resume-session',
        harnessId: 'steerable-mock',
        specificationVersion: 'harness-v1',
        data: {},
      }),
      doStop: async () => ({
        type: 'resume-session',
        harnessId: 'steerable-mock',
        specificationVersion: 'harness-v1',
        data: {},
      }),
      doDestroy: async () => {},
      doSuspendTurn: async () => ({
        type: 'continue-turn',
        harnessId: 'steerable-mock',
        specificationVersion: 'harness-v1',
        data: {},
      }),
    };
  },
};

run(async () => {
  const agent = new HarnessAgent({
    harness: steerableHarness,
    sandbox: createJustBashSandbox(),
  });

  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt: 'Draft a broad migration plan.',
    });

    await session.steer('Focus only on the database rollback plan.');

    const text = await result.text;
    console.log(text);
    if (
      text !== 'Steered instruction: Focus only on the database rollback plan.'
    ) {
      throw new Error(`Unexpected steering result: ${text}`);
    }
  } finally {
    await session.destroy();
  }
});
