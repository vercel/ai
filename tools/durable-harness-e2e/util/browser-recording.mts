import { resolve } from 'node:path';

/**
 * Runs an `agent-browser` command in the script's browser session and
 * returns its output.
 */
export type RunBrowserCommand = (args: string[]) => string;

export type BrowserRecording = {
  /**
   * Starts recording the browser session if `--record` was passed.
   * `record start` needs a launched browser, so it has to run after the
   * first `open`.
   */
  start: () => void;
  /**
   * Stops the recording and saves it, if one is active. `close` does not
   * save an active recording, so this has to run before it.
   */
  stop: () => void;
};

/**
 * Returns where to save the recording of the browser session, or
 * `undefined` unless `--record` was passed. `--record` may be followed by a
 * path, resolved against the current directory, and otherwise saves to
 * `recording.mp4` in the current directory.
 */
function parseRecordingPath(): string | undefined {
  const args = process.argv.slice(2);
  const index = args.indexOf('--record');
  if (index === -1) return undefined;
  const path = args[index + 1];
  return resolve(
    path == null || path.startsWith('--') ? 'recording.mp4' : path,
  );
}

export function createBrowserRecording({
  runBrowserCommand,
  log,
}: {
  runBrowserCommand: RunBrowserCommand;
  log: (message: string) => void;
}): BrowserRecording {
  const path = parseRecordingPath();
  let active = false;

  return {
    start() {
      if (path == null) return;
      runBrowserCommand(['record', 'start', path]);
      active = true;
      log(`Recording the browser session to ${path}.`);
    },
    stop() {
      if (!active) return;
      active = false;
      try {
        runBrowserCommand(['record', 'stop']);
        log(`Saved the recording of the browser session to ${path}.`);
      } catch (error) {
        log(
          `Could not save the recording of the browser session: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
