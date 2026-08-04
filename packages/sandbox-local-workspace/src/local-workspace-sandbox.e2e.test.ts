/**
 * End-to-end tests that drive real harnesses against the local filesystem.
 *
 * Skipped unless `HARNESS_LOCAL_WORKSPACE_E2E=1`. They make real model calls,
 * install real bridge dependencies, and take minutes on a cold bootstrap.
 *
 * Setup:
 * - `claude` configured (`~/.claude/settings.json` or `ANTHROPIC_AUTH_TOKEN`)
 * - `codex` configured, and a **fully qualified** model id, because the bridge
 *   injects its own `model_providers` block and ignores `~/.codex/config.toml`,
 *   so a bare id that works in the CLI silently drops Codex's filesystem tools
 * - `pi` authenticated (`~/.pi/agent/auth.json`)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { afterAll, describe, expect, it } from 'vitest';
import { localWorkspace } from './local-workspace-sandbox';

const e2eEnabled = process.env.HARNESS_LOCAL_WORKSPACE_E2E === '1';
const describeE2E = e2eEnabled ? describe : describe.skip;

/** Cold bridge bootstrap (pnpm install of a full agent SDK) dominates this. */
const E2E_TIMEOUT_MS = 10 * 60 * 1000;

type HarnessCase = {
  readonly id: string;
  readonly createHarness: () => Promise<{
    harness: unknown;
    /** Bridge-backed adapters bootstrap into `.harness-bootstrap/`. */
    bridgeBacked: boolean;
  }>;
};

const harnessCases: ReadonlyArray<HarnessCase> = [
  {
    id: 'pi',
    createHarness: async () => {
      const { createPi } = await import('@ai-sdk/harness-pi');
      return {
        harness: createPi({ agentDir: join(homeDir(), '.pi', 'agent') }),
        bridgeBacked: false,
      };
    },
  },
  {
    id: 'claude-code',
    createHarness: async () => {
      const { createClaudeCode } = await import('@ai-sdk/harness-claude-code');
      return { harness: createClaudeCode(), bridgeBacked: true };
    },
  },
  {
    id: 'codex',
    createHarness: async () => {
      const { createCodex } = await import('@ai-sdk/harness-codex');
      return {
        // Fully qualified on purpose. See the file header.
        harness: createCodex({ model: 'openai/gpt-5.6-sol' }),
        bridgeBacked: true,
      };
    },
  },
];

function homeDir(): string {
  return process.env.HOME ?? '';
}

/**
 * One shared parent directory for every project in this suite.
 *
 * Bootstrap is keyed to the sandbox root, which is the project's parent, so
 * sibling projects share a single `.harness-bootstrap/`. Giving every scenario
 * its own parent would mean a cold bridge bootstrap per scenario: minutes of
 * runtime and a fresh `pnpm install` against the network each time. Sharing
 * one root pays that once per harness, and mirrors how a real user's `~/repos`
 * looks.
 */
let sharedRoot: string | undefined;
let projectCounter = 0;

async function createProject(): Promise<{
  root: string;
  projectPath: string;
}> {
  sharedRoot ??= await mkdtemp(join(await realpath(tmpdir()), 'lws-e2e-'));
  const projectPath = join(sharedRoot, `myapp-${++projectCounter}`);
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(
    join(projectPath, 'README.md'),
    '# Widget Service\n\nA tiny service that renders widgets for downstream consumers.\n',
  );
  return { root: sharedRoot, projectPath };
}

/**
 * Check the real filesystem, out of process.
 *
 * Host-runtime adapters patch `node:fs` for the lifetime of a session. Pi's
 * VFS makes `existsSync` return `false` for files that demonstrably exist on
 * disk, scoped to the workspace, until the session is destroyed. In-process
 * `node:fs` is therefore not a trustworthy oracle inside these tests, even
 * though the provider itself is immune (it captures its bindings at import).
 */
function existsOnDisk(path: string): boolean {
  try {
    execFileSync('test', ['-e', path]);
    return true;
  } catch {
    return false;
  }
}

function readFromDisk(path: string): string {
  return execFileSync('cat', [path], { encoding: 'utf8' });
}

function bridgeProcessCount(): number {
  try {
    const output = execFileSync('pgrep', ['-f', 'bridge.mjs'], {
      encoding: 'utf8',
    });
    return output.trim().split('\n').filter(Boolean).length;
  } catch {
    // pgrep exits 1 when nothing matches.
    return 0;
  }
}

const createdSessions: Array<{ destroy: () => PromiseLike<void> }> = [];

afterAll(async () => {
  while (createdSessions.length > 0) {
    try {
      await createdSessions.pop()?.destroy();
    } catch {
      // Best effort; the assertions below already ran.
    }
  }
});

describeE2E('local workspace provider, driven by real harnesses', () => {
  for (const harnessCase of harnessCases) {
    describe(harnessCase.id, () => {
      it(
        'reads and writes inside the project, with real token usage',
        async () => {
          const { root, projectPath } = await createProject();
          const { harness, bridgeBacked } = await harnessCase.createHarness();

          const workspace = localWorkspace({ path: projectPath });
          const agent = new HarnessAgent({
            // biome-ignore lint/suspicious/noExplicitAny: adapters are structurally compatible
            harness: harness as any,
            sandbox: workspace.sandbox,
            sandboxConfig: workspace.sandboxConfig,
            instructions: `Your working directory is ${projectPath}.`,
          });

          const session = await agent.createSession();
          createdSessions.push(session);

          const result = await agent.generate({
            session,
            prompt:
              'Read README.md, then create NOTES.md summarising it in one line.',
          });

          // The file landed in the project, not in a sibling or /tmp.
          //
          // A host-runtime adapter's `node:fs` patch is still active until the
          // session is destroyed, so these assertions go out of process.
          const notesPath = join(projectPath, 'NOTES.md');
          expect(existsOnDisk(notesPath)).toBe(true);
          expect(readFromDisk(notesPath).trim().length).toBeGreaterThan(0);
          expect(existsOnDisk('/tmp/NOTES.md')).toBe(false);

          // A harness that silently loses its tools, and one with no resolvable
          // credential, both finish with finishReason 'stop', empty text and no
          // error part. Token usage is the only reliable signal that work
          // actually happened.
          expect(result.usage.totalTokens).toBeGreaterThan(0);

          // At least one harness-native tool call.
          expect(result.steps.length).toBeGreaterThan(0);
          const toolCalls = result.steps.flatMap(step =>
            step.content.filter(part => part.type === 'tool-call'),
          );
          expect(toolCalls.length).toBeGreaterThan(0);

          // Invariant 3: bootstrap lands beside the project, never inside it.
          if (bridgeBacked) {
            expect(existsOnDisk(join(root, '.harness-bootstrap'))).toBe(true);
          }
          expect(existsOnDisk(join(projectPath, '.harness-bootstrap'))).toBe(
            false,
          );

          await session.destroy();
          createdSessions.pop();

          // Invariant 2, end to end: with the session gone and any `node:fs`
          // patch reverted, the model's file is still really there. A provider
          // that resolved `node:fs` lazily would have written into the
          // adapter's mirror, and the file would have vanished here.
          expect(existsOnDisk(notesPath)).toBe(true);
        },
        E2E_TIMEOUT_MS,
      );
    });
  }

  // The harness's own shell tool is the surface that makes this provider
  // useful and dangerous in equal measure: it runs as the current user with no
  // containment. Prove it actually executes, and that it executes in the
  // project directory rather than the sandbox root.
  for (const harnessCase of harnessCases) {
    it(
      `${harnessCase.id}: runs a shell command in the project directory`,
      async () => {
        const { projectPath } = await createProject();
        const { harness } = await harnessCase.createHarness();

        const workspace = localWorkspace({ path: projectPath });
        const agent = new HarnessAgent({
          // biome-ignore lint/suspicious/noExplicitAny: adapters are structurally compatible
          harness: harness as any,
          sandbox: workspace.sandbox,
          sandboxConfig: workspace.sandboxConfig,
          instructions: `Your working directory is ${projectPath}.`,
        });

        const session = await agent.createSession();
        createdSessions.push(session);

        const result = await agent.generate({
          session,
          prompt:
            'Using your shell tool, run `pwd -P > CWD.txt`. Do not use a file-writing tool.',
        });

        expect(result.usage.totalTokens).toBeGreaterThan(0);

        await session.destroy();
        createdSessions.pop();

        const cwdPath = join(projectPath, 'CWD.txt');
        expect(existsOnDisk(cwdPath)).toBe(true);
        expect(readFromDisk(cwdPath).trim()).toBe(projectPath);
      },
      E2E_TIMEOUT_MS,
    );
  }

  // Session continuity. `stop()` returns a resume payload; a later
  // `createSession({ sessionId, resumeFrom })` must reach a harness that still
  // remembers the earlier turn.
  for (const harnessCase of harnessCases) {
    it(
      `${harnessCase.id}: resumes a stopped session and recalls prior state`,
      async () => {
        const { projectPath } = await createProject();
        const { harness } = await harnessCase.createHarness();

        const workspace = localWorkspace({ path: projectPath });
        const agent = new HarnessAgent({
          // biome-ignore lint/suspicious/noExplicitAny: adapters are structurally compatible
          harness: harness as any,
          sandbox: workspace.sandbox,
          sandboxConfig: workspace.sandboxConfig,
          instructions: `Your working directory is ${projectPath}.`,
        });

        const first = await agent.createSession();
        createdSessions.push(first);
        await agent.generate({
          session: first,
          prompt:
            'Remember this codeword for later: PLATYPUS. Reply with just "ok".',
        });
        const resumeFrom = await first.stop();
        createdSessions.pop();

        const resumed = await agent.createSession({
          sessionId: first.sessionId,
          resumeFrom,
        });
        createdSessions.push(resumed);

        const result = await agent.generate({
          session: resumed,
          prompt:
            'What codeword did I ask you to remember? Reply with just the word.',
        });

        expect(result.usage.totalTokens).toBeGreaterThan(0);
        expect(result.text.toUpperCase()).toContain('PLATYPUS');

        await resumed.destroy();
        createdSessions.pop();
      },
      E2E_TIMEOUT_MS,
    );
  }

  // Two projects at once. Each session gets its own loopback port, and each
  // must write only into its own project.
  it(
    'keeps concurrent sessions isolated',
    async () => {
      const { createPi } = await import('@ai-sdk/harness-pi');
      const alpha = await createProject();
      const beta = await createProject();

      const makeAgent = (projectPath: string) => {
        const workspace = localWorkspace({ path: projectPath });
        return new HarnessAgent({
          harness: createPi({ agentDir: join(homeDir(), '.pi', 'agent') }),
          sandbox: workspace.sandbox,
          sandboxConfig: workspace.sandboxConfig,
          instructions: `Your working directory is ${projectPath}.`,
        });
      };

      const alphaAgent = makeAgent(alpha.projectPath);
      const betaAgent = makeAgent(beta.projectPath);

      const [alphaSession, betaSession] = await Promise.all([
        alphaAgent.createSession(),
        betaAgent.createSession(),
      ]);
      createdSessions.push(alphaSession, betaSession);

      await Promise.all([
        alphaAgent.generate({
          session: alphaSession,
          prompt: 'Create a file named ALPHA.txt containing the word alpha.',
        }),
        betaAgent.generate({
          session: betaSession,
          prompt: 'Create a file named BETA.txt containing the word beta.',
        }),
      ]);

      await Promise.all([alphaSession.destroy(), betaSession.destroy()]);
      createdSessions.length = 0;

      expect(existsOnDisk(join(alpha.projectPath, 'ALPHA.txt'))).toBe(true);
      expect(existsOnDisk(join(beta.projectPath, 'BETA.txt'))).toBe(true);
      // Neither leaked into the other's project.
      expect(existsOnDisk(join(alpha.projectPath, 'BETA.txt'))).toBe(false);
      expect(existsOnDisk(join(beta.projectPath, 'ALPHA.txt'))).toBe(false);
    },
    E2E_TIMEOUT_MS,
  );

  // The point of the package: credentials come from the user's own CLI config,
  // not from the orchestrator's environment.
  it(
    'authenticates from the user config alone, with credential env vars removed',
    async () => {
      const { createPi } = await import('@ai-sdk/harness-pi');
      const { projectPath } = await createProject();

      const credentialVars = Object.keys(process.env).filter(name =>
        /ANTHROPIC|OPENAI|AI_GATEWAY|VERCEL_OIDC|CLAUDE/i.test(name),
      );
      expect(credentialVars.length).toBeGreaterThan(0);
      const saved = new Map(
        credentialVars.map(name => [name, process.env[name]]),
      );
      for (const name of credentialVars) delete process.env[name];

      try {
        const workspace = localWorkspace({ path: projectPath });
        const agent = new HarnessAgent({
          harness: createPi({ agentDir: join(homeDir(), '.pi', 'agent') }),
          sandbox: workspace.sandbox,
          sandboxConfig: workspace.sandboxConfig,
          instructions: `Your working directory is ${projectPath}.`,
        });

        const session = await agent.createSession();
        createdSessions.push(session);

        const result = await agent.generate({
          session,
          prompt: 'Reply with just the word: authenticated',
        });

        // Zero usage is what a silent credential failure looks like.
        expect(result.usage.totalTokens).toBeGreaterThan(0);

        await session.destroy();
        createdSessions.pop();
      } finally {
        for (const [name, value] of saved) {
          if (value != null) process.env[name] = value;
        }
      }
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'leaves no bridge processes behind',
    async () => {
      // Runs last: every session above has been destroyed by now.
      expect(bridgeProcessCount()).toBe(0);
    },
    E2E_TIMEOUT_MS,
  );
});
