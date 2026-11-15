import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createGrokBuild } from './_create';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const grokBuild = createGrokBuild();

const prompt = `
Create a complete retro Snake game in this workspace.

Requirements:
- Write a single playable HTML file named snake.html.
- Include keyboard controls, score, game-over and restart behavior.
- Use a pixel-art visual style with no external assets.
- After writing the file, inspect it and make one improvement pass.
`;

const suspendAfterMs = 10000;

function wait({ ms }: { ms: number }) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

run(async () => {
  const agent = new HarnessAgent({
    harness: grokBuild,
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session = await agent.createSession({ sandboxSession });
  try {
    console.log('--- turn 1: stream ---');
    const result = await agent.stream({ session, prompt });
    const stream = printFullStream({ result });

    await wait({ ms: suspendAfterMs });

    console.log('\n--- suspend turn ---');
    const continueFrom = await session.suspendTurn();
    await stream;
    console.log('continueFrom:');

    console.log('--- continue turn ---');
    session = await agent.createSession({
      sandboxSession,
      sessionId: session.sessionId,
      continueFrom,
    });
    const continued = await agent.continueStream({ session });
    await printFullStream({ result: continued });

    console.log('finishReason:', await continued.finishReason);
    console.log('usage:', await continued.usage);
  } finally {
    await session.destroy();
    await sandboxSession.destroy();
  }
});
