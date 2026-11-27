import assert from 'node:assert/strict';
import type {
  HarnessV1,
  HarnessV1PromptTurnOptions,
  HarnessV1ResumeSessionState,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import type { JSONValue } from '@ai-sdk/provider';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { tool } from 'ai';
import { z } from 'zod/v4';

// General HarnessAgent behavior: the issue specifies a scripted runtime, not
// a particular provider adapter. No external service or credentials are needed.
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const stop = { unified: 'stop', raw: 'end_turn' } as const;
const lifecycleState: HarnessV1ResumeSessionState = {
  type: 'resume-session',
  specificationVersion: 'harness-v1',
  harnessId: 'scripted',
  data: {},
};
const sandboxSession: Experimental_SandboxSession & {
  id: string;
  defaultWorkingDirectory: string;
} = {
  description: 'In-memory stub; the host tool does not access the sandbox.',
  id: 'stub',
  defaultWorkingDirectory: '/work',
  run: async () => ({ exitCode: 0, stdout: '/work\n', stderr: '' }),
  readTextFile: async () => null,
  writeTextFile: async () => {},
  readFile: async () => null,
  readBinaryFile: async () => null,
  writeFile: async () => {},
  writeBinaryFile: async () => {},
  stat: async () => null,
  listDirectory: async () => null,
  deleteFile: async () => false,
  spawn: async () => {
    throw new Error('unused sandbox spawn');
  },
};
type Scenario =
  | 'throw'
  | 'throw-origin-omitted'
  | 'approved-throw'
  | 'success'
  | 'success-error-echo'
  | 'provider-error'
  | 'unknown-error';

async function run(scenario: Scenario) {
  const approved = scenario === 'approved-throw';
  const external =
    scenario === 'provider-error' || scenario === 'unknown-error';
  const shouldThrow = scenario.includes('throw');
  let executions = 0;
  const callbackTypes: string[] = [];
  const submissions: unknown[] = [];
  const redactedErrors: unknown[] = [];

  const start = async ({ emit }: Pick<HarnessV1PromptTurnOptions, 'emit'>) => {
    let finishTurn!: () => void;
    const done = new Promise<void>(resolve => {
      finishTurn = resolve;
    });
    const finish = (output: unknown, isError: boolean) => {
      emit({
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'lookup',
        result: output as NonNullable<JSONValue>,
        isError,
      });
      emit({
        type: 'finish-step',
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
        usage,
      });
      emit({ type: 'text-start', id: 'answer' });
      emit({ type: 'text-delta', id: 'answer', delta: 'Done.' });
      emit({ type: 'text-end', id: 'answer' });
      emit({ type: 'finish-step', finishReason: stop, usage });
      emit({ type: 'finish', finishReason: stop, totalUsage: usage });
      finishTurn();
    };
    emit({ type: 'stream-start' });
    if (!approved && scenario !== 'unknown-error') {
      emit({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'lookup',
        input: JSON.stringify({ id: 'D-2' }),
        ...(scenario === 'throw-origin-omitted'
          ? {}
          : { providerExecuted: external }),
      });
    }
    if (external) {
      setTimeout(() => finish('runtime failure', true), 0);
    }
    return {
      submitToolResult: async (submission: {
        toolCallId: string;
        output: unknown;
        isError?: boolean;
      }) => {
        submissions.push(submission);
        // Echo the actual host submission, including its error mark.
        setTimeout(
          () =>
            finish(
              submission.output,
              submission.isError === true || scenario === 'success-error-echo',
            ),
          0,
        );
      },
      done,
    };
  };
  const harness: HarnessV1 = {
    specificationVersion: 'harness-v1',
    harnessId: 'scripted',
    builtinTools: {},
    doStart: async ({ sessionId }) => ({
      sessionId,
      isResume: approved,
      doPromptTurn: start,
      doContinueTurn: start,
      doSuspendTurn: async () => {
        throw new Error('unused');
      },
      doCompact: async () => {},
      doDetach: async () => lifecycleState,
      doStop: async () => lifecycleState,
      doDestroy: async () => {},
    }),
  };
  const agent = new HarnessAgent({
    harness,
    tools: {
      lookup: tool({
        inputSchema: z.object({ id: z.string() }),
        execute: async ({ id }) => {
          executions++;
          if (shouldThrow) throw new Error(`Document ${id} was not found`);
          return { found: true };
        },
      }),
    },
    onToolExecutionEnd: event => {
      callbackTypes.push(event.toolOutput.type);
    },
  });
  const session = await agent.createSession({
    sandboxSession,
    ...(approved
      ? {
          continueFrom: {
            type: 'continue-turn' as const,
            specificationVersion: 'harness-v1' as const,
            harnessId: 'scripted',
            data: {},
            pendingToolApprovals: [
              {
                approvalId: 'approval-1',
                toolCallId: 'call-1',
                toolName: 'lookup',
                input: '{"id":"D-2"}',
                kind: 'custom' as const,
                providerExecuted: false,
              },
            ],
          },
        }
      : {}),
  });
  try {
    const result = approved
      ? await agent.continueStream({
          session,
          toolApprovalContinuations: [
            {
              type: 'tool-approval-response',
              approvalId: 'approval-1',
              approved: true,
            },
          ],
        })
      : await agent.stream({ session, prompt: 'Who can open D-2?' });
    const uiPromise = (async () => {
      const chunks = [];
      for await (const chunk of result.toUIMessageStream({
        redactToolErrors: true,
        onError: error => {
          redactedErrors.push(error);
          return 'REDACTED';
        },
      })) {
        chunks.push(chunk);
      }
      return chunks;
    })();
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    const ui = await uiPromise;
    const steps = await result.steps;
    assert.equal(await result.text, 'Done.', `${scenario}: turn must finish`);
    assert.equal(executions, external ? 0 : 1);
    if (!external) {
      assert.deepEqual(callbackTypes, [
        shouldThrow ? 'tool-error' : 'tool-result',
      ]);
    }
    assert.ok(!parts.some(part => part.type === 'error'));
    const terminal = parts.filter(
      part => part.type === 'tool-result' || part.type === 'tool-error',
    );
    const uiTerminal = ui.filter(
      chunk =>
        chunk.type === 'tool-output-available' ||
        chunk.type === 'tool-output-error',
    );
    console.log(
      JSON.stringify({
        scenario,
        callbackTypes,
        submissions,
        terminal,
        uiTerminal,
        stepContent: steps.flatMap(step =>
          step.content.filter(
            part => part.type === 'tool-result' || part.type === 'tool-error',
          ),
        ),
        stepToolResults: steps.flatMap(step => step.toolResults),
        redactionCalls: redactedErrors.length,
      }),
    );
    return { terminal, uiTerminal, steps, redactedErrors };
  } finally {
    await session.destroy();
  }
}

async function main() {
  const failures: string[] = [];
  for (const scenario of [
    'throw',
    'throw-origin-omitted',
    'approved-throw',
    'success',
    'success-error-echo',
    'provider-error',
    'unknown-error',
  ] as const) {
    const { terminal, uiTerminal, steps, redactedErrors } = await run(scenario);
    if (scenario.includes('throw')) {
      // Primary assertions: one failed outcome, matching the host callback,
      // both in public streams and in the completed steps, with UI redaction.
      const errors = terminal.filter(part => part.type === 'tool-error');
      const uiErrors = uiTerminal.filter(
        part => part.type === 'tool-output-error',
      );
      if (
        terminal.length !== 1 ||
        errors.length !== 1 ||
        errors[0]?.providerExecuted === true ||
        uiTerminal.length !== 1 ||
        uiErrors.length !== 1 ||
        uiErrors[0]?.errorText !== 'REDACTED' ||
        redactedErrors.length !== 1 ||
        JSON.stringify(uiTerminal).includes('Document D-2') ||
        steps.flatMap(step => step.toolResults).length !== 0 ||
        (scenario !== 'approved-throw' &&
          steps.flatMap(step =>
            step.content.filter(part => part.type === 'tool-error'),
          ).length !== 1)
      ) {
        failures.push(scenario);
      }
    } else if (scenario.startsWith('success')) {
      assert.equal(terminal.length, 1, scenario);
      assert.equal(terminal[0].type, 'tool-result', scenario);
      assert.equal(uiTerminal[0]?.type, 'tool-output-available', scenario);
      assert.equal(steps.flatMap(step => step.toolResults).length, 1, scenario);
    } else {
      assert.equal(terminal.length, 1, scenario);
      assert.equal(terminal[0].type, 'tool-error', scenario);
      assert.equal(terminal[0].providerExecuted, true, scenario);
      assert.equal(uiTerminal[0]?.type, 'tool-output-error', scenario);
      assert.equal(redactedErrors.length, 0, scenario);
    }
  }
  assert.equal(
    failures.length,
    0,
    `ISSUE-25194: failed host tool is not exposed as a redacted tool error (${failures.join(', ')})`,
  );
  console.log('All host tool outcome and redaction invariants passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
