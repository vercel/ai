import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageDir = fileURLToPath(new URL('../', import.meta.url));
const packageEntry = new URL('../dist/index.js', import.meta.url).href;

describe('Pi sessions under plain Node', () => {
  beforeAll(async () => {
    await execFileAsync(
      'pnpm',
      ['--filter', '@ai-sdk/harness-pi...', 'build'],
      { cwd: packageDir, timeout: 120_000 },
    );
  }, 120_000);

  it('includes the MCP app bridge asset in the built package', async () => {
    const bundledAsset = await readFile(
      new URL('../dist/app-bridge.bundle.js', import.meta.url),
    );
    const sourceAsset = await readFile(
      new URL(
        '../node_modules/pi-mcp-adapter/app-bridge.bundle.js',
        import.meta.url,
      ),
    );

    expect(bundledAsset).toEqual(sourceAsset);
  });

  it.each([
    {
      name: 'ignores host packages across sessions without stdout output',
      hostSettings: { packages: ['npm:pi-mcp-adapter'] },
      harnessSettings: {},
    },
    {
      name: 'loads the MCP adapter without a TypeScript loader',
      hostSettings: {},
      harnessSettings: {
        mcpServers: { demo: { url: 'http://127.0.0.1:9/mcp' } },
      },
    },
  ])(
    '$name',
    async ({ hostSettings, harnessSettings }) => {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `
          import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
          import { tmpdir } from 'node:os';
          import { join } from 'node:path';
          import { createPi } from ${JSON.stringify(packageEntry)};
          import { HarnessAgent } from '@ai-sdk/harness/agent';
          import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';

          const agentDir = mkdtempSync(join(tmpdir(), 'pi-node-test-'));
          const settingsPath = join(agentDir, 'settings.json');
          const originalSettings = JSON.stringify(${JSON.stringify(hostSettings)});
          writeFileSync(settingsPath, originalSettings);

          try {
            for (let sessionIndex = 0; sessionIndex < 2; sessionIndex++) {
              const sandboxSession = await createJustBashNetworkSandboxSession({ cwd: '/workspace' });
              try {
                const agent = new HarnessAgent({
                  harness: createPi({
                    agentDir,
                    ...${JSON.stringify(harnessSettings)},
                    extensionFactories: [() => console.error('INLINE_EXTENSION_CREATED')],
                  }),
                });
                const session = await agent.createSession({
                  sessionId: 'pi-node-test-' + sessionIndex,
                  sandboxSession,
                });
                await session.destroy();
                console.error('SESSION_CREATED:' + sessionIndex);
              } finally {
                await sandboxSession.destroy();
              }
            }
            if (readFileSync(settingsPath, 'utf8') !== originalSettings) {
              throw new Error('Session creation changed host settings.');
            }
          } finally {
            rmSync(agentDir, { recursive: true, force: true });
          }
        `,
        ],
        { cwd: packageDir, timeout: 30_000 },
      );

      expect(stdout).toBe('');
      expect(stderr.match(/^SESSION_CREATED:/gm)).toHaveLength(2);
      expect(stderr.match(/^INLINE_EXTENSION_CREATED$/gm)).toHaveLength(2);
    },
    30_000,
  );
});
