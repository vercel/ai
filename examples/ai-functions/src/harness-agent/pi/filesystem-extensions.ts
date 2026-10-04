import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { createPi } from './_create';
import { run } from '../../lib/run';

run(async () => {
  const agentDir = await mkdtemp(path.join(tmpdir(), 'ai-sdk-pi-agent-'));
  const markerPath = path.join(agentDir, 'filesystem-extension-loaded');
  const extensionDir = path.join(agentDir, 'extensions');
  await mkdir(extensionDir);
  await writeFile(
    path.join(extensionDir, 'greet.ts'),
    `
import { writeFileSync } from 'node:fs';

export default function (pi) {
  pi.registerTool({
    name: 'greet',
    label: 'Greet',
    description: 'Greet a person by name.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
    async execute(_toolCallId, { name }) {
      return {
        content: [{ type: 'text', text: \`Hello, \${name}!\` }],
        details: {},
      };
    },
  });
  writeFileSync(${JSON.stringify(markerPath)}, 'loaded');
}
`,
  );

  const agent = new HarnessAgent({
    harness: createPi({
      agentDir,
      extensions: true,
    }),
    sandbox: createJustBashSandbox({ cwd: '/work' }),
  });

  let session: Awaited<ReturnType<typeof agent.createSession>> | undefined;
  try {
    session = await agent.createSession();
    if (!existsSync(markerPath)) {
      throw new Error('Expected Pi to load the filesystem extension.');
    }
    console.log(`Loaded Pi extension from ${extensionDir}`);
  } finally {
    await session?.destroy();
    await rm(agentDir, { recursive: true, force: true });
  }
});
