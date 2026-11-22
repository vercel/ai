/**
 * Reads and discards the update stream of a prompt whose turn was aborted
 * until the agent acknowledges the cancellation with that prompt's final stop.
 *
 * The ACP session keeps queueing the cancelled prompt's `session/update`
 * notifications and its stop, so leaving them in the queue would surface the
 * aborted turn's output in the next turn. An agent that answers the cancelled
 * prompt with an error instead of a stop ends the drain too: the ACP SDK
 * clears queued errors at the start of the next prompt. Only an agent that
 * acknowledges the cancellation at all leaves the session state unknown, which
 * the caller must treat as a session failure rather than prompt on top of it.
 */
export async function drainCancelledPrompt({
  nextUpdate,
  timeoutMs,
}: {
  nextUpdate: () => Promise<{ kind: string }>;
  timeoutMs: number;
}): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          'The ACP agent did not acknowledge the cancelled prompt before the next turn.',
        ),
      );
    }, timeoutMs);
    timer.unref?.();
  });
  /* A rejected prompt is the end of the cancelled turn, not a drain failure. */
  const drain = (async () => {
    for (;;) {
      if (stopped) return;
      if ((await nextUpdate()).kind !== 'session_update') return;
    }
  })().catch(() => {});
  try {
    await Promise.race([drain, timedOut]);
  } finally {
    stopped = true;
    clearTimeout(timer);
  }
}
