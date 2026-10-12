import assert from 'node:assert/strict';
import {
  HarnessAgent,
  type HarnessAgentAdapter,
  type HarnessAgentStreamPart,
} from '@ai-sdk/harness/agent';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 2, text: 1, reasoning: 1 },
};
const finishReason = { unified: 'stop', raw: 'stop' } as const;
const events: HarnessAgentStreamPart[] = [
  {
    type: 'tool-call',
    toolCallId: 'native1',
    toolName: 'nativeLookup',
    input: '{"query":"sample"}',
    providerExecuted: true,
    dynamic: true,
  },
  {
    type: 'tool-result',
    toolCallId: 'native1',
    toolName: 'nativeLookup',
    result: 'found',
    dynamic: true,
  },
  { type: 'finish-step', finishReason, usage },
  { type: 'finish', finishReason, totalUsage: usage },
];

async function main() {
  const harness = {
    specificationVersion: 'harness-v1',
    harnessId: 'issue-23048',
    builtinTools: {},
    async doStart() {
      return {
        sessionId: 'mock-session',
        isResume: false,
        async doPromptTurn({
          emit,
        }: {
          emit: (event: HarnessAgentStreamPart) => void;
        }) {
          const done = Promise.resolve().then(() => {
            for (const event of events) emit(event);
          });
          return {
            done,
            async submitToolResult() {},
            async submitToolApproval() {},
          };
        },
        async doDestroy() {},
      };
    },
  } as unknown as HarnessAgentAdapter;

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
    restricted() {
      return this;
    },
  } as unknown as SandboxSession;

  const agent = new HarnessAgent({ harness });
  const session = await agent.createSession({ sandboxSession });
  const result = await agent.stream({ session, prompt: 'Test' });
  const parts = [];

  for await (const part of result.fullStream) {
    parts.push(part);
  }

  const call = parts.find(part => part.type === 'tool-call');
  const streamedResult = parts.find(part => part.type === 'tool-result');
  const accumulatedResult = (await result.toolResults)[0];
  const responseMessages = await result.responseMessages;

  await session.destroy();

  assert.ok(
    call?.type === 'tool-call',
    'control: native tool call was emitted',
  );
  assert.deepEqual(
    {
      input: call.input,
      providerExecuted: call.providerExecuted,
    },
    {
      input: { query: 'sample' },
      providerExecuted: true,
    },
    'control: native tool call retained its parsed input and execution origin',
  );
  assert.ok(
    streamedResult?.type === 'tool-result',
    'control: successful native tool result was streamed',
  );
  assert.equal(
    streamedResult.output,
    'found',
    'control: streamed native result retained its output',
  );
  assert.equal(
    accumulatedResult?.output,
    'found',
    'control: accumulated native result retained its output',
  );

  const assistantMessage = responseMessages.find(
    message => message.role === 'assistant',
  );
  const hostToolMessage = responseMessages.find(
    message => message.role === 'tool',
  );
  const assistantContainsNativeResult =
    assistantMessage != null &&
    Array.isArray(assistantMessage.content) &&
    assistantMessage.content.some(
      part =>
        part.type === 'tool-result' && part.toolCallId === call.toolCallId,
    );
  const hostToolMessageContainsNativeResult =
    hostToolMessage?.content.some(
      part =>
        part.type === 'tool-result' && part.toolCallId === call.toolCallId,
    ) ?? false;

  assert.deepEqual(
    {
      streamedResult: {
        input: streamedResult.input,
        providerExecuted: streamedResult.providerExecuted,
      },
      accumulatedResult: {
        input: accumulatedResult?.input,
        providerExecuted: accumulatedResult?.providerExecuted,
      },
      responsePlacement: {
        assistantContainsNativeResult,
        hostToolMessageContainsNativeResult,
      },
    },
    {
      streamedResult: {
        input: { query: 'sample' },
        providerExecuted: true,
      },
      accumulatedResult: {
        input: { query: 'sample' },
        providerExecuted: true,
      },
      responsePlacement: {
        assistantContainsNativeResult: true,
        hostToolMessageContainsNativeResult: false,
      },
    },
    'ISSUE_23048: successful native tool result lost its input/execution origin or was placed in a host tool message',
  );
}

await main();
