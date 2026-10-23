import {
  type HarnessV1,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1Session,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool } from 'ai';
import { z } from 'zod';

const FAILURE_SIGNAL =
  'ISSUE_23503: stream remained open after the built-in approval request and completed host tool execution';

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

function createSandboxSession(): HarnessV1NetworkSandboxSession {
  const run = async () => ({ exitCode: 0, stdout: '', stderr: '' });
  const restricted = {
    description: 'Minimal in-memory reproduction sandbox',
    run,
  };

  return {
    ...restricted,
    id: 'issue-23503-sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    getPortEndpoint: async () => ({ url: 'ws://example.test' }),
    getPortUrl: async () => 'ws://example.test',
    stop: async () => {},
    destroy: async () => {},
    restricted: () => restricted,
  } as unknown as HarnessV1NetworkSandboxSession;
}

async function main(): Promise<void> {
  let hostToolExecuted = false;
  let hostToolResultSubmitted = false;

  const bash = tool({
    inputSchema: z.object({ command: z.string() }),
  });

  const harness: HarnessV1<{ bash: typeof bash }> = {
    specificationVersion: 'harness-v1',
    harnessId: 'issue-23503-claude-code-sequence',
    builtinTools: { bash },
    supportsBuiltinToolApprovals: true,
    doStart: async startOptions => {
      if (startOptions.permissionMode !== 'allow-reads') {
        throw new Error('Reproduction requires permissionMode allow-reads.');
      }

      const session: HarnessV1Session = {
        sessionId: startOptions.sessionId,
        isResume: false,
        doPromptTurn: async (
          options: HarnessV1PromptTurnOptions,
        ): Promise<HarnessV1PromptControl> => {
          let resolveDone!: () => void;
          let settled = false;
          const done = new Promise<void>(resolve => {
            resolveDone = resolve;
          });
          const settle = () => {
            if (settled) return;
            settled = true;
            resolveDone();
          };

          options.abortSignal?.addEventListener(
            'abort',
            () => {
              options.emit({
                type: 'error',
                error: 'reproduction cleanup abort',
              });
              settle();
            },
            { once: true },
          );

          queueMicrotask(() => {
            const events: HarnessV1StreamPart[] = [
              { type: 'stream-start', modelId: 'claude-code-sequence' },
              {
                type: 'tool-call',
                toolCallId: 'bash-1',
                toolName: 'bash',
                nativeName: 'Bash',
                input: JSON.stringify({ command: 'pwd' }),
                providerExecuted: true,
              },
              {
                type: 'tool-call',
                toolCallId: 'host-1',
                toolName: 'listProjectTickets',
                input: JSON.stringify({}),
                providerExecuted: false,
              },
              {
                type: 'tool-approval-request',
                approvalId: 'bash-1',
                toolCallId: 'bash-1',
              },
              {
                type: 'finish-step',
                finishReason: {
                  unified: 'tool-calls',
                  raw: 'host-input',
                },
                usage: zeroUsage,
              },
            ];
            for (const event of events) options.emit(event);
          });

          return {
            async submitToolResult(submission) {
              if (submission.toolCallId !== 'host-1') {
                throw new Error(
                  `Unexpected host tool result for ${submission.toolCallId}.`,
                );
              }
              hostToolResultSubmitted = true;
              // Claude Code executes tool_use blocks sequentially. It cannot
              // invoke the MCP handler and echo this result until Bash is
              // approved, so this turn intentionally emits no tool-result.
            },
            async submitToolApproval() {
              throw new Error(
                'The first stream must pause before approval is submitted.',
              );
            },
            done,
          };
        },
        doContinueTurn: async () => {
          throw new Error('Continuation is not needed for this reproduction.');
        },
        doCompact: async () => {},
        doDetach: async () => ({
          type: 'resume-session',
          specificationVersion: 'harness-v1',
          harnessId: 'issue-23503-claude-code-sequence',
          data: {},
        }),
        doStop: async () => ({
          type: 'resume-session',
          specificationVersion: 'harness-v1',
          harnessId: 'issue-23503-claude-code-sequence',
          data: {},
        }),
        doDestroy: async () => {},
        doSuspendTurn: async () => ({
          type: 'continue-turn',
          specificationVersion: 'harness-v1',
          harnessId: 'issue-23503-claude-code-sequence',
          data: {},
        }),
      };
      return session;
    },
  };

  const listProjectTickets = tool({
    inputSchema: z.object({}),
    execute: async () => {
      hostToolExecuted = true;
      return [{ id: 'AI-23503', title: 'Approval deadlock' }];
    },
  });

  const agent = new HarnessAgent({
    harness,
    permissionMode: 'allow-reads',
    tools: { listProjectTickets },
    toolApproval: { listProjectTickets: 'approved' },
  });
  const session = await agent.createSession({
    sandboxSession: createSandboxSession(),
  });
  const abortController = new AbortController();

  try {
    const result = await agent.stream({
      session,
      prompt: 'Run Bash and list the project tickets in the same response.',
      abortSignal: abortController.signal,
    });

    let approvalRequestSeen = false;
    const consume = (async () => {
      for await (const part of result.fullStream) {
        if (
          part.type === 'tool-approval-request' &&
          part.toolCall.toolName === 'bash'
        ) {
          approvalRequestSeen = true;
        }
      }
    })();

    const outcome = await Promise.race([
      consume.then(() => 'completed' as const),
      new Promise<'timed-out'>(resolve =>
        setTimeout(() => resolve('timed-out'), 750),
      ),
    ]);

    if (!approvalRequestSeen) {
      throw new Error(
        'Reproduction setup failed: no Bash approval request was surfaced.',
      );
    }
    if (!hostToolExecuted) {
      throw new Error(
        'Reproduction setup failed: the host tool was not executed.',
      );
    }
    if (!hostToolResultSubmitted) {
      throw new Error(
        'Reproduction setup failed: the host tool result was not submitted.',
      );
    }
    if (outcome === 'timed-out') {
      throw new Error(FAILURE_SIGNAL);
    }
  } finally {
    abortController.abort();
    await session.destroy().catch(() => {});
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
