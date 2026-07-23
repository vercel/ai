import {
  HARNESS_V1_BUILTIN_TOOLS,
  type HarnessV1,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PromptTurnOptions,
  type HarnessV1SandboxProvider,
  type HarnessV1Session,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';

const zeroUsage = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: undefined,
    text: undefined,
    reasoning: undefined,
  },
};

async function main() {
  const { createHarnessWorkflowState, runHarnessAgentSlice } = await import(
    new URL(
      '../../../../packages/workflow-harness/dist/index.js',
      import.meta.url,
    ).href
  );

  let emit: HarnessV1PromptTurnOptions['emit'] | undefined;
  let resolveTurn!: () => void;
  const turnDone = new Promise<void>(resolve => {
    resolveTurn = resolve;
  });

  const harnessSession: HarnessV1Session = {
    sessionId: 'issue-17795',
    isResume: false,
    async doPromptTurn(options) {
      emit = options.emit;
      queueMicrotask(() => {
        options.emit({
          type: 'tool-call',
          toolCallId: 'tool-call-1',
          toolName: 'bash',
          nativeName: 'Bash',
          input: JSON.stringify({ command: 'sleep 60' }),
          providerExecuted: true,
        });
      });
      return {
        done: turnDone,
        async submitToolResult() {},
      };
    },
    async doContinueTurn() {
      throw new Error('not used');
    },
    async doCompact() {},
    async doDetach() {
      throw new Error('not used');
    },
    async doStop() {
      throw new Error('not used');
    },
    async doDestroy() {},
    async doSuspendTurn() {
      // Models the Claude Code bridge ending during a tool-use step without
      // first emitting the required finish-step boundary.
      emit?.({
        type: 'finish',
        finishReason: { unified: 'error', raw: 'tool_use' },
        totalUsage: zeroUsage,
      });
      resolveTurn();
      return {
        type: 'continue-turn',
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
  };

  const harness: HarnessV1 = {
    specificationVersion: 'harness-v1',
    harnessId: 'claude-code',
    builtinTools: { bash: HARNESS_V1_BUILTIN_TOOLS.bash },
    async doStart() {
      return harnessSession;
    },
  };

  const sandboxSession = {
    id: 'issue-17795-sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    async getPortUrl() {
      return 'ws://example.invalid';
    },
    async run() {
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    async stop() {},
    async destroy() {},
    restricted() {
      return this;
    },
  } as unknown as HarnessV1NetworkSandboxSession;

  const sandbox: HarnessV1SandboxProvider = {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'issue-17795-sandbox',
    async createSession() {
      return sandboxSession;
    },
    async resumeSession() {
      return sandboxSession;
    },
  };

  const agent = new HarnessAgent({ harness, sandbox });
  const state = createHarnessWorkflowState({
    sessionId: 'issue-17795',
    prompt: 'Run a long tool call.',
  });
  const writable = new WritableStream({
    write() {},
  });
  const keepProcessAlive = setTimeout(() => {}, 1000);
  const result = await runHarnessAgentSlice({
    agent,
    state,
    sliceTimeoutSeconds: 0.01,
    writable,
  }).finally(() => clearTimeout(keepProcessAlive));
  console.log(`SLICE_STATUS=${result.status}`);
  if (result.status !== 'failed') {
    throw new Error(`Expected a rejected slice result, got ${result.status}.`);
  }

  // The reported bug kills the process before unrelated post-response work can
  // run. On the target branch this marker is reached after the failed slice.
  await new Promise(resolve => setTimeout(resolve, 50));
  console.log('POST_RESPONSE_WORK_COMPLETED');
}

await main();
