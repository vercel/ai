import { HarnessAgent } from '@ai-sdk/harness/agent';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { createPi } from '../harness-agent/pi/_create';
import { run } from '../lib/run';

/*
 * https://github.com/vercel/ai/issues/20118
 *
 * The Pi harness mirrors the sandbox-side Pi configuration (`.pi`, `.agents`,
 * root `AGENTS.md`) onto the host, once when the session starts and again on
 * every turn. Those directories are walked recursively, so a repository that
 * distributes agent skills as `.agents/skills/<name>/SKILL.md` puts thousands
 * of files in scope. Before the fix each of those files cost one
 * `readBinaryFile` call per sync, sequentially: request count scaled with the
 * size of the in-scope tree rather than with what the model touched, which
 * exhausts the request budget of any sandbox whose filesystem calls are network
 * calls (the original report hit `429 Rate limit exceeded` from a MicroVM
 * proxy).
 *
 * This script counts the sandbox calls a sync makes. It uses the local
 * just-bash sandbox, so the cost shows up as call counts rather than as wall
 * clock or a rate-limit error.
 *
 * Expected after the fix, with SKILL_COUNT=400 (the `run` counts include the
 * harness's own setup commands, not just the mirror):
 *   startup sync   run: 5    readBinaryFile: 0
 *   after one turn run: 11   readBinaryFile: 1
 *
 * Measured before the fix, same script:
 *   startup sync   run: 3    readBinaryFile: 400
 *   after one turn run: 7    readBinaryFile: 801
 *
 * So the per-file reads scaled with the in-scope tree and repeated on every
 * turn; after the fix each sync costs two extra `run` calls (the archives) and
 * no per-file reads at all.
 *
 * The turn needs model credentials; the startup numbers print before it runs,
 * so they are visible either way.
 */

const skillCount = Number(process.env.SKILL_COUNT ?? 400);
const sandboxWorkDir = '/workspace';
const workDir = 'repo';

type CallCounts = { run: number; readBinaryFile: number };

/**
 * Count the calls the harness makes against the sandbox. The harness works
 * through `restricted()`, so that wrapper is counted rather than the session
 * handed to `createSession`.
 */
function countingSession<T extends object>(session: T, counts: CallCounts): T {
  return new Proxy(session, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;

      if (property === 'restricted') {
        return () =>
          countingSession(
            (value as () => Experimental_SandboxSession).call(target),
            counts,
          );
      }
      if (property !== 'run' && property !== 'readBinaryFile') return value;

      return (...args: unknown[]) => {
        counts[property] += 1;
        return (value as (...callArgs: unknown[]) => unknown).apply(
          target,
          args,
        );
      };
    },
  });
}

run(async () => {
  const sandboxSession = await createJustBashSandbox({
    cwd: sandboxWorkDir,
    // The scoped traversal spends a handful of shell commands per entry, and
    // just-bash caps a single `run` at 10k commands by default. A real shell has
    // no such cap; raise it so this script measures the file transfer.
    maxCommandCount: 5_000_000,
  }).createSession();

  // A realistic in-scope tree: agent skills are distributed as
  // `.agents/skills/<name>/SKILL.md`, so an ordinary repository lands in the
  // thousands of in-scope files without anything unusual going on. Seeded
  // through the raw session, before the counting wrapper is installed, so the
  // numbers below cover only the mirror.
  const seed = await sandboxSession.run({
    command: [
      `mkdir -p ${workDir}`,
      `cd ${workDir}`,
      'i=0',
      `while [ "$i" -lt ${skillCount} ]; do`,
      '  mkdir -p ".agents/skills/skill-$i"',
      `  printf '# Skill %s\\n' "$i" > ".agents/skills/skill-$i/SKILL.md"`,
      '  i=$((i + 1))',
      'done',
      'true',
    ].join('\n'),
    workingDirectory: sandboxWorkDir,
  });
  if (seed.exitCode !== 0) {
    throw new Error(`Failed to seed skills: ${seed.stderr}`);
  }

  const counts: CallCounts = { run: 0, readBinaryFile: 0 };
  const agent = new HarnessAgent({
    harness: createPi(),
    sandboxConfig: { workDir },
  });
  const session = await agent.createSession({
    sandboxSession: countingSession(sandboxSession, counts),
  });
  console.log(`in-scope files: ${skillCount}`);
  console.log(
    `startup sync   run: ${counts.run}  readBinaryFile: ${counts.readBinaryFile}`,
  );

  try {
    const result = await agent.generate({
      session,
      prompt: 'Reply with the single word OK. Do not use any tools.',
    });
    console.log('model text:', result.text);
  } finally {
    console.log(
      `after one turn run: ${counts.run}  readBinaryFile: ${counts.readBinaryFile}`,
    );
    await session.destroy();
  }
});
