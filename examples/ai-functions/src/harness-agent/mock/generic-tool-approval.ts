import { HarnessAgent } from '@ai-sdk/harness/agent';
import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import type {
  HarnessV1,
  HarnessV1PromptControl,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { tool, type GenericToolApprovalFunction } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const zeroUsage: LanguageModelV4Usage = {
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

const script: HarnessV1StreamPart[] = [
  {
    type: 'tool-call',
    toolCallId: 'allowed-read',
    toolName: 'readPath',
    input: JSON.stringify({ path: 'public/readme.md' }),
  },
  {
    type: 'tool-call',
    toolCallId: 'denied-read',
    toolName: 'readPath',
    input: JSON.stringify({ path: 'private/secret.txt' }),
  },
  {
    type: 'finish-step',
    finishReason: { unified: 'stop', raw: 'script-complete' },
    usage: zeroUsage,
  },
  {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'script-complete' },
    totalUsage: zeroUsage,
  },
];

run(async () => {
  const submitted: Array<
    Parameters<HarnessV1PromptControl['submitToolResult']>[0]
  > = [];
  const session: HarnessV1Session = {
    sessionId: 'scripted-session',
    isResume: false,
    async doPromptTurn({ emit }) {
      queueMicrotask(() => {
        for (const event of script) emit(event);
      });
      return {
        submitToolResult: async result => {
          submitted.push(result);
        },
        done: Promise.resolve(),
      };
    },
    async doContinueTurn() {
      return {
        submitToolResult: async result => {
          submitted.push(result);
        },
        done: Promise.resolve(),
      };
    },
    async doCompact() {},
    async doDetach() {
      return {
        type: 'resume-session',
        harnessId: 'scripted',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
    async doStop() {
      return {
        type: 'resume-session',
        harnessId: 'scripted',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
    async doDestroy() {},
    async doSuspendTurn() {
      return {
        type: 'continue-turn',
        harnessId: 'scripted',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
  };
  const harness = {
    specificationVersion: 'harness-v1',
    harnessId: 'scripted',
    builtinTools: {},
    doStart: async () => session,
  } satisfies HarnessV1;
  const executed: string[] = [];
  const tools = {
    readPath: tool({
      description: 'Read a path within the permitted workspace.',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        executed.push(path);
        return { path, content: 'example content' };
      },
    }),
  };
  const toolApproval: GenericToolApprovalFunction<
    typeof tools,
    {},
    Record<string, unknown>
  > = async ({ toolCall }) => {
    if (toolCall.dynamic || toolCall.toolName !== 'readPath') {
      return { type: 'denied', reason: 'unknown host tool' };
    }
    return toolCall.input.path.startsWith('public/')
      ? 'approved'
      : { type: 'denied', reason: 'path is outside public/' };
  };
  const agent = new HarnessAgent({
    harness,
    sandbox: createJustBashSandbox(),
    tools,
    toolApproval,
  });
  const agentSession = await agent.createSession();

  try {
    await agent.generate({
      session: agentSession,
      prompt: 'Read the requested paths.',
    });
  } finally {
    await agentSession.destroy();
  }

  const denied = submitted.find(result => result.toolCallId === 'denied-read');
  if (
    executed.length !== 1 ||
    executed[0] !== 'public/readme.md' ||
    typeof denied?.output !== 'object' ||
    denied.output == null ||
    !('type' in denied.output) ||
    denied.output.type !== 'execution-denied'
  ) {
    throw new Error('Generic host-tool approval policy was not applied.');
  }

  console.log({ executed, submitted });
});
