import { posix } from 'node:path';
import {
  generateId,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import type { HarnessV2DriveContext } from '../../../v2/harness-v2-drive-context';
import type {
  HarnessV2Log,
  HarnessV2LogEvent,
} from '../../../v2/harness-v2-log';
import type { HarnessV2NetworkSandboxSession } from '../../../v2/harness-v2-network-sandbox-session';
import type { HarnessAgentSession } from '../harness-agent-session';
import type {
  HarnessAgentEffectFunction,
  HarnessAgentExecuteHostToolFunction,
  HarnessAgentFinishStepFunction,
  HarnessAgentFinishTurnFunction,
  HarnessAgentGateBuiltinToolFunction,
  HarnessAgentLog,
  HarnessAgentLogEvent,
  HarnessAgentStreamWriter,
} from './types';

/**
 * Engine-written event types of `HarnessV2LogEvent`: every named type except
 * the adapter's own `harness:` namespace. The adapter-facing log allowlists
 * these (plus `harness:` events), so every engine-internal event of
 * `HarnessAgentLogEvent` stays hidden from the adapter, including ones added
 * later. Adding a named type to `HarnessV2LogEvent` requires updating this
 * table.
 */
const engineEventTypes = {
  submission: true,
  'effect-start': true,
  'effect-end': true,
} satisfies Record<
  Exclude<HarnessV2LogEvent['type'], `harness:${string}`>,
  true
>;

/**
 * Engine-written event types of `HarnessV2LogEvent`, as a listener allowlist.
 */
const engineEventTypeList = Object.keys(
  engineEventTypes,
) as (keyof typeof engineEventTypes)[];

/**
 * Returns whether an event type belongs to the adapter's `harness:` namespace.
 */
function isHarnessEventType(type: string): type is `harness:${string}` {
  return type.startsWith('harness:');
}

/**
 * Returns whether an engine log event is part of `HarnessV2LogEvent`: one of
 * its engine-written types or a `harness:` event.
 */
function isHarnessV2LogEvent(
  event: HarnessAgentLogEvent,
): event is Extract<HarnessAgentLogEvent, HarnessV2LogEvent> {
  return (
    Object.hasOwn(engineEventTypes, event.type) ||
    isHarnessEventType(event.type)
  );
}

/**
 * Narrows the engine log to the adapter-facing `HarnessV2Log` of one drive.
 *
 * - `read()` returns only `HarnessV2LogEvent` events (`submission`,
 *   `effect-start`, `effect-end` and `harness:` events), even when other types
 *   are requested through `types`. Hidden events still advance the returned
 *   `position`.
 * - `append()` accepts only `harness:` events and assigns a generated ID when
 *   none is given, so such an event is always written. Once the drive is
 *   aborted it rejects with the abort reason without writing.
 * - `onAppend()` fires only for the engine-written `HarnessV2LogEvent` types.
 *   An adapter can only append `harness:` events, so these are exactly the
 *   events the adapter did not write itself; engine-internal events never
 *   fire it. Listeners are unsubscribed when the drive is aborted, and
 *   registering after that registers nothing.
 */
function adaptHarnessV2Log(options: {
  /**
   * Engine log of the session.
   */
  log: HarnessAgentLog;

  /**
   * Abort signal of the drive that owns the returned log.
   */
  abortSignal: AbortSignal;
}): HarnessV2Log {
  const { log, abortSignal } = options;

  return {
    async read(readOptions) {
      const { events, position } = await log.read({
        after: readOptions?.after,
        types: readOptions?.types,
      });
      return { events: events.filter(isHarnessV2LogEvent), position };
    },

    async append(event) {
      if (typeof event.type !== 'string' || !isHarnessEventType(event.type)) {
        throw new Error(
          `HarnessV2Log: only \`harness:\` events can be appended, received \`${String(event.type)}\`.`,
        );
      }
      if (abortSignal.aborted) throw abortSignal.reason;
      return log.append({
        type: event.type,
        data: event.data,
        id: event.id ?? generateId(),
      });
    },

    onAppend(listener) {
      if (abortSignal.aborted) return () => {};
      const unsubscribe = log.onAppend({
        listener: () => listener(),
        config: { types: engineEventTypeList },
      });
      const release = () => {
        abortSignal.removeEventListener('abort', release);
        unsubscribe();
      };
      abortSignal.addEventListener('abort', release, { once: true });
      return release;
    },
  };
}

/**
 * Assembles the `HarnessV2DriveContext` passed to the harness adapter's
 * `drive()` from the engine pieces created for one drive.
 *
 * The effect, finish, host tool and built-in tool gate functions and both
 * signals are passed through unchanged. `unsafeEmit()` writes an untagged part
 * through the writer, which drops it once the drive is aborted. The log is
 * narrowed to `HarnessV2Log` (see `adaptHarnessV2Log`).
 *
 * `sandbox()` lazily resolves the session's sandbox session and work directory
 * once per drive and returns the same result to every call. A failed
 * resolution is not cached, so a later call tries again. The work directory is
 * created if it does not exist (see `resolveSessionWorkDir`).
 */
export function createDriveContext(options: {
  /**
   * Session being driven.
   */
  session: HarnessAgentSession;

  /**
   * Engine log of the session.
   */
  log: HarnessAgentLog;

  /**
   * Effect function of the drive.
   */
  effect: HarnessAgentEffectFunction;

  /**
   * Writer for the session's stream, owned by the drive.
   */
  writer: HarnessAgentStreamWriter;

  /**
   * Step finish function of the drive.
   */
  finishStep: HarnessAgentFinishStepFunction;

  /**
   * Turn finish function of the drive.
   */
  finishTurn: HarnessAgentFinishTurnFunction;

  /**
   * Host tool execution function of the drive.
   */
  executeHostTool: HarnessAgentExecuteHostToolFunction;

  /**
   * Built-in tool gate function of the drive.
   */
  gateBuiltinTool: HarnessAgentGateBuiltinToolFunction;

  /**
   * Identifier of the harness adapter, part of the default work directory.
   */
  harnessId: string;

  /**
   * Normalized `sandboxConfig.workDir`, relative to the sandbox's default
   * working directory, if configured.
   */
  workDir?: string;

  /**
   * Aborts when the drive must stop at once.
   */
  abortSignal: AbortSignal;

  /**
   * Aborts when the drive should stop at the next safe point.
   */
  yieldAbortSignal: AbortSignal;

  /**
   * End of the drive's time budget (epoch ms), if known.
   */
  deadline?: number;
}): HarnessV2DriveContext {
  const {
    session,
    log,
    effect,
    writer,
    finishStep,
    finishTurn,
    executeHostTool,
    gateBuiltinTool,
    harnessId,
    workDir,
    abortSignal,
    yieldAbortSignal,
    deadline,
  } = options;

  let sandbox: ReturnType<HarnessV2DriveContext['sandbox']> | undefined;

  /**
   * Resolves the session's sandbox session and its work directory.
   */
  async function resolveSandbox(): ReturnType<
    HarnessV2DriveContext['sandbox']
  > {
    const sandboxSession = await session.getSandboxSession();
    const sessionWorkDir = await resolveSessionWorkDir({
      sandboxSession,
      harnessId,
      sessionId: session.sessionId,
      workDir,
      abortSignal,
    });
    return { session: sandboxSession, workDir: sessionWorkDir };
  }

  const context: HarnessV2DriveContext = {
    log: adaptHarnessV2Log({ log, abortSignal }),
    effect,
    executeHostTool,
    gateBuiltinTool,
    sandbox() {
      if (sandbox == null) {
        const resolution = resolveSandbox();
        sandbox = resolution;
        resolution.catch(() => {
          if (sandbox === resolution) sandbox = undefined;
        });
      }
      return sandbox;
    },
    finishStep,
    finishTurn,
    unsafeEmit: part => writer.unsafeEmit(part),
    abortSignal,
    yieldAbortSignal,
  };
  if (deadline != null) context.deadline = deadline;
  return context;
}

/**
 * Resolves a session's absolute work directory in its sandbox and ensures it
 * exists.
 *
 * The base is the sandbox's default working directory: the session's
 * `defaultWorkingDirectory` when it has one, otherwise the output of `pwd` in
 * the sandbox. The work directory is the configured `workDir` relative to that
 * base, or `<harnessId>-<sessionId>` (each part URI-encoded as one path
 * segment) when none is configured, so sessions sharing a sandbox stay apart.
 * The directory is created with `mkdir -p`, so resolving it again is safe.
 * Rejects if `pwd` or `mkdir` fails or `pwd` reports a relative path.
 */
async function resolveSessionWorkDir(options: {
  /**
   * Sandbox session the work directory belongs to.
   */
  sandboxSession: SandboxSession | HarnessV2NetworkSandboxSession;

  /**
   * Identifier of the harness adapter, part of the default work directory.
   */
  harnessId: string;

  /**
   * Identifier of the agent session, part of the default work directory.
   */
  sessionId: string;

  /**
   * Normalized work directory relative to the sandbox's default working
   * directory, if configured.
   */
  workDir?: string;

  /**
   * Aborts the sandbox commands.
   */
  abortSignal: AbortSignal;
}): Promise<string> {
  const { sandboxSession, harnessId, sessionId, workDir, abortSignal } =
    options;
  const base = await resolveDefaultWorkingDirectory({
    sandboxSession,
    abortSignal,
  });
  const sessionWorkDir = posix.join(
    base,
    workDir ??
      `${encodePathSegment({ value: harnessId })}-${encodePathSegment({ value: sessionId })}`,
  );

  const result = await sandboxSession.run({
    command: 'mkdir -p "$WORK_DIR"',
    env: { WORK_DIR: sessionWorkDir },
    abortSignal,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to create sandbox work directory ${sessionWorkDir} (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }
  return sessionWorkDir;
}

/**
 * Returns the sandbox's default working directory without a trailing slash.
 */
async function resolveDefaultWorkingDirectory(options: {
  /**
   * Sandbox session to inspect.
   */
  sandboxSession: SandboxSession | HarnessV2NetworkSandboxSession;

  /**
   * Aborts the `pwd` command.
   */
  abortSignal: AbortSignal;
}): Promise<string> {
  const { sandboxSession, abortSignal } = options;
  if ('defaultWorkingDirectory' in sandboxSession) {
    return sandboxSession.defaultWorkingDirectory;
  }

  const result = await sandboxSession.run({ command: 'pwd', abortSignal });
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to resolve sandbox default working directory (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }
  const cwd = result.stdout.trim();
  if (!posix.isAbsolute(cwd)) {
    throw new Error(
      `Failed to resolve sandbox default working directory: expected an absolute path, got ${JSON.stringify(cwd)}.`,
    );
  }
  return cwd === '/' ? cwd : cwd.replace(/\/+$/, '');
}

/**
 * Encodes a value as exactly one path segment that cannot be empty or refer
 * to the current or parent directory.
 */
function encodePathSegment(options: {
  /**
   * Value to encode.
   */
  value: string;
}): string {
  const encoded = encodeURIComponent(options.value);
  if (encoded === '') return '%';
  if (encoded === '.') return '%2E';
  if (encoded === '..') return '%2E%2E';
  return encoded;
}
