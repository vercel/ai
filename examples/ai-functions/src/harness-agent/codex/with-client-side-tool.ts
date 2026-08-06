import { HarnessAgent } from '@ai-sdk/harness/agent';
import { codex } from '@ai-sdk/harness-codex';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import * as readline from 'node:readline/promises';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const getUserName = tool({
    description: 'Ask the user to enter their name in the client.',
    inputSchema: z.object({}),
  });
  const agent = new HarnessAgent({
    harness: codex,
    sandbox,
    tools: { getUserName },
  });

  let exitCode = 0;
  let session = await agent.createSession();
  try {
    const first = await agent.stream({
      session,
      prompt:
        'Use the getUserName tool exactly once, then greet the user by name in one sentence.',
    });
    await printFullStream({ result: first });

    const toolCall = (await first.toolCalls).find(
      toolCall => toolCall.toolName === 'getUserName',
    );
    if (toolCall == null) {
      throw new Error('Expected a getUserName tool call.');
    }
    if (!session.hasUnfinishedTurn()) {
      throw new Error('Expected the turn to wait for a client tool result.');
    }

    const userName = (await terminal.question('Enter your name: ')).trim();
    if (userName.length === 0) {
      throw new Error('Expected the user to enter a name.');
    }

    const sessionId = session.sessionId;
    const continueFrom = await session.suspendTurn();
    if (
      !continueFrom.pendingToolResults?.some(
        pendingResult => pendingResult.toolCallId === toolCall.toolCallId,
      )
    ) {
      throw new Error('Expected serialized pending tool result state.');
    }

    session = await agent.createSession({ sessionId, continueFrom });
    const continued = await agent.continueStream({
      session,
      toolResultContinuations: [
        {
          toolCallId: toolCall.toolCallId,
          output: { name: userName },
        },
      ],
    });
    await printFullStream({ result: continued });

    if (session.hasUnfinishedTurn()) {
      throw new Error('Expected the continued turn to finish.');
    }
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    terminal.close();
    await session.destroy();
    process.exit(exitCode);
  }
});
