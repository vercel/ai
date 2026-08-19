import { readFile } from 'node:fs/promises';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from './_create';
import { run } from '../../lib/run';

run(async () => {
  const lockedSourceDir = new URL('./locked-acquisition/', import.meta.url);
  const [packageJson, pnpmLockYaml] = await Promise.all([
    readFile(new URL('package.json', lockedSourceDir), 'utf8'),
    readFile(new URL('pnpm-lock.yaml', lockedSourceDir), 'utf8'),
  ]);
  const agent = new HarnessAgent({
    harness: createCodexACP({
      source: {
        type: 'npm-locked',
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
  } finally {
    await session?.destroy();
  }
});
