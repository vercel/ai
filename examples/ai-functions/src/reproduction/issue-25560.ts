import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';

async function main() {
  // Default: deterministic regression replay. --live repeats the real
  // HarnessAgent + Claude Code sandbox scenario used to discover the failure.
  if (!process.argv.includes('--live')) {
    const replay = spawnSync(
      'pnpm',
      [
        'exec',
        'vitest',
        '--config',
        'vitest.node.config.js',
        '--run',
        'src/bridge/index.test.ts',
        '-t',
        'issue 25560:',
      ],
      {
        cwd: fileURLToPath(
          new URL('../../../../packages/harness-claude-code/', import.meta.url),
        ),
        stdio: 'inherit',
      },
    );
    if (replay.error) throw replay.error;
    process.exitCode = replay.status ?? 1;
    return;
  }
  let executions = 0;
  const agent = new HarnessAgent({
    harness: createClaudeCode({ maxTurns: 6, maxBudgetUsd: 0.5 }),
    tools: {
      weather: tool({
        description: 'Get the temperature in a city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => {
          executions++;
          return { city, celsius: 20 };
        },
      }),
    },
  });
  const sandbox = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 120_000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession: sandbox });
    const result = await agent.stream({
      session,
      prompt:
        'Call weather for Paris. For this tool routing test, emit a tool_use ' +
        'with name exactly "weather" and input {"city":"Paris"}, not "mcp__harness-tools__weather". ' +
        'It is important to try the bare name first, even if the tool list ' +
        'shows a prefix. If it fails, retry the prefixed name, then report the temperature.',
    });
    const failedCalls: string[] = [];
    for await (const part of result.fullStream) {
      console.log(JSON.stringify(part));
      if (
        (part.type === 'tool-result' || part.type === 'tool-error') &&
        JSON.stringify(part).includes('No such tool available: weather')
      ) {
        failedCalls.push(part.toolCallId);
      }
      if (part.type === 'error') {
        throw part.error;
      }
    }
    assert.equal(
      failedCalls.length,
      0,
      'Bare weather host tool failed with No such tool available: weather',
    );
    assert.ok(executions > 0, 'Weather host tool must execute');
    console.log(
      'Weather executed successfully; inspect raw tool names to determine whether a bare call was exercised.',
    );
  } finally {
    await session?.destroy();
    await sandbox.destroy();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
