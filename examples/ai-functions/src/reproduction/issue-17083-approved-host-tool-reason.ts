import type {
  HarnessV1,
  HarnessV1ContinueTurnOptions,
  HarnessV1NetworkSandboxSession,
  HarnessV1PromptControl,
  HarnessV1SandboxProvider,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool } from 'ai';
import { z } from 'zod/v4';

const approvalReason = JSON.stringify({
  answers: { question_1: 'Use the corrected value' },
});

type ApprovalExecutionMetadata = {
  approvalId: string;
  approved: true;
  reason?: string;
};

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

function finishEvents(): HarnessV1StreamPart[] {
  return [
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
}

function makeSandboxSession(): HarnessV1NetworkSandboxSession {
  const run = async () => ({ exitCode: 0, stdout: '', stderr: '' });
  const session = {
    id: 'issue-17083-sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    run,
    stop: async () => {},
    destroy: async () => {},
    restricted: () => session,
  };
  return session as unknown as HarnessV1NetworkSandboxSession;
}

function makeSandboxProvider(): HarnessV1SandboxProvider {
  const session = makeSandboxSession();
  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'issue-17083-sandbox',
    createSession: async () => session,
    resumeSession: async () => session,
  };
}

function makeHarness(options: {
  builtinTools?: HarnessV1['builtinTools'];
  supportsBuiltinToolApprovals?: boolean;
}) {
  const toolResults: Array<{
    toolCallId: string;
    output: unknown;
    isError?: boolean;
  }> = [];
  const toolApprovals: Array<{
    approvalId: string;
    approved: boolean;
    reason?: string;
  }> = [];

  const createControl = (
    continuation: HarnessV1ContinueTurnOptions,
  ): HarnessV1PromptControl => {
    queueMicrotask(() => {
      for (const event of finishEvents()) {
        continuation.emit(event);
      }
    });

    return {
      submitToolResult: async input => {
        toolResults.push(input);
      },
      submitToolApproval: async input => {
        toolApprovals.push(input);
      },
      done: Promise.resolve(),
    };
  };

  const harness: HarnessV1 = {
    specificationVersion: 'harness-v1',
    harnessId: 'issue-17083',
    builtinTools: options.builtinTools ?? {},
    supportsBuiltinToolApprovals: options.supportsBuiltinToolApprovals,
    doStart: async startOptions => {
      const session: HarnessV1Session = {
        sessionId: startOptions.sessionId,
        isResume: startOptions.continueFrom != null,
        doPromptTurn: async prompt => createControl(prompt),
        doContinueTurn: async continuation => createControl(continuation),
        doCompact: async () => {},
        doSuspendTurn: async () => ({
          type: 'continue-turn',
          harnessId: 'issue-17083',
          specificationVersion: 'harness-v1',
          data: {},
        }),
        doDetach: async () => ({
          type: 'resume-session',
          harnessId: 'issue-17083',
          specificationVersion: 'harness-v1',
          data: {},
        }),
        doStop: async () => ({
          type: 'resume-session',
          harnessId: 'issue-17083',
          specificationVersion: 'harness-v1',
          data: {},
        }),
        doDestroy: async () => {},
      };
      return session;
    },
  };

  return { harness, toolResults, toolApprovals };
}

async function consume(
  stream: AsyncIterable<{ type: string; [key: string]: unknown }>,
) {
  const parts: Array<{ type: string; [key: string]: unknown }> = [];
  for await (const part of stream) {
    parts.push(part);
  }
  return parts;
}

async function verifyDeniedHostReason() {
  const { harness, toolResults } = makeHarness({});
  let executions = 0;
  const agent = new HarnessAgent({
    harness,
    sandbox: makeSandboxProvider(),
    tools: {
      ask_user_question: tool({
        inputSchema: z.object({ question: z.string() }),
        execute: async () => {
          executions += 1;
          return { unexpected: true };
        },
      }),
    },
  });
  const session = await agent.createSession({
    continueFrom: {
      type: 'continue-turn',
      harnessId: 'issue-17083',
      specificationVersion: 'harness-v1',
      data: {},
      pendingToolApprovals: [
        {
          approvalId: 'approval-denied',
          toolCallId: 'call-denied',
          toolName: 'ask_user_question',
          input: JSON.stringify({ question: 'Proceed?' }),
          kind: 'custom',
        },
      ],
    },
  });

  const result = await agent.continueStream({
    session,
    toolApprovalContinuations: [
      {
        type: 'tool-approval-response',
        approvalId: 'approval-denied',
        approved: false,
        reason: approvalReason,
      },
    ],
  });
  await consume(result.fullStream);
  await session.destroy();

  if (executions !== 0) {
    throw new Error('Denied host tool executed unexpectedly.');
  }
  if (
    JSON.stringify(toolResults[0]?.output) !==
    JSON.stringify({ type: 'execution-denied', reason: approvalReason })
  ) {
    throw new Error('Denied host tool did not forward its approval reason.');
  }
}

async function verifyBuiltinReason() {
  const { harness, toolApprovals } = makeHarness({
    builtinTools: {
      bash: tool({
        inputSchema: z.object({ command: z.string() }),
      }),
    },
    supportsBuiltinToolApprovals: true,
  });
  const agent = new HarnessAgent({
    harness,
    sandbox: makeSandboxProvider(),
  });
  const session = await agent.createSession({
    continueFrom: {
      type: 'continue-turn',
      harnessId: 'issue-17083',
      specificationVersion: 'harness-v1',
      data: {},
      pendingToolApprovals: [
        {
          approvalId: 'approval-builtin',
          toolCallId: 'call-builtin',
          toolName: 'bash',
          input: JSON.stringify({ command: 'pwd' }),
          kind: 'builtin',
          providerExecuted: true,
        },
      ],
    },
  });

  const result = await agent.continueStream({
    session,
    toolApprovalContinuations: [
      {
        type: 'tool-approval-response',
        approvalId: 'approval-builtin',
        approved: true,
        reason: approvalReason,
      },
    ],
  });
  await consume(result.fullStream);
  await session.destroy();

  if (
    JSON.stringify(toolApprovals[0]) !==
    JSON.stringify({
      approvalId: 'approval-builtin',
      approved: true,
      reason: approvalReason,
    })
  ) {
    throw new Error('Built-in tool did not forward its approval reason.');
  }
}

async function reproduceApprovedHostReasonLoss() {
  const { harness, toolResults } = makeHarness({});
  let executionApproval: ApprovalExecutionMetadata | undefined;
  const agent = new HarnessAgent({
    harness,
    sandbox: makeSandboxProvider(),
    tools: {
      ask_user_question: tool({
        inputSchema: z.object({ question: z.string() }),
        execute: async (_input, options) => {
          executionApproval = (
            options as typeof options & {
              approval?: ApprovalExecutionMetadata;
            }
          ).approval;
          return {
            answerFromApproval: executionApproval?.reason ?? null,
          };
        },
      }),
    },
  });
  const session = await agent.createSession({
    continueFrom: {
      type: 'continue-turn',
      harnessId: 'issue-17083',
      specificationVersion: 'harness-v1',
      data: {},
      pendingToolApprovals: [
        {
          approvalId: 'approval-approved',
          toolCallId: 'call-approved',
          toolName: 'ask_user_question',
          input: JSON.stringify({ question: 'What value should be used?' }),
          kind: 'custom',
        },
      ],
    },
  });

  const result = await agent.continueStream({
    session,
    toolApprovalContinuations: [
      {
        type: 'tool-approval-response',
        approvalId: 'approval-approved',
        approved: true,
        reason: approvalReason,
      },
    ],
  });
  const parts = await consume(result.fullStream);
  await session.destroy();

  const recordedResponse = parts.find(
    part =>
      part.type === 'tool-approval-response' &&
      part.approvalId === 'approval-approved',
  );
  if (recordedResponse?.reason !== approvalReason) {
    throw new Error(
      'Approved host approval reason was not retained in the transcript.',
    );
  }
  if (toolResults.length !== 1) {
    throw new Error('Approved host tool did not submit exactly one result.');
  }

  const expectedModelVisibleOutput = {
    answerFromApproval: approvalReason,
  };
  if (
    JSON.stringify(toolResults[0]?.output) !==
    JSON.stringify(expectedModelVisibleOutput)
  ) {
    throw new Error(
      `ISSUE_17083_REPRODUCED: approved host tool result omitted approval reason; execute received ${JSON.stringify(
        executionApproval,
      )} and the model received ${JSON.stringify(toolResults[0]?.output)}`,
    );
  }
}

async function main() {
  await verifyDeniedHostReason();
  await verifyBuiltinReason();
  await reproduceApprovedHostReasonLoss();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
