import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { Sandbox } from 'just-bash';

async function main(): Promise<void> {
  const directSandbox = await Sandbox.create();
  try {
    const directResult = await directSandbox.runCommand({
      cmd: 'bash',
      args: ['-c', 'echo [$WORK_DIR]'],
      env: { WORK_DIR: '/hello' },
    });
    console.log(
      'standalone just-bash:',
      JSON.stringify({
        exitCode: directResult.exitCode,
        stdout: await directResult.stdout(),
      }),
    );
  } finally {
    await directSandbox.stop();
  }

  const provider = createJustBashSandbox();
  const providerSession = await provider.createSession({
    sessionId: 'issue-16690-provider',
  });
  try {
    const envMkdir = await providerSession.run({
      command: 'mkdir -p "$WORK_DIR"',
      env: { WORK_DIR: '/home/user/repro-dir' },
    });
    const envDirectory = await providerSession.run({
      command: 'cd /home/user/repro-dir && pwd',
    });
    const literalDirectory = await providerSession.run({
      command: 'mkdir -p /home/user/literal && cd /home/user/literal && pwd',
    });

    console.log(
      'sandbox provider:',
      JSON.stringify({ envMkdir, envDirectory, literalDirectory }),
    );
  } finally {
    await providerSession.destroy();
  }

  const harnessSandbox = await Sandbox.create();
  const agent = new HarnessAgent({
    harness: createPi(),
    sandbox: createJustBashSandbox({ sandbox: harnessSandbox }),
  });

  let session;
  try {
    session = await agent.createSession({ sessionId: 'issue-16690' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('No such file or directory') &&
      message.includes('/home/user/pi-issue-16690')
    ) {
      throw new Error(
        'ISSUE_16690_REPRODUCED: HarnessAgent.createSession failed because the just-bash session work directory was not created.',
        { cause: error },
      );
    }

    throw error;
  }

  try {
    const workDir = await harnessSandbox.runCommand({
      cmd: 'bash',
      args: ['-c', 'cd /home/user/pi-issue-16690 && pwd'],
    });
    console.log(
      'HarnessAgent.createSession:',
      JSON.stringify({
        result: 'created',
        workDirExitCode: workDir.exitCode,
        workDirStderr: await workDir.stderr(),
      }),
    );
  } finally {
    await session.destroy();
    await harnessSandbox.stop();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
