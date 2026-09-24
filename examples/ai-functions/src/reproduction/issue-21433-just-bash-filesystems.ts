import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  InMemoryFs,
  MountableFs,
  OverlayFs,
  ReadWriteFs,
  Sandbox,
  type IFileSystem,
} from 'just-bash';

const reproductionSignal =
  'ISSUE_21433: MountableFs and ReadWriteFs commands fail with bash: bash: command not found';

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const temporaryDirectories: string[] = [];

function createHostDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'ai-sdk-21433-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createFilesystem(name: string): IFileSystem {
  switch (name) {
    case 'InMemoryFs':
      return new InMemoryFs();
    case 'OverlayFs':
      return new OverlayFs({
        root: createHostDirectory(),
        mountPoint: '/',
      });
    case 'MountableFs':
      return new MountableFs({
        base: new InMemoryFs(),
        mounts: [{ mountPoint: '/data', filesystem: new InMemoryFs() }],
      });
    case 'ReadWriteFs':
      return new ReadWriteFs({ root: createHostDirectory() });
    default:
      throw new Error(`Unknown filesystem: ${name}`);
  }
}

async function runDirectJustBash(fs: IFileSystem): Promise<CommandResult> {
  const sandbox = await Sandbox.create({ fs });
  try {
    const command = await sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', 'echo ok'],
    });
    return {
      exitCode: command.exitCode,
      stdout: await command.stdout(),
      stderr: await command.stderr(),
    };
  } finally {
    await sandbox.stop();
  }
}

async function runThroughAiSdk(fs: IFileSystem): Promise<CommandResult> {
  const session = await createJustBashSandbox({ fs }).createSession();
  try {
    return await session.run({ command: 'echo ok' });
  } finally {
    await session.destroy();
  }
}

function assertSuccessful(result: CommandResult, label: string) {
  assert.deepEqual(
    result,
    { exitCode: 0, stdout: 'ok\n', stderr: '' },
    `${label} should execute echo successfully`,
  );
}

function isReportedFailure(result: CommandResult) {
  return (
    result.exitCode === 127 &&
    result.stdout === '' &&
    result.stderr === 'bash: bash: command not found\n'
  );
}

async function runHarnessAgentCheck() {
  const agent = new HarnessAgent({
    harness: createPi(),
    model: 'anthropic/claude-sonnet-4-5',
    sandbox: createJustBashSandbox({
      fs: createFilesystem('MountableFs'),
    }),
  });

  try {
    const session = await agent.createSession();
    await session.destroy();
    return { created: true as const };
  } catch (error) {
    return {
      created: false as const,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const affectedFilesystems = ['MountableFs', 'ReadWriteFs'] as const;

  for (const name of affectedFilesystems) {
    assertSuccessful(
      await runDirectJustBash(createFilesystem(name)),
      `direct just-bash with ${name}`,
    );
  }

  const sdkResults = new Map<string, CommandResult>();
  for (const name of [
    'InMemoryFs',
    'OverlayFs',
    ...affectedFilesystems,
  ] as const) {
    const result = await runThroughAiSdk(createFilesystem(name));
    sdkResults.set(name, result);
    console.log(name.padEnd(12), JSON.stringify(result));
  }

  assertSuccessful(sdkResults.get('InMemoryFs')!, 'AI SDK with InMemoryFs');
  assertSuccessful(sdkResults.get('OverlayFs')!, 'AI SDK with OverlayFs');

  const harnessResult = await runHarnessAgentCheck();
  const affectedResults = affectedFilesystems.map(name => ({
    name,
    result: sdkResults.get(name)!,
  }));

  if (affectedResults.every(({ result }) => result.exitCode === 0)) {
    for (const { name, result } of affectedResults) {
      assertSuccessful(result, `AI SDK with ${name}`);
    }
    assert.equal(
      harnessResult.created,
      true,
      `HarnessAgent.createSession() should succeed: ${
        harnessResult.created ? '' : harnessResult.message
      }`,
    );
    console.log('Issue #21433 did not reproduce.');
    return;
  }

  assert.ok(
    affectedResults.every(({ result }) => isReportedFailure(result)),
    `Affected filesystems did not fail with the reported result: ${JSON.stringify(
      affectedResults,
    )}`,
  );
  assert.equal(
    harnessResult.created,
    false,
    'HarnessAgent.createSession() unexpectedly succeeded while commands fail',
  );
  assert.match(
    harnessResult.message,
    /Failed to create sandbox work directory .+ \(exit 127\): bash: bash: command not found/,
  );

  console.error(reproductionSignal);
  process.exitCode = 1;
}

main()
  .catch(error => {
    console.error('REPRODUCTION_HARNESS_ERROR', error);
    process.exitCode = 2;
  })
  .finally(() => {
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
  });
