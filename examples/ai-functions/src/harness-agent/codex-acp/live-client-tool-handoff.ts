import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool } from 'ai';
import { z } from 'zod';
import {
  createACPHandoffSandbox,
  getACPHandoffArguments,
  readACPContinueHandoffState,
  removeACPHandoffState,
  writeACPHandoffState,
} from '../../lib/codex-acp-handoff';
import { createCodexACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const exampleName =
  'examples/ai-functions/src/harness-agent/codex-acp/live-client-tool-handoff.ts';

run(async () => {
  const { phase, statePath } = getACPHandoffArguments({
    exampleName,
    defaultStatePath: '/tmp/ai-sdk-acp-client-tool.json',
  });
  const getHandoffCode = tool({
    description: 'Ask the client process for the handoff code.',
    inputSchema: z.object({}),
  });
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createACPHandoffSandbox(),
    tools: { getHandoffCode },
  });

  if (phase === 'start') {
    const session = await agent.createSession();
    let suspended = false;
    try {
      const result = await agent.stream({
        session,
        prompt:
          'Use the getHandoffCode tool exactly once, then report its code.',
      });
      await printFullStream({ result });
      const state = await session.suspendTurn();
      suspended = true;
      const pendingResult = state.pendingToolResults?.[0];
      if (pendingResult == null) {
        throw new Error('Expected a serialized pending client-tool result.');
      }
      await writeACPHandoffState({
        statePath,
        sessionId: session.sessionId,
        state,
      });
      console.log(
        `Saved pending client-tool call ${pendingResult.toolCallId} to ${statePath}.`,
      );
      process.exit(0);
    } finally {
      if (!suspended) await session.destroy();
    }
    return;
  }

  const handoff = await readACPContinueHandoffState({ statePath });
  const pendingResult = handoff.state.pendingToolResults?.[0];
  if (pendingResult == null) {
    throw new Error('Expected a pending client-tool result in handoff state.');
  }
  const session = await agent.createSession({
    sessionId: handoff.sessionId,
    continueFrom: handoff.state,
  });
  try {
    const result = await agent.continueStream({
      session,
      toolResultContinuations: [
        {
          toolCallId: pendingResult.toolCallId,
          output: { code: 'CLIENT-HANDOFF-42' },
        },
      ],
    });
    await printFullStream({ result });
  } finally {
    await session.destroy();
  }
  await removeACPHandoffState({ statePath });
  process.exit(0);
});
