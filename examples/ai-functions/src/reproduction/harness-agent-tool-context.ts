import type {
  HarnessV1,
  HarnessV1NetworkSandboxSession,
  HarnessV1PromptControl,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const EXPECTED_USER_ID = 'u1';
const FAILURE_SIGNAL =
  'ISSUE_21075_REPRODUCED: HarnessAgent host tool did not receive request-scoped context';

function zeroUsage() {
  return {
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
}

async function main() {
  const receivedContexts: unknown[] = [];
  let submittedResult:
    | {
        toolCallId: string;
        output: unknown;
        isError?: boolean;
      }
    | undefined;

  const probe = tool({
    inputSchema: z.object({ value: z.string() }),
    contextSchema: z.object({ userId: z.string() }),
    execute: async ({ value }, { context }) => {
      receivedContexts.push(context);
      return { value, userId: context.userId };
    },
  });

  const streamTextResult = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'stream-text-probe-call',
            toolName: 'probe',
            input: JSON.stringify({ value: 'hello' }),
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_use' },
            usage: zeroUsage(),
          },
        ]),
      }),
    }),
    tools: { probe },
    toolsContext: { probe: { userId: EXPECTED_USER_ID } },
    prompt: 'Call probe with value "hello".',
  });
  for await (const _part of streamTextResult.fullStream) {
    // Drain the stream so the host tool executes.
  }

  const streamTextContext = receivedContexts.shift();
  if (
    (streamTextContext as { userId?: unknown } | undefined)?.userId !==
    EXPECTED_USER_ID
  ) {
    throw new Error(
      'Reproduction setup failed: streamText did not forward toolsContext.',
    );
  }

  const events: HarnessV1StreamPart[] = [
    {
      type: 'tool-call',
      toolCallId: 'probe-call',
      toolName: 'probe',
      input: JSON.stringify({ value: 'hello' }),
    },
    {
      type: 'finish-step',
      finishReason: { unified: 'tool-calls', raw: 'tool_use' },
      usage: zeroUsage(),
    },
    {
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: 'tool_use' },
      totalUsage: zeroUsage(),
    },
  ];

  const lifecycleState = {
    type: 'resume-session' as const,
    harnessId: 'issue-21075',
    specificationVersion: 'harness-v1' as const,
    data: {},
  };
  const continueState = {
    type: 'continue-turn' as const,
    harnessId: 'issue-21075',
    specificationVersion: 'harness-v1' as const,
    data: {},
  };

  const harnessSession: HarnessV1Session = {
    sessionId: 'issue-21075-session',
    isResume: false,
    async doPromptTurn(options) {
      const control: HarnessV1PromptControl = {
        async submitToolResult(result) {
          submittedResult = result;
        },
        done: Promise.resolve(),
      };

      queueMicrotask(() => {
        for (const event of events) {
          options.emit(event);
        }
      });

      return control;
    },
    async doContinueTurn() {
      throw new Error('Continuation is not used by this reproduction.');
    },
    async doCompact() {},
    async doDetach() {
      return lifecycleState;
    },
    async doStop() {
      return lifecycleState;
    },
    async doDestroy() {},
    async doSuspendTurn() {
      return continueState;
    },
  };

  const harness = {
    specificationVersion: 'harness-v1',
    harnessId: 'issue-21075',
    builtinTools: {},
    async doStart() {
      return harnessSession;
    },
  } satisfies HarnessV1;

  const restrictedSandbox = {
    description: 'Minimal in-memory sandbox for issue #21075',
    async run() {
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  };
  const sandboxSession = {
    ...restrictedSandbox,
    id: 'issue-21075-sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    async getPortEndpoint() {
      return { url: 'ws://example.test' };
    },
    async getPortUrl() {
      return 'ws://example.test';
    },
    async stop() {},
    async destroy() {},
    restricted() {
      return restrictedSandbox;
    },
  } as unknown as HarnessV1NetworkSandboxSession;
  const sandbox = {
    specificationVersion: 'harness-sandbox-v1' as const,
    providerId: 'issue-21075-sandbox',
    async createSession() {
      return sandboxSession;
    },
    async resumeSession() {
      return sandboxSession;
    },
  };

  type RequestOptions = { userId: string };
  const tools = { probe };
  const agent = new HarnessAgent<
    typeof harness,
    typeof tools,
    Record<string, never>,
    never,
    RequestOptions
  >({
    harness,
    sandbox,
    tools,
    callOptionsSchema: z.object({ userId: z.string() }),
    prepareCall: ({ options, ...rest }) =>
      ({
        ...rest,
        toolsContext: {
          probe: { userId: options.userId },
        },
      }) as typeof rest & {
        toolsContext: { probe: { userId: string } };
      },
  });

  const session = await agent.createSession({
    sessionId: 'issue-21075-session',
  });

  let stepToolsContext: unknown;
  try {
    const result = await agent.generate({
      session,
      prompt: 'Call probe with value "hello".',
      options: { userId: EXPECTED_USER_ID },
    });
    stepToolsContext = result.steps[0]?.toolsContext;
  } finally {
    await session.destroy();
  }

  const output = submittedResult?.output as
    | { value?: unknown; userId?: unknown }
    | undefined;
  const harnessContext = receivedContexts.shift();
  if (
    harnessContext == null ||
    submittedResult?.isError === true ||
    output?.userId !== EXPECTED_USER_ID
  ) {
    console.error(FAILURE_SIGNAL);
    console.error(
      JSON.stringify(
        {
          expectedContext: { userId: EXPECTED_USER_ID },
          streamTextContext,
          harnessContext,
          stepToolsContext,
          submittedResult,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.log('HarnessAgent forwarded and exposed the expected tool context.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
