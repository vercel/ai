import { stripString } from './strip-work-dir';

/**
 * Work-directory stripping for streamed tool input, which arrives as JSON
 * fragments split at arbitrary offsets.
 *
 * Stripping each fragment on its own cannot work: the runtime can split a path
 * anywhere, so `/vercel/sandbox/claude-code-abc123/src/a.ts` may arrive as
 * `…claude-code-` + `abc123/src/a.ts` and neither half matches the prefix. The
 * absolute path — which carries the session id — would then reach the client.
 *
 * So this holds back the longest suffix of the stream that could still turn
 * out to be the start of a work-directory reference, and releases it once the
 * next fragment proves it either is or is not one. The held-back tail is
 * bounded by the work directory's own length, so a caller never waits on more
 * than that many characters, and {@link flush} releases whatever is left when
 * the input ends.
 */
export interface ToolInputWorkDirStripper {
  /** Stripped text safe to forward now. May be empty when all of it is held. */
  push(toolCallId: string, delta: string): string;
  /** Remaining held-back text, stripped. Call when the input block closes. */
  flush(toolCallId: string): string;
}

export function createToolInputWorkDirStripper(
  sessionWorkDir: string,
): ToolInputWorkDirStripper {
  /*
   * Correctness guard, not a fast path: with an empty work directory
   * `stripString` would rewrite every fragment character by character.
   */
  if (sessionWorkDir.length === 0) {
    return { push: (_toolCallId, delta) => delta, flush: () => '' };
  }

  /*
   * Match against the directory plus a separator: it has the bare directory as
   * a prefix, so holding back against it covers both the `workDir/path` and
   * bare `workDir` forms that `stripString` rewrites.
   */
  const pattern = `${sessionWorkDir}/`;
  const held = new Map<string, string>();

  return {
    push(toolCallId, delta) {
      const combined = (held.get(toolCallId) ?? '') + delta;
      const holdFrom = combined.length - partialSuffixLength(combined, pattern);
      held.set(toolCallId, combined.slice(holdFrom));
      return stripString(combined.slice(0, holdFrom), sessionWorkDir);
    },

    flush(toolCallId) {
      const remainder = held.get(toolCallId) ?? '';
      held.delete(toolCallId);
      return stripString(remainder, sessionWorkDir);
    },
  };
}

/**
 * Length of the longest suffix of `value` that is a proper prefix of
 * `pattern` — i.e. how much of the tail might still grow into a full match.
 * Zero when the tail cannot begin one.
 */
function partialSuffixLength(value: string, pattern: string): number {
  /*
   * A tail that already completes the pattern is not partial: `stripString`
   * rewrites it correctly, so hold nothing. Without this the trailing
   * separator alone reads as a fresh partial match, the bare directory before
   * it gets released, and `workDir/` is rewritten as `.` + `/` instead of ``.
   */
  if (value.endsWith(pattern)) return 0;

  const max = Math.min(value.length, pattern.length - 1);
  for (let length = max; length > 0; length--) {
    if (value.endsWith(pattern.slice(0, length))) return length;
  }
  return 0;
}
