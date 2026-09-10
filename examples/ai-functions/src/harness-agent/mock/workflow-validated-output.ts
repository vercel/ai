import type {
  HarnessV1,
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
  runHarnessAgentStep,
} from '@ai-sdk/workflow-harness';
import { Output } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const usage = {
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
};

function createHarness(): HarnessV1 {
  let session: HarnessV1Session;
  const events: HarnessV1StreamPart[] = [
    { type: 'stream-start', modelId: 'mock-model' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: '{"score":3}' },
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: usage,
    },
  ];

  session = {
    sessionId: 'score-session',
    isResume: false,
    async doPromptTurn({ emit }) {
      queueMicrotask(() => {
        for (const event of events) emit(event);
      });
      return {
        submitToolResult: async () => {},
        done: Promise.resolve(),
      };
    },
    async doContinueTurn() {
      return {
        submitToolResult: async () => {},
        done: Promise.resolve(),
      };
    },
    async doCompact() {},
    async doDetach() {
      return {
        type: 'resume-session',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
    async doStop() {
      return {
        type: 'resume-session',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
    async doDestroy() {},
    async doSuspendTurn() {
      return {
        type: 'continue-turn',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
  };

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'mock',
    builtinTools: {},
    async doStart() {
      return session;
    },
  };
}

function createSandboxProvider(): HarnessV1SandboxProvider {
  const runCommand = async () => ({
    exitCode: 0,
    stdout: '',
    stderr: '',
  });
  const session = {
    id: 'mock-sandbox',
    defaultWorkingDirectory: process.cwd(),
    ports: [],
    getPortEndpoint: async () => ({ url: 'ws://example.test/' }),
    getPortUrl: async () => 'ws://example.test/',
    run: runCommand,
    stop: async () => {},
    destroy: async () => {},
    restricted: () => ({ run: runCommand }) as never,
  } as unknown as HarnessV1NetworkSandboxSession;

  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'mock-sandbox',
    createSession: async () => session,
    resumeSession: async () => session,
  };
}

run(async () => {
  const agent = new HarnessAgent({
    harness: createHarness(),
    sandbox: createSandboxProvider(),
    output: Output.object({
      schema: z.object({
        score: z.number(),
      }),
    }),
  });

  const state = await runHarnessAgentStep({
    agent,
    state: createHarnessWorkflowState({
      prompt: 'Return a score.',
      sessionId: 'score-session',
    }),
    includeOutput: true,
    writable: new WritableStream(),
  });

  const result = finalizeHarnessWorkflow(state);
  console.log(result.output);
});
