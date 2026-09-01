import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { syncHostWorkspaceFromSandbox } from '../../../../packages/harness-pi/src/pi-workspace-mirror';

const sandboxWorkDir = '/sandbox/work';
const unrelatedFileCount = 1346;
const requestBudget = 4;

async function main() {
  const sandboxSession = await createJustBashSandbox({
    cwd: sandboxWorkDir,
  }).createSession();
  const localSandbox = sandboxSession.restricted();
  const hostWorkDir = await mkdtemp(path.join(tmpdir(), 'ai-sdk-issue-20118-'));

  try {
    const setup = await localSandbox.run({
      command: [
        'mkdir -p src',
        'i=0',
        `while [ "$i" -lt ${unrelatedFileCount} ]; do`,
        `  printf 'export const value = %s;\\n' "$i" > "src/file-$i.ts"`,
        '  i=$((i + 1))',
        'done',
        `printf '# Project instructions\\n' > AGENTS.md`,
      ].join('\n'),
      workingDirectory: sandboxWorkDir,
    });
    assert.equal(setup.exitCode, 0, setup.stderr);

    let requestCount = 0;
    let runCount = 0;
    let readBinaryFileCount = 0;

    function consumeRequest(kind: string) {
      requestCount++;
      if (requestCount > requestBudget) {
        throw new Error(
          `remote sandbox request budget exceeded by ${kind}: ${requestCount} requests`,
        );
      }
    }

    const sandbox = new Proxy(localSandbox, {
      get(target, property, receiver) {
        if (property === 'run') {
          return async (...args: Parameters<typeof target.run>) => {
            consumeRequest('run');
            runCount++;
            return target.run(...args);
          };
        }
        if (property === 'readBinaryFile') {
          return async (...args: Parameters<typeof target.readBinaryFile>) => {
            consumeRequest('readBinaryFile');
            readBinaryFileCount++;
            return target.readBinaryFile(...args);
          };
        }

        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as Experimental_SandboxSession;

    for (let sync = 0; sync < 2; sync++) {
      await syncHostWorkspaceFromSandbox({
        sandbox,
        sandboxWorkDir,
        hostWorkDir,
      });
    }

    assert.equal(
      readBinaryFileCount,
      2,
      'two syncs should read only the single scoped AGENTS.md file',
    );
    assert.equal(runCount, 2, 'each sync should use one listing request');
    assert.equal(
      requestCount,
      requestBudget,
      'unrelated workspace files must not increase the mirror request count',
    );
    assert.equal(
      await readFile(path.join(hostWorkDir, 'AGENTS.md'), 'utf8'),
      '# Project instructions\n',
    );

    console.log(
      `Issue #20118 not reproduced: two syncs of ${unrelatedFileCount} unrelated files completed within ${requestCount} remote requests (${runCount} run, ${readBinaryFileCount} readBinaryFile).`,
    );
  } finally {
    await rm(hostWorkDir, { recursive: true, force: true });
    await sandboxSession.destroy();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
