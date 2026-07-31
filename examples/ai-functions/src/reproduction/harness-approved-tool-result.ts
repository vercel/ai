import type {
  HarnessV1,
  HarnessV1ContinueTurnState,
  HarnessV1PromptControl,
  HarnessV1ResumeSessionState,
  HarnessV1Session,
} from '@ai-sdk/harness';
import {
  HarnessAgent,
  type HarnessAgentToolApprovalContinuation,
} from '@ai-sdk/harness/agent';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { tool } from 'ai';
import { z } from 'zod';

const continueState: HarnessV1ContinueTurnState = {
  type: 'continue-turn',
  harnessId: 'approval-reproduction',
  specificationVersion: 'harness-v1',
  data: {},
};

const resumeState: HarnessV1ResumeSessionState = {
  type: 'resume-session',
  harnessId: 'approval-reproduction',
  specificationVersion: 'harness-v1',
  data: {},
};

async function main() {
  const submittedResults: unknown[] = [];
  const control: HarnessV1PromptControl = {
    submitToolResult: result => {
      submittedResults.push(result);
      return Promise.resolve();
    },
    done: Promise.resolve(),
  };
  const adapterSession: HarnessV1Session = {
    sessionId: 'approval-reproduction-session',
    isResume: false,
    doPromptTurn: ({ emit }) => {
      queueMicrotask(() => {
        emit({
          type: 'tool-call',
          toolCallId: 'weather-call',
          toolName: 'weather',
          input: JSON.stringify({ city: 'New York' }),
        });
      });
      return Promise.resolve(control);
    },
    doContinueTurn: () => Promise.resolve(control),
    doCompact: () => Promise.resolve(),
    doSuspendTurn: () => Promise.resolve(continueState),
    doDetach: () => Promise.resolve(resumeState),
    doStop: () => Promise.resolve(resumeState),
    doDestroy: () => Promise.resolve(),
  };
  const harness: HarnessV1 = {
    specificationVersion: 'harness-v1',
    harnessId: 'approval-reproduction',
    builtinTools: {},
    doStart: () => Promise.resolve(adapterSession),
  };
  const agent = new HarnessAgent({
    harness,
    tools: {
      weather: tool({
        description: 'Get weather',
        inputSchema: z.object({ city: z.string() }),
        execute: ({ city }) => ({ city, temperature: 72 }),
      }),
    },
    toolApproval: { weather: 'user-approval' },
    sandbox: createJustBashSandbox(),
  });
  const session = await agent.createSession({
    sessionId: adapterSession.sessionId,
  });

  try {
    const initial = await agent.stream({
      session,
      prompt: 'Check the weather',
    });
    let continuation: HarnessAgentToolApprovalContinuation | undefined;
    for await (const part of initial.fullStream) {
      if (part.type !== 'tool-approval-request') continue;
      continuation = {
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: part.approvalId,
          approved: true,
        },
        toolCall: {
          type: 'tool-call',
          toolCallId: part.toolCall.toolCallId,
          toolName: part.toolCall.toolName,
          input: part.toolCall.input,
          ...(part.toolCall.providerExecuted === undefined
            ? {}
            : { providerExecuted: part.toolCall.providerExecuted }),
        },
      };
    }
    if (continuation == null) {
      throw new Error('Setup failed: expected a tool approval request');
    }

    const resumed = await agent.continueStream({
      session,
      toolApprovalContinuations: [continuation],
    });
    const parts = [];
    for await (const part of resumed.fullStream) {
      parts.push(part);
    }

    const expectedSubmission = JSON.stringify({
      toolCallId: 'weather-call',
      output: { city: 'New York', temperature: 72 },
    });
    if (
      submittedResults.length !== 1 ||
      JSON.stringify(submittedResults[0]) !== expectedSubmission
    ) {
      throw new Error(
        `Setup failed: unexpected submitted results ${JSON.stringify(submittedResults)}`,
      );
    }

    const finalResults = parts.filter(
      part =>
        part.type === 'tool-result' &&
        part.toolCallId === 'weather-call' &&
        JSON.stringify(part.output) ===
          JSON.stringify({ city: 'New York', temperature: 72 }),
    );
    if (finalResults.length !== 1) {
      throw new Error(
        `ISSUE #18254: approved host tool result was submitted, but continued fullStream emitted ${finalResults.length} final tool-result events; part types: ${parts.map(part => part.type).join(', ')}`,
      );
    }
  } finally {
    await session.destroy();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
