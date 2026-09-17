import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { InMemoryFs } from 'just-bash';
import { createPiPathMapper } from '../../../../packages/harness-pi/src/pi-paths';
import { createPiRemoteOps } from '../../../../packages/harness-pi/src/pi-remote-ops';

const FAILURE_SIGNAL =
  'ISSUE_20982_REPRODUCED: pi grepFiles reported no match for existing text';

async function main() {
  const networkSession = await createJustBashSandbox({
    fs: new InMemoryFs({
      '/w/a.ts': { content: 'hello\n' },
    }),
  }).createSession();
  const rawSandbox = networkSession.restricted();

  const baseline = await rawSandbox.run({
    command: "cd /w; grep -r -n --include='*.ts' -e hello .",
  });
  if (
    baseline.exitCode !== 0 ||
    !baseline.stdout.includes('a.ts') ||
    !baseline.stdout.includes('hello')
  ) {
    throw new Error(
      `ISSUE_20982_HARNESS_ERROR: compatible grep command failed: ${JSON.stringify(baseline)}`,
    );
  }

  // just-bash 2.14.5 does not provide the `realpath` command now used by
  // pi-remote-ops. Substitute only that unrelated path-resolution step so this
  // reproduction can reach and evaluate the reported grep behavior.
  const runWithResolvedWorkspace: typeof rawSandbox.run = async input => {
    if (
      input.command.includes('__PI_REALPATH_NOT_FOUND__') &&
      input.command.includes('realpath "$target"')
    ) {
      return { exitCode: 0, stdout: '/w\n', stderr: '' };
    }
    return rawSandbox.run(input);
  };
  const sandbox = { run: runWithResolvedWorkspace } as typeof rawSandbox;

  const paths = createPiPathMapper({
    hostWorkDir: process.cwd(),
    sandboxWorkDir: '/w',
  });
  const remoteOps = createPiRemoteOps({ sandbox, paths });

  const withoutGlob = await remoteOps.grepFiles('hello', {});
  const withGlob = await remoteOps.grepFiles('hello', { glob: '*.ts' });

  const rejectedCommands = await Promise.all([
    rawSandbox.run({
      command: 'cd /w; grep -r -n --binary-files=without-match -e hello .',
    }),
    rawSandbox.run({
      command: "cd /w; grep -r -n --include '*.ts' -e hello .",
    }),
    rawSandbox.run({
      command: 'cd /w; grep -r -n -- hello .',
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        baseline,
        grepFiles: { withoutGlob, withGlob },
        rejectedCommands,
      },
      null,
      2,
    ),
  );

  const missingMatches = [
    ['without glob', withoutGlob],
    ['with glob', withGlob],
  ].filter(([, output]) => !output.includes('hello'));

  if (missingMatches.length > 0) {
    console.error(FAILURE_SIGNAL);
    console.error(`Missing matches: ${JSON.stringify(missingMatches)}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
