import { readFile } from 'node:fs/promises';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { run } from '../../lib/run';

run(async () => {
  const acquisitionDir = new URL('./locked-acquisition/', import.meta.url);
  const [packageJson, pnpmLockYaml] = await Promise.all([
    readFile(new URL('package.json', acquisitionDir), 'utf8'),
    readFile(new URL('pnpm-lock.yaml', acquisitionDir), 'utf8'),
  ]);
  const agent = new HarnessAgent({
    harness: createCodexACP({
      acquisition: {
        mode: 'locked',
        packageJson,
        pnpmLockYaml,
      },
    }),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });
  let session: Awaited<ReturnType<typeof agent.createSession>> | undefined;
  try {
    session = await agent.createSession();
    const result = await agent.generate({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });
    console.log('text:', result.text);
    console.log('finishReason:', result.finishReason);
    console.log('usage:', result.usage);
  } catch (error) {
    process.exitCode = 1;
    throw error;
  } finally {
    await session?.destroy();
  }
});
