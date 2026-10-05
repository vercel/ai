import assert from 'node:assert/strict';
import type { HarnessV1, HarnessV1Session } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';

async function main() {
  const warnings = [
    {
      type: 'unsupported-setting' as const,
      setting: 'temperature',
      details: 'Mock adapter does not support temperature.',
    },
  ];
  const usage = {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
  const finishReason = { unified: 'stop' as const, raw: 'stop' };

  const sessionAdapter: HarnessV1Session = {
    sessionId: 'repro-session',
    isResume: false,
    async doPromptTurn({ emit }) {
      let resolveDone!: () => void;
      const done = new Promise<void>(resolve => {
        resolveDone = resolve;
      });

      queueMicrotask(() => {
        emit({ type: 'stream-start', modelId: 'mock-model', warnings });
        emit({ type: 'text-start', id: 'text-1' });
        emit({ type: 'text-delta', id: 'text-1', delta: '42' });
        emit({ type: 'text-end', id: 'text-1' });
        emit({ type: 'finish-step', finishReason, usage });
        emit({ type: 'finish', finishReason, totalUsage: usage });
        resolveDone();
      });

      return { submitToolResult: async () => {}, done };
    },
    doCompact: async () => {},
    doContinueTurn: async () => {
      throw new Error('Not used by this reproduction.');
    },
    doSuspendTurn: async () => {
      throw new Error('Not used by this reproduction.');
    },
    doDetach: async () => {
      throw new Error('Not used by this reproduction.');
    },
    doStop: async () => {
      throw new Error('Not used by this reproduction.');
    },
    doDestroy: async () => {},
  };

  const harness: HarnessV1 = {
    specificationVersion: 'harness-v1',
    harnessId: 'repro',
    builtinTools: {},
    doStart: async () => sessionAdapter,
  };

  const sandboxSession = {
    id: 'repro-sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    run: async () => ({ exitCode: 0, stdout: '/work\n', stderr: '' }),
    readTextFile: async () => null,
    writeTextFile: async () => {},
    stop: async () => {},
    destroy: async () => {},
    restricted() {
      return this;
    },
  } as unknown as Experimental_SandboxSession;

  const agent = new HarnessAgent({ harness });
  const session = await agent.createSession({ sandboxSession });

  try {
    const result = await agent.stream({ session, prompt: 'Reproduce.' });
    await result.consumeStream();

    const steps = await result.steps;
    const actual = {
      resultWarnings: await result.warnings,
      firstStepWarnings: steps[0]?.warnings,
    };

    console.log('Observed HarnessAgent warnings:', JSON.stringify(actual));
    assert.deepStrictEqual(
      actual,
      {
        resultWarnings: warnings,
        firstStepWarnings: warnings,
      },
      'ISSUE_22097: HarnessAgent dropped adapter warnings from the step and StreamTextResult',
    );
  } finally {
    await session.destroy();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
