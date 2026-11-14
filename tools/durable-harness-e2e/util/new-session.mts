import { existsSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { RunBrowserCommand } from './browser-recording.mts';

const packagesDir = fileURLToPath(
  new URL('../../../packages/', import.meta.url),
);

const HARNESS_SELECT = '#new-session-harness';
const DIALOG = '[role="dialog"]';
const DIALOG_ERROR = '[role="dialog"] [role="alert"]';
const CHAT_INPUT = '[placeholder="Say something..."]';

/*
 * Starting a session creates its Vercel Sandbox before the page switches to
 * the new chat, which can take longer than a browser command's own timeout.
 */
const START_SESSION_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 1_000;

/**
 * A harness selected with `--harness`.
 */
export type HarnessSelection = {
  /**
   * Harness ID, which is the value of the harness's option in the new
   * session dialog.
   */
  harnessId: string;
  /**
   * Name of the harness's package, `packages/harness-<id>-v2`.
   */
  packageName: string;
};

/**
 * Returns the harness given with `--harness <id>`, or `undefined` if the
 * flag was not passed. Throws if there is no `packages/harness-<id>-v2`
 * package for the given ID.
 */
export function parseHarnessArg(): HarnessSelection | undefined {
  const args = process.argv.slice(2);
  const index = args.indexOf('--harness');
  if (index === -1) return undefined;
  const harnessId = args[index + 1];
  if (harnessId == null || harnessId.startsWith('--')) {
    throw new Error('`--harness` must be followed by a harness ID, e.g. `pi`.');
  }
  const packageJsonPath = `${packagesDir}harness-${harnessId}-v2/package.json`;
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `Unknown harness \`${harnessId}\`: there is no packages/harness-${harnessId}-v2 package.`,
    );
  }
  const { name } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    name: string;
  };
  return { harnessId, packageName: name };
}

/**
 * Starts a new session from the page's "new session" dialog and waits until
 * the page shows the new chat. Selects the given harness in the dialog, or
 * keeps the one it preselects if none is given. Returns the ID of the
 * harness the session was started on.
 *
 * The dialog stays open, showing an error, if starting the session fails,
 * and the page reloads into the new chat once it succeeds, so the new chat
 * is shown once the chat input is there and the dialog is gone.
 */
export async function startNewSession({
  runBrowserCommand,
  harness,
  log,
}: {
  runBrowserCommand: RunBrowserCommand;
  harness: HarnessSelection | undefined;
  log: (message: string) => void;
}): Promise<string> {
  runBrowserCommand([
    'find',
    'role',
    'button',
    'click',
    '--name',
    'new session',
  ]);
  runBrowserCommand(['wait', HARNESS_SELECT]);

  if (harness != null) {
    try {
      runBrowserCommand(['select', HARNESS_SELECT, harness.harnessId]);
    } catch (error) {
      throw new Error(
        `Could not select the harness \`${harness.harnessId}\` (${harness.packageName}) in the new session dialog: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const harnessId = runBrowserCommand(['get', 'value', HARNESS_SELECT]);
  log(
    `Starting a new session on the ${harnessId} harness${harness == null ? ' (preselected)' : ` (${harness.packageName})`}.`,
  );
  runBrowserCommand([
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Start session',
    '--exact',
  ]);

  const count = (selector: string) =>
    Number(runBrowserCommand(['get', 'count', selector]));
  const readPage = ():
    | { status: 'started' }
    | { status: 'failed'; error: string }
    | undefined => {
    try {
      if (count(DIALOG_ERROR) > 0) {
        return {
          status: 'failed',
          error: runBrowserCommand(['get', 'text', DIALOG_ERROR]),
        };
      }
      return count(DIALOG) === 0 && count(CHAT_INPUT) > 0
        ? { status: 'started' }
        : undefined;
    } catch {
      /*
       * The page cannot be queried while it reloads into the new chat.
       */
      return undefined;
    }
  };

  const deadline = Date.now() + START_SESSION_TIMEOUT_MS;
  for (;;) {
    const page = readPage();
    if (page?.status === 'started') return harnessId;
    if (page?.status === 'failed') {
      throw new Error(`Starting the new session failed: ${page.error}`);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out after ${START_SESSION_TIMEOUT_MS / 1000}s waiting for the new session to start.`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
