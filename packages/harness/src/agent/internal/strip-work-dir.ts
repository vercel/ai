import type { HarnessV1StreamPart } from '../../v1';

type ToolInputStreamPart = Extract<
  HarnessV1StreamPart,
  {
    type: 'tool-input-start' | 'tool-input-delta' | 'tool-input-end';
  }
>;

export function createToolInputWorkDirStripper({
  sessionWorkDir,
}: {
  sessionWorkDir: string;
}): (part: ToolInputStreamPart) => ToolInputStreamPart[] {
  const pendingByToolCallId = new Map<string, string>();

  return part => {
    if (sessionWorkDir.length === 0) return [part];

    if (part.type === 'tool-input-start') {
      pendingByToolCallId.set(part.id, '');
      return [part];
    }

    if (part.type === 'tool-input-delta') {
      const stripped = stripStreamingString({
        value: (pendingByToolCallId.get(part.id) ?? '') + part.delta,
        workDir: sessionWorkDir,
        final: false,
      });
      pendingByToolCallId.set(part.id, stripped.pending);
      return stripped.output.length === 0
        ? []
        : [{ ...part, delta: stripped.output }];
    }

    const pending = pendingByToolCallId.get(part.id);
    pendingByToolCallId.delete(part.id);
    if (pending == null || pending.length === 0) return [part];

    const stripped = stripStreamingString({
      value: pending,
      workDir: sessionWorkDir,
      final: true,
    });
    return stripped.output.length === 0
      ? [part]
      : [
          { type: 'tool-input-delta', id: part.id, delta: stripped.output },
          part,
        ];
  };
}

/**
 * Remove the session working-directory prefix from path-bearing fields of a
 * stream event, returning a new event for display to consumers.
 *
 * Harness adapters run the agent in a per-session working directory that is a
 * subdirectory of the sandbox root, and the agent's tools use absolute paths so
 * they resolve against the root regardless of where the runtime process
 * operates. The absolute paths are correct but noisy in a UI, so this strips
 * the prefix for the consumer-facing projection only.
 *
 * Blanket prefix replacement (rather than rewriting known path fields) is used
 * deliberately: `tool-result` results are free-form text — command stdout, grep
 * output — where paths can appear anywhere and field-aware rewriting is
 * impossible. The prefix is long and contains the session id, so it is unique
 * enough that replacing every occurrence is safe.
 */
export function stripWorkDir(
  part: HarnessV1StreamPart,
  sessionWorkDir: string,
): HarnessV1StreamPart {
  if (sessionWorkDir.length === 0) return part;

  switch (part.type) {
    case 'tool-input-delta':
      return { ...part, delta: stripString(part.delta, sessionWorkDir) };
    case 'tool-call':
      return { ...part, input: stripString(part.input, sessionWorkDir) };
    case 'tool-result':
      return {
        ...part,
        result: stripDeep(part.result, sessionWorkDir) as Extract<
          HarnessV1StreamPart,
          { type: 'tool-result' }
        >['result'],
      };
    case 'file-change':
      return { ...part, path: stripString(part.path, sessionWorkDir) };
    default:
      return part;
  }
}

/**
 * Replace occurrences of the working directory in a string. A reference to the
 * directory followed by a separator becomes workspace-relative
 * (`/work/dir/src/a.ts` → `src/a.ts`); a bare reference to the directory itself
 * becomes `.`.
 */
function stripString(value: string, workDir: string): string {
  return value.split(`${workDir}/`).join('').split(workDir).join('.');
}

function stripStreamingString({
  value,
  workDir,
  final,
}: {
  value: string;
  workDir: string;
  final: boolean;
}): { output: string; pending: string } {
  let remaining = value;
  let output = '';

  while (remaining.length > 0) {
    const matchIndex = remaining.indexOf(workDir);
    if (matchIndex >= 0) {
      output += remaining.slice(0, matchIndex);
      const followingIndex = matchIndex + workDir.length;
      if (followingIndex === remaining.length && !final) {
        return { output, pending: remaining.slice(matchIndex) };
      }
      if (remaining[followingIndex] === '/') {
        remaining = remaining.slice(followingIndex + 1);
      } else {
        output += '.';
        remaining = remaining.slice(followingIndex);
      }
      continue;
    }

    if (final) return { output: output + remaining, pending: '' };

    let pendingLength = Math.min(remaining.length, workDir.length - 1);
    while (
      pendingLength > 0 &&
      !workDir.startsWith(remaining.slice(-pendingLength))
    ) {
      pendingLength -= 1;
    }
    const outputLength = remaining.length - pendingLength;
    return {
      output: output + remaining.slice(0, outputLength),
      pending: remaining.slice(outputLength),
    };
  }

  return { output, pending: '' };
}

/**
 * Recursively strip the working directory from every string nested in an
 * arbitrary JSON-like value. Non-string leaves are returned unchanged.
 */
function stripDeep(value: unknown, workDir: string): unknown {
  if (typeof value === 'string') return stripString(value, workDir);
  if (Array.isArray(value)) return value.map(item => stripDeep(item, workDir));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = stripDeep(val, workDir);
    }
    return out;
  }
  return value;
}
