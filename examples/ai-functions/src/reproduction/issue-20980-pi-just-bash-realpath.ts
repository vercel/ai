import assert from 'node:assert/strict';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { InMemoryFs } from 'just-bash';
import { createPiPathMapper } from '../../../../packages/harness-pi/src/pi-paths';
import { createPiRemoteOps } from '../../../../packages/harness-pi/src/pi-remote-ops';

const failureSignal =
  'ISSUE #20980 REPRODUCED: pi read/write/edit/find fail with "Unable to resolve path" while bash works';

type Outcome<T> =
  | { name: string; status: 'fulfilled'; value: T }
  | { name: string; status: 'rejected'; error: Error };

async function capture<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<Outcome<T>> {
  try {
    return { name, status: 'fulfilled', value: await operation() };
  } catch (error) {
    return {
      name,
      status: 'rejected',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function main() {
  const session = await createJustBashSandbox({
    fs: new InMemoryFs({}),
  }).createSession();

  try {
    const sandbox = session.restricted();
    const sandboxWorkDir = session.defaultWorkingDirectory;
    const paths = createPiPathMapper({
      hostWorkDir: process.cwd(),
      sandboxWorkDir,
    });
    const remoteOps = createPiRemoteOps({ sandbox, paths });

    await sandbox.writeTextFile({
      path: `${sandboxWorkDir}/notes.md`,
      content: 'alpha\n',
    });

    const realpathProbe = await sandbox.run({ command: 'realpath /tmp' });
    console.log(
      `realpath probe: exit=${realpathProbe.exitCode} stderr=${JSON.stringify(
        realpathProbe.stderr.trim(),
      )}`,
    );

    const bashOutput: Buffer[] = [];
    const bashResult = await remoteOps.exec('printf bash-ok', '.', {
      onData: chunk => bashOutput.push(chunk),
    });
    assert.equal(bashResult.exitCode, 0);
    assert.equal(Buffer.concat(bashOutput).toString('utf8'), 'bash-ok');

    const read = await capture('read', () => remoteOps.readBuffer('notes.md'));
    const write = await capture('write', () =>
      remoteOps.writeFile('created.md', 'created\n'),
    );
    const edit = await capture('edit', () =>
      remoteOps.editFile('notes.md', 'alpha', 'beta'),
    );
    const find = await capture('find', () => remoteOps.findFiles('*.md', '.'));
    const outcomes = [read, write, edit, find];

    const expectedFailures = new Map([
      ['read', 'Unable to resolve path: notes.md'],
      ['write', 'Unable to resolve path: created.md'],
      ['edit', 'Unable to resolve path: notes.md'],
      ['find', 'Unable to resolve path: .'],
    ]);
    const reproduced = outcomes.every(
      outcome =>
        outcome.status === 'rejected' &&
        outcome.error.message === expectedFailures.get(outcome.name),
    );

    if (reproduced) {
      console.error(failureSignal);
      for (const outcome of outcomes) {
        assert.equal(outcome.status, 'rejected');
        console.error(`${outcome.name}: ${outcome.error.message}`);
      }
      process.exitCode = 1;
      return;
    }

    const unexpectedFailure = outcomes.find(
      outcome => outcome.status === 'rejected',
    );
    if (unexpectedFailure?.status === 'rejected') {
      throw new Error(
        `${unexpectedFailure.name} failed unexpectedly: ${unexpectedFailure.error.message}`,
      );
    }

    assert.equal(read.status, 'fulfilled');
    assert.equal(read.value.toString('utf8'), 'alpha\n');
    assert.equal(write.status, 'fulfilled');
    assert.equal(edit.status, 'fulfilled');
    assert.equal(edit.value, 'beta\n');
    assert.equal(find.status, 'fulfilled');
    assert.deepEqual(find.value, ['created.md', 'notes.md']);
    assert.equal(
      await sandbox.readTextFile({ path: `${sandboxWorkDir}/created.md` }),
      'created\n',
    );
    assert.equal(
      await sandbox.readTextFile({ path: `${sandboxWorkDir}/notes.md` }),
      'beta\n',
    );

    console.log('Pi read/write/edit/find and bash all succeeded.');
  } finally {
    await session.stop();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
