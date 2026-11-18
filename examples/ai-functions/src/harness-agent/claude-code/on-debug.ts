import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import type { SandboxChannelDebugEvent } from '@ai-sdk/harness/utils';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { createClaudeCode } from './_create';
import { run } from '../../lib/run';

run(async () => {
  const events: SandboxChannelDebugEvent[] = [];
  const agent = new HarnessAgent({
    harness: createClaudeCode({
      reconnect: { maxElapsedMs: 3000, initialDelayMs: 100, maxDelayMs: 500 },
      onDebug: event => {
        events.push(event);
        console.log('[onDebug]', event.event, event.lastSeenEventId);
      },
    }),
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
    const result = await agent.generate({
      session,
      prompt: 'Reply with the single word: ok',
    });
    console.log('turn:', result.text.trim());

    const killed = await sandboxSession.run({
      command: 'pkill -f bridge.mjs',
    });
    console.log('killed bridge, exit code:', killed.exitCode);

    await new Promise(resolve => setTimeout(resolve, 8000));

    console.log(
      'events:',
      events.map(event => event.event),
    );
    console.log(
      'reconnect-failed received:',
      events.some(event => event.event === 'reconnect-failed'),
    );
  } finally {
    await session?.destroy().catch(() => {});
    await sandboxSession.destroy();
  }
});
