import { HarnessAgent } from '@ai-sdk/harness/agent';
import {
  createACPHandoffSandbox,
  getACPHandoffArguments,
  readACPContinueHandoffState,
  removeACPHandoffState,
  writeACPHandoffState,
} from '../../lib/codex-acp-handoff';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const exampleName =
  'examples/ai-functions/src/harness-agent/codex-acp/live-native-approval-handoff.ts';

run(async () => {
  const { phase, statePath } = getACPHandoffArguments({
    exampleName,
    defaultStatePath: '/tmp/ai-sdk-acp-native-approval.json',
  });
  let assertApprovedFile: (() => Promise<void>) | undefined;
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createACPHandoffSandbox(),
    sandboxConfig: {
      onSession: async ({ session, sessionWorkDir }) => {
        assertApprovedFile = async () => {
          const content = await session.readTextFile({
            path: `${sessionWorkDir}/live-approval.txt`,
          });
          if (content !== 'approved handoff') {
            throw new Error(
              `Expected live-approval.txt to contain "approved handoff", received ${JSON.stringify(content)}.`,
            );
          }
        };
      },
    },
    permissionMode: 'allow-reads',
  });

  if (phase === 'start') {
    const session = await agent.createSession();
    let suspended = false;
    try {
      const result = await agent.stream({
        session,
        prompt:
          'Create `live-approval.txt` containing exactly `approved handoff`. Request native permission and do not use a host MCP tool.',
      });
      await printFullStream({ result });
      const state = await session.suspendTurn();
      suspended = true;
      const approval = state.pendingToolApprovals?.[0];
      if (approval == null) {
        throw new Error('Expected a serialized pending native approval.');
      }
      await writeACPHandoffState({
        statePath,
        sessionId: session.sessionId,
        state,
      });
      console.log(
        `Saved pending native approval ${approval.approvalId} to ${statePath}.`,
      );
      process.exit(0);
    } finally {
      if (!suspended) await session.destroy();
    }
    return;
  }

  const handoff = await readACPContinueHandoffState({ statePath });
  const approval = handoff.state.pendingToolApprovals?.[0];
  if (approval == null) {
    throw new Error('Expected a pending native approval in handoff state.');
  }
  const session = await agent.createSession({
    sessionId: handoff.sessionId,
    continueFrom: handoff.state,
  });
  try {
    const result = await agent.continueStream({
      session,
      toolApprovalContinuations: [
        {
          approvalResponse: {
            type: 'tool-approval-response',
            approvalId: approval.approvalId,
            approved: true,
          },
          toolCall: {
            type: 'tool-call',
            toolCallId: approval.toolCallId,
            toolName: approval.toolName,
            input: approval.input,
            ...(approval.providerExecuted !== undefined
              ? { providerExecuted: approval.providerExecuted }
              : {}),
          },
        },
      ],
    });
    await printFullStream({ result });
    if (assertApprovedFile == null) {
      throw new Error('The sandbox session hook did not run.');
    }
    await assertApprovedFile();
    console.log('Verified live-approval.txt through the sandbox API.');
  } finally {
    await session.destroy();
  }
  await removeACPHandoffState({ statePath });
  process.exit(0);
});
