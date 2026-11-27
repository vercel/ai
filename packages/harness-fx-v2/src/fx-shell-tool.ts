import type { FxShellInput } from './fx-builtin-tool-specs';
import type { FxBuiltinToolOutput, FxToolSandbox } from './fx-builtin-tools';
import { createFxOutputCapture, readFxChunks } from './fx-sandbox-output';
import {
  decodeFxModelSafeText,
  getUtf8ByteLength,
  isFxToolOutput,
  readFxIntegerField,
  resolveFxPathField,
  toFxToolError,
} from './fx-tool-paths';

/*
 * fx's limits for the shell result: `max_command_bytes` in
 * `core/terminal/contracts.zig` and `large_result_threshold_bytes` in
 * `core/session/result_store.zig`, which caps the inline size of the whole
 * serialized result, at https://github.com/vercel-labs/fx/tree/v0.0.16/src
 */
const MAX_COMMAND_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 16 * 1024;
const OMITTED_MARKER =
  '\n... bytes omitted; use full_output_handle for exact output ...\n';

/*
 * Bytes of command output the host keeps while a command runs. The result
 * shows at most `MAX_RESULT_BYTES`, cut to a head and a tail, and fx escapes
 * a byte it cannot show unchanged to up to four characters, so keeping this
 * much of both ends shows the same head and tail whatever the output size.
 */
const MAX_OUTPUT_HEAD_BYTES = 64 * 1024;
const MAX_OUTPUT_TAIL_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = MAX_OUTPUT_HEAD_BYTES + MAX_OUTPUT_TAIL_BYTES;
const DISCARDED_MARKER = `\n... bytes omitted: this call keeps at most ${MAX_OUTPUT_BYTES} bytes of command output and drops the rest ...\n`;

/*
 * Output past the kept bytes that is drained and dropped before the command
 * is stopped, so that a large but finite output still completes.
 */
const MAX_DISCARDED_OUTPUT_BYTES = 16 * 1024 * 1024;

/*
 * fx's retry guidance for failed commands (`failureRetryGuidance` in fx's
 * `tools/shell/shell.zig`).
 */
const PARSE_RETRY_GUIDANCE =
  'The shell could not parse this command (unmatched quote or syntax error), so nothing executed. Rewrite the command with corrected quoting or escaping and submit the full corrected command instead of rerunning the same text.';
const USAGE_RETRY_GUIDANCE =
  'The command exited with a usage error (missing or invalid arguments). Rebuild the command with the required arguments explicitly set, then submit the corrected command instead of rerunning it unchanged.';
const OUTPUT_LIMIT_RETRY_GUIDANCE =
  'The command produced more output than this call keeps, so the middle of its output is missing. Rerun it with a narrower output: filter it, show only its head or tail, or redirect it to a file and read that file in parts.';
const OUTPUT_LIMIT_STOPPED_RETRY_GUIDANCE =
  'The command produced more output than this call keeps and was stopped, so its output is incomplete. Rerun it with a narrower output: filter it, show only its head or tail, or redirect it to a file and read that file in parts.';

const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true });
const lenientUtf8Decoder = new TextDecoder();

/**
 * Returns whether a code point is one fx escapes because terminals do not
 * show it (`isNonPrintingCodepoint` in fx's `text_utils.zig`).
 */
function isNonPrintingCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x80 && codePoint <= 0x9f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x2028 && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x206f) ||
    codePoint === 0xfeff
  );
}

/**
 * Returns command output as fx's `output_delta` shows it: unchanged when it
 * is valid UTF-8 without NUL bytes (JSON escaping of the result keeps it
 * terminal-safe), otherwise with fx's terminal-safe escaping
 * (`terminalSafeToken` in fx's `text_utils.zig`): control bytes and invalid
 * UTF-8 bytes as `\xNN`, non-printing code points as `\u{XXXX}`.
 */
export function toFxTerminalSafeOutput(options: {
  /**
   * Exact output bytes.
   */
  bytes: Uint8Array;
}): { text: string; escaped: boolean } {
  const { bytes } = options;
  const text = decodeFxModelSafeText({ bytes });
  if (text !== undefined) return { text, escaped: false };

  const byteEscape = (byte: number) =>
    `\\x${byte.toString(16).padStart(2, '0')}`;
  let out = '';
  let index = 0;
  while (index < bytes.length) {
    const byte = bytes[index];
    if (byte < 0x20 || byte === 0x7f) {
      out += byteEscape(byte);
      index++;
      continue;
    }
    if (byte < 0x80) {
      out += String.fromCharCode(byte);
      index++;
      continue;
    }
    const length =
      byte >= 0xc0 && byte <= 0xdf
        ? 2
        : byte >= 0xe0 && byte <= 0xef
          ? 3
          : byte >= 0xf0 && byte <= 0xf7
            ? 4
            : 0;
    let sequence: string | undefined;
    if (length > 0 && index + length <= bytes.length) {
      try {
        sequence = strictUtf8Decoder.decode(
          bytes.subarray(index, index + length),
        );
      } catch {
        sequence = undefined;
      }
    }
    if (sequence === undefined) {
      out += byteEscape(byte);
      index++;
      continue;
    }
    const codePoint = sequence.codePointAt(0)!;
    out += isNonPrintingCodePoint(codePoint)
      ? `\\u{${codePoint.toString(16).padStart(4, '0')}}`
      : sequence;
    index += length;
  }
  return { text: out, escaped: true };
}

/**
 * Returns fx's retry guidance for a command that exited with a nonzero code:
 * guidance for shell parse errors and for usage errors, or `null`.
 */
export function getFxShellRetryGuidance(options: {
  /**
   * Exit code of the command, absent when it did not exit normally.
   */
  exitCode?: number;

  /**
   * Output of the command.
   */
  output: string;
}): string | null {
  const { exitCode, output } = options;
  if (exitCode == null || exitCode === 0) return null;
  const lines = output.split('\n').map(line => line.trim());
  const isShellError = (line: string) => {
    const colon = line.indexOf(':');
    if (colon <= 0 || line.slice(0, colon).includes(' ')) return false;
    const shell = line.slice(0, colon).split('/').pop()!;
    return ['zsh', 'bash', 'sh', 'dash'].includes(shell);
  };
  if (
    lines.some(
      line =>
        isShellError(line) &&
        /unmatched|syntax error|parse error|unterminated quoted string/i.test(
          line,
        ),
    )
  ) {
    return PARSE_RETRY_GUIDANCE;
  }
  if (
    lines
      .filter(Boolean)
      .slice(0, 4)
      .some(line => /^usage:/i.test(line))
  ) {
    return USAGE_RETRY_GUIDANCE;
  }
  return null;
}

/**
 * Returns text cut to head and tail around a marker so that it fits a byte
 * budget, cutting at UTF-8 character boundaries (`writeHeadTailBounded` in
 * fx's `text_utils.zig`, with the head rounded up).
 */
function toHeadTail(options: {
  /**
   * Text to cut.
   */
  text: string;

  /**
   * Maximum bytes of the result.
   */
  maxBytes: number;

  /**
   * Marker that replaces the cut text. Defaults to fx's marker, which names
   * `full_output_handle`.
   */
  marker?: string;
}): string {
  const { text, maxBytes, marker = OMITTED_MARKER } = options;
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= maxBytes) return text;
  const markerBytes = getUtf8ByteLength(marker);
  if (maxBytes <= markerBytes) return marker.slice(0, maxBytes);
  const retained = maxBytes - markerBytes;
  const headBytes = Math.ceil(retained / 2);
  const tailBytes = retained - headBytes;
  const isContinuation = (index: number) =>
    index < bytes.length && (bytes[index] & 0b1100_0000) === 0b1000_0000;
  let headEnd = headBytes;
  while (headEnd > 0 && isContinuation(headEnd)) headEnd--;
  let tailStart = bytes.length - tailBytes;
  while (tailStart < bytes.length && isContinuation(tailStart)) tailStart++;
  return (
    bytes.subarray(0, headEnd).toString('utf8') +
    marker +
    bytes.subarray(tailStart).toString('utf8')
  );
}

/**
 * Runs fx's `shell` on the sandbox.
 *
 * `run` runs the command to completion in the working directory (or `cwd`),
 * with stdout and stderr combined in arrival order, and stops it once
 * `timeout_ms` elapsed. `yield_time_ms` and `profile` are ignored: there is
 * no process that keeps running after the call, and sandbox commands never
 * read startup files. The result is fx's JSON snapshot in fx's key order.
 * When `output_delta` had to be escaped or cut to fit the 16 KiB result,
 * the exact output is written to `/tmp/fx-shell-<toolCallId>.log` in the
 * sandbox, which `full_output_handle` names. A nonzero exit code or a
 * timeout makes the result an error result.
 *
 * The host keeps at most 128 KiB of the output, its head and its tail, so a
 * command cannot exhaust the memory of the agent process: past that the
 * result shows the head and tail of what the host kept, `output_incomplete`
 * is true, and `full_output_handle` is null because the exact output is not
 * stored. A command whose output exceeds 16 MiB past that is stopped.
 *
 * `interact` and `stop` return an error result, since no command outlives
 * its run call. Throws `Command aborted` when the call is aborted.
 */
export async function runFxShell(options: {
  /**
   * Sandbox the tool runs on.
   */
  sandbox: FxToolSandbox;

  /**
   * ID of the tool call, used to name the full output file.
   */
  toolCallId: string;

  /**
   * Tool input given by the model.
   */
  input: FxShellInput;

  /**
   * Aborts the command.
   */
  abortSignal: AbortSignal;
}): Promise<FxBuiltinToolOutput> {
  const { sandbox, toolCallId, input, abortSignal } = options;
  const { session, workDir, home } = sandbox;
  const { action } = input;
  if (action === 'interact' || action === 'stop') {
    const sessionId =
      typeof input.session_id === 'string' ? input.session_id : '';
    return toFxToolError({
      text: `no shell has session_id ${JSON.stringify(sessionId)}: every command here completes in its run call and nothing keeps running`,
    });
  }
  if (action !== 'run') {
    return toFxToolError({
      text: 'shell field "action" must be run, interact or stop',
    });
  }
  if (typeof input.command !== 'string' || input.command.trim() === '') {
    return toFxToolError({
      text: 'shell field "command" must be a non-empty string',
    });
  }
  const { command } = input;
  if (getUtf8ByteLength(command) > MAX_COMMAND_BYTES) {
    return toFxToolError({
      text: `shell field "command" must be at most ${MAX_COMMAND_BYTES} bytes`,
    });
  }
  const timeoutMs = readFxIntegerField({
    toolName: 'shell',
    field: 'timeout_ms',
    value: input.timeout_ms,
    min: 1,
  });
  if (isFxToolOutput(timeoutMs)) return timeoutMs;
  const cwd = resolveFxPathField({
    toolName: 'shell',
    field: 'cwd',
    value: input.cwd,
    optional: true,
    workDir,
    home,
  });
  if (isFxToolOutput(cwd)) return cwd;
  if (
    (await session.stat({ path: cwd.abs, abortSignal }))?.type !== 'directory'
  ) {
    return toFxToolError({
      text: `shell field "cwd" is not a directory: ${cwd.abs}`,
    });
  }
  if (abortSignal.aborted) throw new Error('Command aborted');

  const timeoutController = new AbortController();
  let timedOut = false;
  const timeout =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          timeoutController.abort(new Error('timeout'));
        }, timeoutMs);
  const capture = createFxOutputCapture({
    headBytes: MAX_OUTPUT_HEAD_BYTES,
    tailBytes: MAX_OUTPUT_TAIL_BYTES,
  });
  const outputLimitController = new AbortController();
  let outputStopped = false;
  let stopCommand: (() => void) | undefined;
  const onChunk = (chunk: Uint8Array) => {
    capture.add(chunk);
    if (
      !outputStopped &&
      capture.totalBytes > MAX_OUTPUT_BYTES + MAX_DISCARDED_OUTPUT_BYTES
    ) {
      outputStopped = true;
      /*
       * Aborting makes the sandbox stop the command and end the streams it
       * writes to, so that the call returns even for a command whose
       * children keep those streams open after a kill.
       */
      outputLimitController.abort(new Error('output limit'));
      stopCommand?.();
    }
  };
  const startedAt = Date.now();
  const commandAbortSignal = AbortSignal.any([
    abortSignal,
    timeoutController.signal,
    outputLimitController.signal,
  ]);
  let exitCode: number | null = null;
  try {
    const child = await session.spawn({
      command,
      workingDirectory: cwd.abs,
      abortSignal: commandAbortSignal,
    });
    stopCommand = () => {
      // Stopping is best effort: not every sandbox implementation can kill.
      try {
        void Promise.resolve(child.kill()).catch(() => {});
      } catch {
        // Ignore a sandbox that cannot stop the command.
      }
    };
    const [result] = await Promise.all([
      child.wait(),
      readFxChunks({
        stream: child.stdout,
        onChunk,
        abortSignal: commandAbortSignal,
      }),
      readFxChunks({
        stream: child.stderr,
        onChunk,
        abortSignal: commandAbortSignal,
      }),
    ]);
    exitCode = result.exitCode;
  } catch (error) {
    if (abortSignal.aborted) throw new Error('Command aborted');
    if (!timedOut && !outputStopped) throw error;
  } finally {
    clearTimeout(timeout);
    stopCommand = undefined;
  }
  if (abortSignal.aborted) throw new Error('Command aborted');
  // A stopped command has no exit code of its own to report.
  if (timedOut || outputStopped) exitCode = null;
  const durationMs = Date.now() - startedAt;

  const complete = capture.complete;
  const bytes = capture.toBytes();
  const output = toFxTerminalSafeOutput({ bytes });
  const retryGuidance = timedOut
    ? null
    : !complete
      ? outputStopped
        ? OUTPUT_LIMIT_STOPPED_RETRY_GUIDANCE
        : OUTPUT_LIMIT_RETRY_GUIDANCE
      : getFxShellRetryGuidance({
          exitCode: exitCode ?? undefined,
          output: lenientUtf8Decoder.decode(bytes),
        });
  const serialize = (fields: {
    outputDelta: string;
    truncated: boolean;
    fullOutputHandle?: string;
  }) =>
    JSON.stringify({
      session_id: null,
      state: timedOut || outputStopped ? 'stopped' : 'completed',
      backend: 'sandbox',
      persistence: 'none',
      output_truncated: fields.truncated,
      output_incomplete: !complete,
      output_terminal_safe: true,
      full_output_handle: fields.fullOutputHandle ?? null,
      exit_code: exitCode,
      signal: null,
      termination_indeterminate: false,
      duration_ms: durationMs,
      accepted_bytes: null,
      error: timedOut
        ? 'TimeoutExpired'
        : outputStopped
          ? 'OutputLimitExceeded'
          : null,
      retry_guidance: retryGuidance,
      output_delta: fields.outputDelta,
    });
  const isError = timedOut || outputStopped || exitCode !== 0;
  const toOutput = (text: string): FxBuiltinToolOutput =>
    isError ? { text, isError: true } : { text };
  const marker = complete ? OMITTED_MARKER : DISCARDED_MARKER;

  /*
   * Finds the largest output budget whose serialized result fits the cap.
   * JSON escaping can grow the output, so the result is measured rather
   * than computed, like fx's `formatSnapshotWithLimit`.
   */
  const fitResult = (fields: { fullOutputHandle?: string }): string => {
    let best: string | undefined;
    let minimum = 0;
    let maximum = Math.min(getUtf8ByteLength(output.text), MAX_RESULT_BYTES);
    while (minimum <= maximum) {
      const budget = minimum + Math.floor((maximum - minimum) / 2);
      const candidate = serialize({
        outputDelta: toHeadTail({
          text: output.text,
          maxBytes: budget,
          marker,
        }),
        truncated: true,
        fullOutputHandle: fields.fullOutputHandle,
      });
      if (getUtf8ByteLength(candidate) <= MAX_RESULT_BYTES) {
        best = candidate;
        minimum = budget + 1;
      } else {
        if (budget === 0) break;
        maximum = budget - 1;
      }
    }
    return (
      best ??
      serialize({
        outputDelta: '',
        truncated: true,
        fullOutputHandle: fields.fullOutputHandle,
      })
    );
  };

  /*
   * Output that did not fit the kept bytes has no exact copy in the sandbox,
   * so the result shows its head and tail and names no full output handle.
   */
  if (!complete) return toOutput(fitResult({}));

  const plain = serialize({
    outputDelta: output.text,
    truncated: false,
  });
  if (!output.escaped && getUtf8ByteLength(plain) <= MAX_RESULT_BYTES) {
    return toOutput(plain);
  }

  const fullOutputHandle = `/tmp/fx-shell-${toolCallId.replace(/[^A-Za-z0-9._-]/g, '_')}.log`;
  await session.writeBinaryFile({
    path: fullOutputHandle,
    content: bytes,
    abortSignal,
  });
  const whole = serialize({
    outputDelta: output.text,
    truncated: false,
    fullOutputHandle,
  });
  if (getUtf8ByteLength(whole) <= MAX_RESULT_BYTES) return toOutput(whole);

  return toOutput(fitResult({ fullOutputHandle }));
}
