import { spawn } from 'node:child_process';

const packagesReproduction = String.raw`
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPi } from '@ai-sdk/harness-pi';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';

const agentDir = mkdtempSync(join(tmpdir(), 'pi-agent-packages-'));
writeFileSync(
  join(agentDir, 'settings.json'),
  JSON.stringify({ packages: ['npm:pi-mcp-adapter'] }),
);

try {
  for (let index = 1; index <= 2; index++) {
    const sandboxSession = await createJustBashNetworkSandboxSession({
      cwd: '/workspace',
    });
    try {
      const agent = new HarnessAgent({
        harness: createPi({ agentDir }),
      });
      const session = await agent.createSession({
        sessionId: 'issue-22040-packages-' + index,
        sandboxSession,
      });
      await session.destroy();
      console.error('PACKAGE_SESSION_CREATED:' + index);
    } finally {
      await sandboxSession.destroy();
    }
  }
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}
`;

const mcpReproduction = String.raw`
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPi } from '@ai-sdk/harness-pi';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';

const agentDir = mkdtempSync(join(tmpdir(), 'pi-agent-mcp-'));
writeFileSync(join(agentDir, 'settings.json'), '{}');
const sandboxSession = await createJustBashNetworkSandboxSession({
  cwd: '/workspace',
});

try {
  const agent = new HarnessAgent({
    harness: createPi({
      agentDir,
      mcpServers: {
        demo: { url: 'http://127.0.0.1:9/mcp' },
      },
    }),
  });
  const session = await agent.createSession({
    sessionId: 'issue-22040-mcp',
    sandboxSession,
  });
  await session.destroy();
  console.error('MCP_SESSION_CREATED');
} catch (error) {
  console.error(
    'MCP_SESSION_FAILURE:' +
      (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
} finally {
  await sandboxSession.destroy();
  rmSync(agentDir, { recursive: true, force: true });
}
`;

type ChildResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

async function runWithPlainNode(source: string): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '--eval', source],
      {
        cwd: process.cwd(),
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Plain Node reproduction timed out after 120 seconds.'));
    }, 120_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', code => {
      clearTimeout(timeout);
      resolve({ exitCode: code ?? 1, stderr, stdout });
    });
  });
}

async function main() {
  const packages = await runWithPlainNode(packagesReproduction);
  if (packages.exitCode !== 0) {
    throw new Error(
      `Package-session setup failed before the reported behavior could be evaluated:\n${packages.stderr}`,
    );
  }

  const installCount = (
    packages.stdout.match(/^added \d+ packages?(?:,|$)/gm) ?? []
  ).length;
  const packageSessionsCreated = (
    packages.stderr.match(/^PACKAGE_SESSION_CREATED:/gm) ?? []
  ).length;
  const packageStdoutBug = packageSessionsCreated === 2 && installCount === 2;

  const mcp = await runWithPlainNode(mcpReproduction);
  const mcpTypeStrippingBug =
    mcp.exitCode === 1 &&
    mcp.stderr.includes('MCP_SESSION_FAILURE:') &&
    mcp.stderr.includes(
      'Stripping types is currently unsupported for files under node_modules',
    ) &&
    mcp.stderr.includes('pi-mcp-adapter/index.ts');

  if (packageStdoutBug && mcpTypeStrippingBug) {
    console.error(
      'Issue #22040 reproduced: package installs polluted stdout on both sessions and Node MCP session creation failed on pi-mcp-adapter TypeScript loading.',
    );
    process.exitCode = 1;
    return;
  }

  const remaining: string[] = [];
  if (packageStdoutBug) {
    remaining.push('package installs polluted stdout on both sessions');
  }
  if (mcpTypeStrippingBug) {
    remaining.push(
      'Node MCP session creation failed on pi-mcp-adapter TypeScript loading',
    );
  }

  if (remaining.length > 0) {
    console.error(
      `Issue #22040 partially reproduced: ${remaining.join('; ')}.`,
    );
    process.exitCode = 1;
    return;
  }

  if (mcp.exitCode !== 0) {
    throw new Error(
      `MCP session failed for an unrelated reason:\n${mcp.stderr}`,
    );
  }
  if (packageSessionsCreated !== 2) {
    throw new Error(
      `Expected two package sessions to be created, observed ${packageSessionsCreated}.`,
    );
  }
}

await main();
