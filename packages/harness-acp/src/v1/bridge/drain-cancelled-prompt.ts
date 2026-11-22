/**
 * Reads and discards the update stream of a prompt whose turn was aborted
 * until the agent acknowledges the cancellation with that prompt's final stop.
 *
 * The ACP session keeps queueing the cancelled prompt's `session/update`
 * notifications and its stop, so leaving them in the queue would surface the
 * aborted turn's output in the next turn. A cancel the agent never
 * acknowledges leaves the session state unknown, which the caller must treat
 * as a session failure rather than prompt on top of it.
 */
export async function drainCancelledPrompt({
  nextUpdate,
  timeoutMs,
}: {
  nextUpdate: () => Promise<{ kind: string }>;
  timeoutMs: number;
}): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
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
  const drain = (async () => {
    for (;;) {
      if ((await nextUpdate()).kind !== 'session_update') return;
    }
  })();
  /* The losing side of the race may settle later; keep it handled. */
  void drain.catch(() => {});
  try {
    await Promise.race([drain, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
