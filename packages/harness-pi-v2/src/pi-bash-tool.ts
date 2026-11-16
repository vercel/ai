import { shellQuote } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
} from '@earendil-works/pi-agent-core';
import {
  createBashTool,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
  type BashToolDetails,
  type BashToolInput,
  type TruncationResult,
} from '@earendil-works/pi-coding-agent';

const MAX_TIMEOUT_MS = 2_147_483_647;
const UPDATE_THROTTLE_MS = 500;

/**
 * Bytes of command output that the host keeps for the displayed result. Pi
 * shows at most `DEFAULT_MAX_BYTES` bytes of the end of the output; twice that
 * limit leaves enough output to cut the retained text at a line boundary
 * instead of in the middle of a line. A command that produces more output is
 * not limited, but the host only ever holds this much of it.
 */
const TARGET_RETAINED_OUTPUT_BYTES = 2 * DEFAULT_MAX_BYTES;

/**
 * Bytes of output above which the retained tail is cut back to
 * `TARGET_RETAINED_OUTPUT_BYTES`, and therefore the hard limit of what the
 * output of a command can add to the host's memory. Trimming at twice the
 * target runs the trim once per target's worth of output instead of once per
 * chunk.
 */
const MAX_RETAINED_OUTPUT_BYTES = 2 * TARGET_RETAINED_OUTPUT_BYTES;

/**
 * Validates a bash timeout given in seconds and returns it in milliseconds,
 * or `undefined` when no timeout is given. Throws with Pi's messages for a
 * timeout that is not a positive finite number or exceeds the maximum.
 */
function resolveTimeoutMs(options: {
  /**
   * Timeout in seconds, if given.
   */
  timeout?: number;
}): number | undefined {
  const { timeout } = options;
  if (timeout === undefined) return undefined;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('Invalid timeout: must be a finite number of seconds');
  }
  const timeoutMs = timeout * 1000;
  if (timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(
      `Invalid timeout: maximum is ${MAX_TIMEOUT_MS / 1000} seconds`,
    );
  }
  return timeoutMs;
}

/**
 * Reads a byte stream to its end, passing each decoded chunk to `onText`.
 */
async function readStream(options: {
  /**
   * Stream to read.
   */
  stream: ReadableStream<Uint8Array>;

  /**
   * Receives each decoded chunk.
   */
  onText: (text: string) => void;
}): Promise<void> {
  const decoder = new TextDecoder();
  const reader = options.stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      options.onText(decoder.decode(value, { stream: true }));
    }
    options.onText(decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

/**
 * Appends a status line to command output, separated by an empty line.
 */
function appendStatus(options: {
  /**
   * Command output, possibly empty.
   */
  text: string;

  /**
   * Status line to append.
   */
  status: string;
}): string {
  return `${options.text ? `${options.text}\n\n` : ''}${options.status}`;
}

/**
 * Bytes of output above which the host stops a command. Pi keeps the end of
 * the output for display, so this budget does not limit what a command shows;
 * it only stops a command that floods its output, which would otherwise keep
 * the sandbox busy until its timeout and grow the log file in the sandbox
 * without bound.
 */
const MAX_COMMAND_OUTPUT_BYTES = 16 * 1024 * 1024;

/**
 * Collects the output of a command for the result while keeping only a bounded
 * tail of it in the host's memory.
 *
 * The end of the output is kept for the displayed result, and the bytes and
 * lines of the whole output are counted for the truncation notice, as Pi's
 * bash tool reports them. Everything before the retained tail is dropped, so a
 * command whose output is far above the display limits cannot grow the host's
 * memory beyond `MAX_RETAINED_OUTPUT_BYTES`.
 *
 * Exported for the tool's tests, not as part of the package's API.
 */
export class RetainedOutput {
  /**
   * Tail of the output, at most `MAX_RETAINED_OUTPUT_BYTES` bytes.
   */
  private tail = '';
  private tailBytes = 0;
  private tailStartsAtLineBoundary = true;

  /**
   * Bytes of the whole output.
   */
  private totalBytes = 0;
  private completedLines = 0;
  private totalLines = 0;
  private currentLineBytes = 0;
  private hasOpenLine = false;

  /**
   * Appends one decoded chunk of output, dropping the start of the retained
   * tail once it exceeds the hard limit, so that trimming does not run for
   * every chunk.
   */
  append(text: string): void {
    if (text.length === 0) return;

    const bytes = Buffer.byteLength(text, 'utf-8');
    this.totalBytes += bytes;
    this.tail += text;
    this.tailBytes += bytes;
    if (this.tailBytes > MAX_RETAINED_OUTPUT_BYTES) this.trimTail();

    let newlines = 0;
    let lastNewline = -1;
    for (
      let index = text.indexOf('\n');
      index !== -1;
      index = text.indexOf('\n', index + 1)
    ) {
      newlines++;
      lastNewline = index;
    }
    if (newlines === 0) {
      this.currentLineBytes += bytes;
      this.hasOpenLine = true;
    } else {
      this.completedLines += newlines;
      const lastLine = text.slice(lastNewline + 1);
      this.currentLineBytes = Buffer.byteLength(lastLine, 'utf-8');
      this.hasOpenLine = lastLine.length > 0;
    }
    this.totalLines = this.completedLines + (this.hasOpenLine ? 1 : 0);
  }

  /**
   * Returns the end of the output truncated to Pi's line and byte limits,
   * along with the counts of the whole output.
   */
  snapshot(): TruncationResult {
    const truncation = truncateTail(this.getSnapshotText());
    const truncated =
      this.totalLines > DEFAULT_MAX_LINES ||
      this.totalBytes > DEFAULT_MAX_BYTES;
    return {
      ...truncation,
      truncated,
      truncatedBy: truncated
        ? (truncation.truncatedBy ??
          (this.totalBytes > DEFAULT_MAX_BYTES ? 'bytes' : 'lines'))
        : null,
      totalLines: this.totalLines,
      totalBytes: this.totalBytes,
    };
  }

  /**
   * Bytes of the last line of the output, whether or not it is retained.
   */
  get lastLineBytes(): number {
    return this.currentLineBytes;
  }

  /**
   * Bytes of the whole output.
   */
  get bytesReceived(): number {
    return this.totalBytes;
  }

  /**
   * Bytes of the output currently retained in memory.
   */
  get retainedBytes(): number {
    return this.tailBytes;
  }

  /**
   * Drops the start of the retained tail down to the target, at a UTF-8
   * character boundary.
   */
  private trimTail(): void {
    const buffer = Buffer.from(this.tail, 'utf-8');
    if (buffer.length <= TARGET_RETAINED_OUTPUT_BYTES) {
      this.tailBytes = buffer.length;
      return;
    }

    let start = buffer.length - TARGET_RETAINED_OUTPUT_BYTES;
    while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) start++;

    this.tailStartsAtLineBoundary =
      start > 0 ? buffer[start - 1] === 0x0a : this.tailStartsAtLineBoundary;
    this.tail = buffer.subarray(start).toString('utf-8');
    this.tailBytes = Buffer.byteLength(this.tail, 'utf-8');
  }

  /**
   * Returns the retained tail, without its first line when that line was cut.
   */
  private getSnapshotText(): string {
    if (this.tailStartsAtLineBoundary) return this.tail;
    const firstNewline = this.tail.indexOf('\n');
    return firstNewline === -1 ? this.tail : this.tail.slice(firstNewline + 1);
  }
}

/**
 * Wraps a command so that its combined output is also written to
 * `fullOutputPath` in the sandbox, and so that the exit code is the command's
 * exit code rather than the exit code of the pipeline. The command streams its
 * output through `tee`, so the host does not have to hold the output that
 * `tee` writes.
 *
 * The command keeps its own line, so a trailing comment or `;` cannot swallow
 * the closing brace.
 */
function captureFullOutput(options: {
  /**
   * Command given by the model.
   */
  command: string;

  /**
   * Path in the sandbox to write the full output to.
   */
  fullOutputPath: string;
}): string {
  const { command, fullOutputPath } = options;
  return `{\n${command}\n} 2>&1 | tee ${shellQuote(fullOutputPath)}; exit "\${PIPESTATUS[0]}"`;
}

/**
 * Runs a bash command in the sandbox like Pi's bash tool runs it locally.
 */
async function executeBash(options: {
  /**
   * Sandbox session to run the command in.
   */
  session: SandboxSession;

  /**
   * Working directory of the command.
   */
  workDir: string;

  /**
   * ID of the tool call, used to name the full output file.
   */
  toolCallId: string;

  /**
   * Tool input given by the model.
   */
  input: BashToolInput;

  /**
   * Aborts the command.
   */
  abortSignal?: AbortSignal;

  /**
   * Receives the output so far while the command runs.
   */
  onUpdate?: AgentToolUpdateCallback<BashToolDetails | undefined>;
}): Promise<AgentToolResult<BashToolDetails | undefined>> {
  const { session, workDir, toolCallId, input, abortSignal, onUpdate } =
    options;
  const timeoutMs = resolveTimeoutMs({ timeout: input.timeout });
  if (abortSignal?.aborted) throw new Error('Command aborted');

  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutHandle =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          timeoutController.abort(new Error('timeout'));
        }, timeoutMs);

  const output = new RetainedOutput();
  const fullOutputPath = `/tmp/pi-bash-${toolCallId}.log`;
  let stopped = false;
  let stopCommand: (() => void) | undefined;
  let lastUpdateAt = 0;
  let updateTimer: ReturnType<typeof setTimeout> | undefined;
  const emitUpdate = () => {
    updateTimer = undefined;
    lastUpdateAt = Date.now();
    onUpdate?.({
      content: [{ type: 'text', text: output.snapshot().content }],
      details: undefined,
    });
  };
  const onText = (text: string) => {
    if (text.length === 0) return;
    output.append(text);
    if (output.bytesReceived > MAX_COMMAND_OUTPUT_BYTES) stopCommand?.();
    if (onUpdate == null || updateTimer != null) return;
    const delay = UPDATE_THROTTLE_MS - (Date.now() - lastUpdateAt);
    if (delay <= 0) emitUpdate();
    else updateTimer = setTimeout(emitUpdate, delay);
  };
  /**
   * Removes the file that every command writes its output to while the result
   * does not name it. A leftover file is harmless, so failures are ignored.
   */
  const removeFullOutputFile = async () => {
    try {
      await session.deleteFile({ path: fullOutputPath });
    } catch {
      // The command's output is what matters here.
    }
  };

  let exitCode: number;
  try {
    const child = await session.spawn({
      command: captureFullOutput({ command: input.command, fullOutputPath }),
      workingDirectory: workDir,
      abortSignal:
        abortSignal == null
          ? timeoutController.signal
          : AbortSignal.any([abortSignal, timeoutController.signal]),
    });
    stopCommand = () => {
      if (stopped) return;
      stopped = true;
      // Stopping is best effort: not every sandbox implementation can kill.
      void Promise.resolve(child.kill()).catch(() => {});
    };
    const [{ exitCode: code }] = await Promise.all([
      child.wait(),
      readStream({ stream: child.stdout, onText }),
      readStream({ stream: child.stderr, onText }),
    ]);
    exitCode = code;
  } catch (error) {
    await removeFullOutputFile();
    if (timedOut) {
      throw new Error(
        appendStatus({
          text: output.snapshot().content,
          status: `Command timed out after ${input.timeout} seconds`,
        }),
      );
    }
    if (abortSignal?.aborted) {
      throw new Error(
        appendStatus({
          text: output.snapshot().content,
          status: 'Command aborted',
        }),
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
    if (updateTimer != null) {
      clearTimeout(updateTimer);
      emitUpdate();
    }
  }

  const truncation = output.snapshot();
  let text = truncation.content || '(no output)';
  let details: BashToolDetails | undefined;
  if (truncation.truncated) {
    details = { truncation, fullOutputPath };
    const startLine = truncation.totalLines - truncation.outputLines + 1;
    const endLine = truncation.totalLines;
    if (truncation.lastLinePartial) {
      text += `\n\n[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${formatSize(output.lastLineBytes)}). Full output: ${fullOutputPath}]`;
    } else if (truncation.truncatedBy === 'lines') {
      text += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}. Full output: ${fullOutputPath}]`;
    } else {
      text += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${fullOutputPath}]`;
    }
  } else {
    await removeFullOutputFile();
  }

  if (stopped) {
    return {
      content: [
        {
          type: 'text',
          text: appendStatus({
            text,
            status: `Command stopped after producing more than ${formatSize(MAX_COMMAND_OUTPUT_BYTES)} of output`,
          }),
        },
      ],
      details,
      isError: true,
    };
  }

  if (exitCode !== 0) {
    return {
      content: [
        {
          type: 'text',
          text: appendStatus({
            text,
            status: `Command exited with code ${exitCode}`,
          }),
        },
      ],
      details,
      isError: true,
    };
  }
  return { content: [{ type: 'text', text }], details };
}

/**
 * Creates Pi's bash tool, running commands in a sandbox.
 *
 * The tool is Pi's own bash tool with its execution replaced: a command runs
 * in the working directory with stdout and stderr combined in arrival order,
 * and the sandbox writes that output to `/tmp/pi-bash-<toolCallId>.log` while
 * the host keeps only a bounded tail of it in memory. While the command runs,
 * the output so far is reported through `onUpdate` at most every 500ms. The
 * result keeps the tail of the output within Pi's line and byte limits; when
 * that cuts output, the notice names the file that holds the full output, and
 * otherwise the file is removed. Empty output becomes `(no output)`, and a
 * nonzero exit code is an error result ending with `Command exited with code
 * N`. A command that produces more than 16MB of output is stopped with an
 * error result ending with `Command stopped after producing more than 16.0MB
 * of output`.
 *
 * Throws for an invalid timeout, with `Command timed out after N seconds`
 * when the timeout elapsed, and with `Command aborted` when the signal
 * aborted, in both cases after the output so far.
 */
export function createPiBashTool(options: {
  /**
   * Sandbox session to run commands in.
   */
  session: SandboxSession;

  /**
   * Working directory of the commands.
   */
  workDir: string;
}): ReturnType<typeof createBashTool> {
  const { session, workDir } = options;
  return {
    ...createBashTool(workDir),
    execute: (toolCallId, input, abortSignal, onUpdate) =>
      executeBash({
        session,
        workDir,
        toolCallId,
        input,
        abortSignal,
        onUpdate,
      }),
  };
}
