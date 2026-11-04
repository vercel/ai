import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createCursor } from './_create';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const cursor = createCursor();

/*
 * Demonstrates that a HarnessAgent's `fullStream` exposes both the harness's
 * built-in tool calls (Cursor's `Bash`/`Read`/…) and user-defined tool
 * calls under a single, fully-typed union. The `toolName` field narrows to
 * the known names; the `input` field narrows per tool to the declared
 * schema. No casts.
 */
run(async () => {
  const today = tool({
    description: 'Return the current date in ISO format.',
    inputSchema: z.object({}),
    execute: async () => ({ iso: new Date().toISOString().slice(0, 10) }),
  });

  const agent = new HarnessAgent({
    harness: cursor,
    tools: { today },
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.stream({
      session,
      prompt:
        'Use the `today` tool, then create a file `notes.md` containing the date you got back.',
    });

    await printFullStream({ result });
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
