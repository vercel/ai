import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
} from '@earendil-works/pi-agent-core';
import {
  createBashTool,
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateTail,
  type BashToolDetails,
  type BashToolInput,
} from '@earendil-works/pi-coding-agent';

const MAX_TIMEOUT_MS = 2_147_483_647;
const UPDATE_THROTTLE_MS = 500;

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

  let output = '';
  let lastUpdateAt = 0;
  let updateTimer: ReturnType<typeof setTimeout> | undefined;
  const emitUpdate = () => {
    updateTimer = undefined;
    lastUpdateAt = Date.now();
    onUpdate?.({
      content: [{ type: 'text', text: truncateTail(output).content }],
      details: undefined,
    });
  };
  const onText = (text: string) => {
    if (text.length === 0) return;
    output += text;
    if (onUpdate == null || updateTimer != null) return;
    const delay = UPDATE_THROTTLE_MS - (Date.now() - lastUpdateAt);
    if (delay <= 0) emitUpdate();
    else updateTimer = setTimeout(emitUpdate, delay);
  };

  let exitCode: number;
  try {
    const child = await session.spawn({
      command: input.command,
      workingDirectory: workDir,
      abortSignal:
        abortSignal == null
          ? timeoutController.signal
          : AbortSignal.any([abortSignal, timeoutController.signal]),
    });
    const [{ exitCode: code }] = await Promise.all([
      child.wait(),
      readStream({ stream: child.stdout, onText }),
      readStream({ stream: child.stderr, onText }),
    ]);
    exitCode = code;
  } catch (error) {
    if (timedOut) {
      throw new Error(
        appendStatus({
          text: output,
          status: `Command timed out after ${input.timeout} seconds`,
        }),
      );
    }
    if (abortSignal?.aborted) {
      throw new Error(
        appendStatus({ text: output, status: 'Command aborted' }),
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

  const truncation = truncateTail(output);
  let text = truncation.content || '(no output)';
  let details: BashToolDetails | undefined;
  if (truncation.truncated) {
    const fullOutputPath = `/tmp/pi-bash-${toolCallId}.log`;
    await session.writeTextFile({
      path: fullOutputPath,
      content: output,
      abortSignal,
    });
    details = { truncation, fullOutputPath };
    const startLine = truncation.totalLines - truncation.outputLines + 1;
    const endLine = truncation.totalLines;
    if (truncation.lastLinePartial) {
      const lastLine = output.slice(output.lastIndexOf('\n') + 1);
      text += `\n\n[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${formatSize(Buffer.byteLength(lastLine))}). Full output: ${fullOutputPath}]`;
    } else if (truncation.truncatedBy === 'lines') {
      text += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}. Full output: ${fullOutputPath}]`;
    } else {
      text += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${fullOutputPath}]`;
    }
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
 * in the working directory with stdout and stderr combined in arrival
 * order. While it runs, the output so far is reported through `onUpdate` at
 * most every 500ms. The result keeps the tail of the output
 * within Pi's line and byte limits; when that cuts output, the full output
 * is written to `/tmp/pi-bash-<toolCallId>.log` in the sandbox and the
 * notice names that file. Empty output becomes `(no output)`, and a nonzero
 * exit code is an error result ending with `Command exited with code N`.
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
