import { createJustBashSandboxSessionFromNativeSandbox } from '@ai-sdk/sandbox-just-bash';

const diagnostic = 'needed diagnostic';

type RunResult = {
  text: string;
  error: unknown;
  status: { exitCode: number };
};

async function run(cancelStdout: boolean): Promise<RunResult> {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });

  const command = {
    async *logs() {
      await gate;
      yield { type: 'stdout' as const, data: 'ignored output' };
      yield { type: 'stderr' as const, data: diagnostic };
    },
    async wait() {
      await gate;
      return { exitCode: 0 };
    },
    async kill() {},
  };

  const session = createJustBashSandboxSessionFromNativeSandbox({
    bashEnvInstance: {
      getCwd: () => '/',
      exec: async () => ({ exitCode: 0 }),
    },
    runCommand: async () => command,
  } as never);

  const process = await session.spawn({ command: 'synthetic' });
  if (cancelStdout) {
    await process.stdout.cancel();
  }

  const reader = process.stderr.getReader();
  release();

  let text = '';
  let error: unknown;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      text += new TextDecoder().decode(next.value);
    }
  } catch (caught) {
    error = caught;
  } finally {
    reader.releaseLock();
  }

  return {
    text,
    error,
    status: await process.wait(),
  };
}

async function main() {
  const control = await run(false);
  if (
    control.text !== diagnostic ||
    control.error !== undefined ||
    control.status.exitCode !== 0
  ) {
    throw new Error(
      `ISSUE_22975_SETUP_FAILED: ${JSON.stringify({
        text: control.text,
        error:
          control.error instanceof Error
            ? control.error.message
            : control.error,
        status: control.status,
      })}`,
    );
  }

  const cancelled = await run(true);
  if (
    cancelled.text !== diagnostic ||
    cancelled.error !== undefined ||
    cancelled.status.exitCode !== 0
  ) {
    throw new Error(
      `ISSUE_22975_REPRODUCED: cancelling stdout broke stderr consumption; ${JSON.stringify(
        {
          text: cancelled.text,
          error:
            cancelled.error instanceof Error
              ? cancelled.error.message
              : cancelled.error,
          status: cancelled.status,
        },
      )}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
