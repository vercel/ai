import type { FxToolSandbox } from './fx-builtin-tools';
import { createFxOutputCapture, readFxChunks } from './fx-sandbox-output';

/*
 * Longest home directory the harness accepts: a longer value is not a home
 * directory, and the read must not keep more of a command's output than it
 * can show.
 */
const HOME_BYTES = 4096;

/**
 * Resolves the sandbox user's home directory with a bounded command, or
 * resolves to `undefined` when the sandbox does not answer with one. The
 * session's own commands collect their whole output in the host, so the home
 * directory is read through the same capture the built-in tools use.
 */
export async function readFxSandboxHome(options: {
  /**
   * Session of the sandbox whose user the home directory belongs to.
   */
  session: FxToolSandbox['session'];

  /**
   * Directory the command runs in.
   */
  workDir: string;
}): Promise<string | undefined> {
  const { session, workDir } = options;
  const capture = createFxOutputCapture({
    headBytes: HOME_BYTES,
    tailBytes: 0,
  });
  const controller = new AbortController();
  let child: Awaited<ReturnType<typeof session.spawn>>;
  try {
    child = await session.spawn({
      command: 'printf %s "$HOME"',
      workingDirectory: workDir,
      abortSignal: controller.signal,
    });
  } catch {
    return undefined;
  }
  /*
   * Stopping is best effort: the abort ends the streams, and a sandbox that
   * can kill the command is asked to do so as well.
   */
  const stop = () => {
    controller.abort(new Error('home directory limit'));
    try {
      void Promise.resolve(child.kill()).catch(() => {});
    } catch {}
  };
  try {
    const [result] = await Promise.all([
      child.wait(),
      readFxChunks({
        stream: child.stdout,
        onChunk: chunk => {
          capture.add(chunk);
          if (!capture.complete) stop();
        },
        abortSignal: controller.signal,
      }),
      readFxChunks({
        stream: child.stderr,
        onChunk: () => {},
        abortSignal: controller.signal,
      }),
    ]);
    if (result.exitCode !== 0) return undefined;
  } catch {
    return undefined;
  }
  /*
   * A value the read had to cut off is not a home directory, whatever the
   * sandbox reported for the command.
   */
  if (!capture.complete) return undefined;
  const value = new TextDecoder().decode(capture.toBytes()).trim();
  return value.length > 0 ? value : undefined;
}
