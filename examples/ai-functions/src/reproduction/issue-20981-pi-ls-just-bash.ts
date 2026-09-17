import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { createPiPathMapper } from '../../../../packages/harness-pi/src/pi-paths';
import { createPiRemoteOps } from '../../../../packages/harness-pi/src/pi-remote-ops';

async function main() {
  const provider = createJustBashSandbox({ cwd: '/work' });
  const networkSession = await provider.createSession();
  const sandbox = networkSession.restricted();

  try {
    await sandbox.writeTextFile({ path: '/work/.env', content: 'A=1' });
    await sandbox.writeTextFile({ path: '/work/a.txt', content: 'a' });
    await sandbox.writeTextFile({
      path: '/work/src/index.ts',
      content: 'export {};',
    });

    // just-bash 2.14.5 lacks realpath, which is tracked separately. Bypass only
    // that command so this reproduction reaches the reported ls invocation.
    const sandboxWithResolvedPaths = new Proxy(sandbox, {
      get(target, property, receiver) {
        if (property !== 'run') {
          return Reflect.get(target, property, receiver);
        }

        return async (
          input: Parameters<Experimental_SandboxSession['run']>[0],
        ) => {
          if (input.command.includes('resolved=$(realpath "$target"')) {
            const targetPath = input.command.match(/target='([^']+)'/)?.[1];
            return {
              exitCode: 0,
              stdout: `${targetPath ?? '/work'}\n`,
              stderr: '',
            };
          }

          return target.run(input);
        };
      },
    });

    const ops = createPiRemoteOps({
      sandbox: sandboxWithResolvedPaths,
      paths: createPiPathMapper({
        hostWorkDir: process.cwd(),
        sandboxWorkDir: '/work',
      }),
    });

    const [rootEntries, srcEntries] = await Promise.all([
      ops.listDirectory('.'),
      ops.listDirectory('src'),
    ]);

    const expected = [
      { path: '.', entries: ['.env', 'a.txt', 'src/'], actual: rootEntries },
      { path: 'src', entries: ['index.ts'], actual: srcEntries },
    ];
    const mismatches = expected.filter(
      item => JSON.stringify(item.actual) !== JSON.stringify(item.entries),
    );

    if (
      mismatches.some(item =>
        item.actual.some(entry => entry.includes("invalid option -- 'p'")),
      )
    ) {
      throw new Error(
        'ISSUE_20981: Pi ls builtin returned just-bash option error instead of directory entries',
      );
    }

    if (mismatches.length > 0) {
      throw new Error(
        `Unexpected directory listing mismatch: ${JSON.stringify(mismatches)}`,
      );
    }
  } finally {
    await networkSession.destroy();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
