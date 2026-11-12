import { posix } from 'node:path';
import { isSerializableValue, type JSONSchema7 } from '@ai-sdk/provider';
import {
  asSchema,
  generateId,
  getErrorMessage,
  type Context,
  type Experimental_SandboxSession as SandboxSession,
  type ModelMessage,
  type ToolSet,
  type UserModelMessage,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import {
  NoOutputGeneratedError,
  type AgentCallParameters,
  type AgentStreamParameters,
  type GenerateTextResult,
  type OutputInterface as Output,
  type StreamTextResult,
} from 'ai';
import {
  DefaultHarnessAgentSession,
  type HarnessAgentSession,
} from './harness-agent-session';
import { InMemoryWorld } from './in-memory-world';
import { createDriveContext } from './internal/create-drive-context';
import { createEffectFunction } from './internal/create-effect-function';
import { createExecuteHostToolFunction } from './internal/create-execute-host-tool-function';
import { createFinishFunctions } from './internal/create-finish-functions';
import { createGateBuiltinToolFunction } from './internal/create-gate-builtin-tool-function';
import { createLog } from './internal/create-log';
import {
  createStreamWriter,
  decodeStreamRecords,
} from './internal/create-stream-writer';
import {
  HarnessAfterFinishError,
  HarnessBeforeStartError,
} from './internal/errors';
import { HarnessGenerateTextResult } from './internal/harness-generate-text-result';
import { HarnessStreamTextResult } from './internal/harness-stream-text-result';
import type {
  HarnessAgentFinishTurnFunction,
  HarnessAgentLog,
  HarnessAgentStreamPart,
  HarnessAgentStreamWriter,
} from './internal/types';
import type {
  HarnessAgentSandboxConfig,
  HarnessAgentSettings,
} from '../harness-agent-settings';
import type { HarnessV2 } from '../../v2/harness-v2';
import type { HarnessV2NetworkSandboxSession } from '../../v2/harness-v2-network-sandbox-session';
import type { HarnessV2Usage } from '../../v2/harness-v2-stream-part';
import type {
  HarnessV2ToolSpec,
  HarnessV2TurnSettings,
} from '../../v2/harness-v2-turn-settings';
import type { World } from '@workflow/world';

/**
 * Call options supported by `generate()` and `stream()`. `options` is accepted
 * and ignored, since the settings that would use it are rejected.
 */
const supportedCallOptions = new Set<string | symbol>([
  'prompt',
  'messages',
  'session',
  'options',
  'abortSignal',
]);

/**
 * Run IDs of the sessions with a call in progress in this process, per World:
 * from the moment the call is accepted until its drive ended.
 */
const busySessions = new WeakMap<World, Set<string>>();

/**
 * Additional call input required to associate work with an agent session.
 */
interface HarnessAgentCallExtensions {
  /**
   * Session whose sandbox and identity are used for the call.
   */
  session: HarnessAgentSession;
}

/**
 * Combines adapter built-ins with user tools, letting user tools take precedence.
 */
type HarnessAllTools<
  THarness extends HarnessV2<any>,
  TUserTools extends ToolSet,
> = Omit<THarness['builtinTools'], keyof TUserTools> & TUserTools;

/**
 * Consumer-facing agent configured with a HarnessV2 adapter.
 *
 * A supplied `World` makes the agent durable; otherwise it uses an in-memory
 * world. Every session must include a sandbox session and a stable sandbox ID.
 *
 * ```ts
 * const agent = new HarnessAgent({
 *   harness,
 *   world,
 *   getSandboxSession: ({ sandboxId }) => sandboxProvider.getSession({ sandboxId }),
 * });
 * ```
 */
export class HarnessAgent<
  THarness extends HarnessV2<any> = HarnessV2,
  TUserTools extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
  CALL_OPTIONS = never,
> {
  /**
   * Optional application-assigned agent identifier.
   */
  readonly id: string | undefined;

  /**
   * Built-in and user tools available to this agent.
   */
  readonly tools: HarnessAllTools<THarness, TUserTools>;

  /**
   * Identifier of the configured harness adapter.
   */
  readonly harnessId: string;

  /**
   * Whether this agent produces structured output.
   */
  readonly hasOutput = false;

  private readonly harness: HarnessV2<THarness['builtinTools']>;
  private readonly world: World;
  private readonly getSandboxSession: NonNullable<
    HarnessAgentSettings['getSandboxSession']
  >;

  /**
   * The app's own tools from the `tools` setting, without the harness's
   * built-in tools.
   */
  private readonly userTools: ToolSet;

  /**
   * Turn settings for every `prompt` submission, built once on first use.
   */
  private turnSettings: Promise<HarnessV2TurnSettings> | undefined;

  /**
   * Supported sandbox settings. `workDir` is normalized and relative to the
   * sandbox's default working directory; when omitted, each session uses its
   * own `<harnessId>-<sessionId>` directory.
   */
  private readonly sandboxConfig: Pick<HarnessAgentSandboxConfig, 'workDir'>;

  /**
   * Creates the agent from its settings.
   */
  constructor(
    settings: HarnessAgentSettings<
      THarness,
      TUserTools,
      RUNTIME_CONTEXT,
      OUTPUT,
      CALL_OPTIONS
    >,
  ) {
    if (settings.harness.specificationVersion !== 'harness-v2') {
      throw new Error(
        `HarnessAgent: expected \`harness.specificationVersion\` to be \`harness-v2\`, received \`${settings.harness.specificationVersion}\`.`,
      );
    }

    if (typeof settings.getSandboxSession !== 'function') {
      throw new Error(
        'HarnessAgent: `getSandboxSession` is required with HarnessV2.',
      );
    }

    this.harness = settings.harness;

    const unsupportedSetting = Reflect.ownKeys(settings).find(
      key =>
        key !== 'harness' &&
        key !== 'tools' &&
        key !== 'world' &&
        key !== 'getSandboxSession' &&
        key !== 'sandboxConfig',
    );
    if (unsupportedSetting !== undefined) {
      throw new Error(
        `HarnessAgent: setting \`${String(unsupportedSetting)}\` is not supported.`,
      );
    }

    const sandboxConfig = settings.sandboxConfig ?? {};
    const unsupportedSandboxSetting = Reflect.ownKeys(sandboxConfig).find(
      key => key !== 'workDir',
    );
    if (unsupportedSandboxSetting !== undefined) {
      throw new Error(
        `HarnessAgent: setting \`sandboxConfig.${String(unsupportedSandboxSetting)}\` is not supported.`,
      );
    }
    this.sandboxConfig =
      sandboxConfig.workDir == null
        ? {}
        : { workDir: normalizeWorkDir({ workDir: sandboxConfig.workDir }) };

    this.world = settings.world ?? new InMemoryWorld();
    this.getSandboxSession = settings.getSandboxSession;
    this.id = settings.id;
    this.harnessId = this.harness.harnessId;
    this.userTools = settings.tools ?? {};
    this.tools = {
      ...this.harness.builtinTools,
      ...settings.tools,
    } as HarnessAllTools<THarness, TUserTools>;
  }

  /**
   * Creates a session associated with a sandbox and a stable sandbox ID, and
   * the World run that holds the session's log and stream.
   *
   * Uses the sandbox session's ID when available, otherwise `options.sandboxId`.
   * A sandbox session object is optional; when omitted, it is resolved lazily
   * from the stable sandbox ID.
   *
   * Every call creates a new run, whose ID the World mints. To continue a
   * session later, or in another process, keep the session object (it is
   * serializable) instead of creating a new one with the same `sessionId`.
   */
  async createSession(options: {
    sessionId?: string;
    sandboxId?: string;
    sandboxSession?: SandboxSession | HarnessV2NetworkSandboxSession;
  }): Promise<HarnessAgentSession> {
    const sandboxSession = options.sandboxSession;
    const sandboxSessionId =
      sandboxSession == null ? undefined : getSandboxId({ sandboxSession });
    if (
      options.sandboxId != null &&
      sandboxSessionId != null &&
      options.sandboxId !== sandboxSessionId
    ) {
      throw new Error(
        'HarnessAgent.createSession: `sandboxId` must match the sandbox session `id` when one is available.',
      );
    }

    const sandboxId = sandboxSessionId ?? options.sandboxId;
    if (sandboxId == null) {
      throw new Error(
        'HarnessAgent.createSession: a stable `sandboxId` is required when `sandboxSession` is omitted or has no `id`.',
      );
    }

    const sessionId = options.sessionId ?? generateId();
    const runId = await this.createRun({ sessionId, sandboxId });
    const session = new DefaultHarnessAgentSession({
      sessionId,
      sandboxId,
      runId,
      sandboxSession,
    });
    this.bindSession({ session });
    return session;
  }

  /**
   * Creates and starts the World run of a new session and returns its ID.
   * Rejects if the World does not report the created run's ID.
   */
  private async createRun(options: {
    /**
     * Identifier of the new session.
     */
    sessionId: string;

    /**
     * Stable sandbox identifier of the new session.
     */
    sandboxId: string;
  }): Promise<string> {
    const { sessionId, sandboxId } = options;
    const result = await this.world.events.create(null, {
      eventType: 'run_created',
      specVersion: this.world.specVersion,
      eventData: {
        deploymentId: await this.world.getDeploymentId(),
        workflowName: `workflow//@ai-sdk/harness//${this.harnessId}`,
        input: new TextEncoder().encode(
          JSON.stringify({
            version: 1,
            harnessId: this.harnessId,
            sessionId,
            sandboxId,
          }),
        ),
      },
    });
    const runId = result.run?.runId ?? result.event?.runId;
    if (runId == null) {
      throw new Error(
        'HarnessAgent.createSession: the World did not report the ID of the created run.',
      );
    }
    await this.world.events.create(runId, {
      eventType: 'run_started',
      specVersion: this.world.specVersion,
    });
    return runId;
  }

  /**
   * Binds this agent's sandbox resolver before operating on a session.
   */
  private bindSession(options: { session: HarnessAgentSession }): void {
    options.session.setSandboxSessionResolver(this.getSandboxSession);
  }

  /**
   * Runs a prompt as a turn of the session and resolves once the turn ended.
   *
   * Works like `stream()`, then reads the turn to its end. Rejects with the
   * abort reason if `abortSignal` fired (the turn itself continues), with the
   * turn's first error if the turn failed, did not finish, or finished with
   * `finishReason: 'error'`, and with `NoOutputGeneratedError` if no step was
   * recorded.
   */
  async generate(
    options: AgentCallParameters<
      CALL_OPTIONS,
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    > &
      HarnessAgentCallExtensions,
  ): Promise<
    GenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    const result = await this.startTurn(options);
    await result.consumeStream();
    const end = await result.turnEnd;
    if (end.reason === 'aborted') {
      throw options.abortSignal?.reason ?? new Error('HarnessAgent: aborted.');
    }
    const unsuccessful = () =>
      end.error ??
      new NoOutputGeneratedError({
        message: 'HarnessAgent: the turn did not finish successfully.',
      });
    if (end.reason === 'failed' || end.reason === 'incomplete') {
      throw unsuccessful();
    }
    const [steps, finishReason, rawFinishReason, totalUsage] =
      await Promise.all([
        result.steps,
        result.finishReason,
        result.rawFinishReason,
        result.totalUsage,
      ]).catch(error => {
        throw end.error ?? error;
      });
    if (finishReason === 'error') {
      throw unsuccessful();
    }
    return new HarnessGenerateTextResult({
      steps,
      totalUsage,
      finishReason,
      rawFinishReason,
    });
  }

  /**
   * Runs a prompt as a turn of the session and streams the turn's output.
   *
   * The prompt is appended to the session's log as a `prompt` submission and
   * a drive of the session starts. The result reads the session's World
   * stream from the moment the prompt was submitted until the drive ended.
   * Rejects if a turn of the session is still running.
   *
   * `abortSignal` is a local control: it only ends this result (with an
   * `abort` part), while the turn continues. It is never stored or passed to a
   * drive.
   */
  async stream(
    options: AgentStreamParameters<
      CALL_OPTIONS,
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    > &
      HarnessAgentCallExtensions,
  ): Promise<
    StreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    return this.startTurn(options);
  }

  /**
   * Validates the call, appends its prompt as a `prompt` submission, starts
   * a drive of the session, and returns the result reading the drive's
   * output.
   *
   * Only one turn runs at a time, and each call starts one drive. So the call
   * rejects if a call for the session is still in progress in this process,
   * or if the session's log shows a turn that has not finished or a prompt
   * that has not started its turn. Because of that, everything written to the
   * session's stream after the submission belongs to this call's turn, and
   * the result reads it from the stream position taken before the
   * submission was appended.
   */
  private async startTurn(
    options: AgentCallParameters<
      CALL_OPTIONS,
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    > &
      HarnessAgentCallExtensions,
  ): Promise<
    HarnessStreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    assertCallOptionsSerializable({ callOptions: options });
    assertCallOptionsSupported({ callOptions: options });
    const { session, abortSignal } = options;
    const { runId } = session;
    const streamName = session.getStreamName();
    this.bindSession({ session });

    /*
     * One call per session at a time within this process. This only guards
     * calls in the same process: making sure that only one drive changes a
     * session across processes comes with the steps that add queueing,
     * recovery and fencing.
     */
    let busy = busySessions.get(this.world);
    if (busy == null) {
      busy = new Set();
      busySessions.set(this.world, busy);
    }
    /*
     * TODO: Instead of rejecting a call while a turn is running, queue its
     * prompt: append the submission without delivering it, and let the drive
     * start its turn as soon as the running turn finished. The call's result
     * then starts reading at that turn's `start` part.
     */
    if (busy.has(runId)) throw createTurnRunningError();
    busy.add(runId);

    let driveEnd: Promise<void>;
    let startIndex: number;
    try {
      const message = resolvePromptMessage({
        prompt: options.prompt,
        messages: options.messages,
      });
      const settings = await this.getTurnSettings();
      const log = createLog({ world: this.world, runId });
      if (await hasRunningTurn({ log })) throw createTurnRunningError();

      startIndex =
        (await this.world.streams.getInfo(runId, streamName)).tailIndex + 1;
      await log.append({
        type: 'submission',
        id: generateId(),
        data: { type: 'prompt', message, settings },
      });
      driveEnd = this.drive({ session });
    } catch (error) {
      busy.delete(runId);
      throw error;
    }
    void driveEnd.finally(() => busy.delete(runId)).catch(() => {});

    /*
     * The result reads the parts written to the session's stream from
     * `startIndex` on, which are all output of this call's turn. The drive
     * flushes its stream writer before it settles, so once it settled,
     * reading continues up to the stream's end at that moment and then stops.
     * Every chunk of the World stream ends with a blank line; counting those
     * lines is how the reader knows it reached that end. Reading also stops
     * as soon as `abortSignal` fired, which never affects the drive. If the
     * drive rejects, the parts stream errors with the drive's error.
     */
    const world = this.world;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let ended = false;
    let onAbort = (): void => {};

    /**
     * Returns whether reading ended. `ended` is set by callbacks (the drive's
     * end, the abort signal, cancellation), so loops check it through this
     * function after every await.
     */
    const isEnded = (): boolean => ended;

    /**
     * Marks reading as ended and stops reading the World stream.
     */
    const release = (): void => {
      ended = true;
      abortSignal?.removeEventListener('abort', onAbort);
      void reader?.cancel().catch(() => {});
    };

    const parts = new ReadableStream<HarnessAgentStreamPart>({
      start(controller) {
        let lastChunk = startIndex - 1;
        let tailIndex: number | undefined;

        /**
         * Closes the parts stream, once.
         */
        const close = (): void => {
          if (ended) return;
          release();
          controller.close();
        };

        /**
         * Errors the parts stream, once.
         */
        const fail = (error: unknown): void => {
          if (ended) return;
          release();
          controller.error(error);
        };

        /**
         * Closes the parts stream once the drive settled and every chunk
         * written before that was read.
         */
        const closeIfDrained = (): void => {
          if (tailIndex != null && lastChunk >= tailIndex) close();
        };

        if (abortSignal != null) {
          if (abortSignal.aborted) {
            close();
            return;
          }
          onAbort = close;
          abortSignal.addEventListener('abort', onAbort, { once: true });
        }

        void driveEnd
          .then(async () => {
            tailIndex = (await world.streams.getInfo(runId, streamName))
              .tailIndex;
            closeIfDrained();
          })
          .catch(fail);

        void (async () => {
          const stream = await world.streams.get(runId, streamName, startIndex);
          reader = stream.getReader();
          if (isEnded()) {
            void reader.cancel().catch(() => {});
            return;
          }
          const decoder = new TextDecoder();
          let buffer = '';
          while (!isEnded()) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            for (
              let index = buffer.indexOf('\n');
              index !== -1 && !isEnded();
              index = buffer.indexOf('\n')
            ) {
              const line = buffer.slice(0, index);
              buffer = buffer.slice(index + 1);
              if (line === '') {
                lastChunk++;
                closeIfDrained();
                continue;
              }
              for (const record of await decodeStreamRecords({ text: line })) {
                if (!isEnded()) controller.enqueue(record.part);
              }
            }
          }
          close();
        })().catch(fail);
      },

      cancel() {
        release();
      },
    });

    return new HarnessStreamTextResult({
      parts,
      abortSignal,
      tools: this.tools,
      harnessId: this.harnessId,
      callId: generateId(),
    });
  }

  /**
   * Returns the turn settings for `prompt` submissions, built once: the
   * user tools as tool specs, without skills, instructions or model.
   */
  private getTurnSettings(): Promise<HarnessV2TurnSettings> {
    this.turnSettings ??= createTurnSettings({ tools: this.userTools });
    return this.turnSettings;
  }

  /**
   * Runs one drive of the session and resolves once it ended. Rejects with
   * what the harness or the engine threw if the drive failed without an
   * unfinished turn to report the error in.
   */
  private drive(options: {
    /**
     * Session to drive.
     */
    session: HarnessAgentSession;
  }): Promise<void> {
    return runDrivePass({
      world: this.world,
      session: options.session,
      harness: this.harness,
      userTools: this.userTools,
      workDir: this.sandboxConfig.workDir,
    });
  }
}

/**
 * Time before the World's runtime deadline at which a drive yields, so that
 * running work can finish and the log is complete before the hosting
 * platform terminates the process.
 */
const DEADLINE_MARGIN_MS = 15_000;

/**
 * Usage reported for a turn the engine finishes itself, when nothing is known.
 */
const unknownUsage: HarnessV2Usage = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

/**
 * Runs one drive of a session: creates the engine pieces for the drive, passes
 * the resulting drive context to the harness's `drive()`, and ends the drive.
 *
 * Signals:
 * - `stopAbortSignal` aborts once the drive ended, after the stream writer was
 *   flushed. That releases the pieces' log subscriptions and records every
 *   approved built-in tool call that never ended as `interrupted`.
 * - `yieldAbortSignal` aborts `DEADLINE_MARGIN_MS` before the World's runtime
 *   deadline, if the World reports one. It is independent of
 *   `stopAbortSignal`. Once it fired, effects start no new attempt and the
 *   built-in tool gate denies new calls.
 *
 * If the yield signal fired during a drive that returned, a `yield` part is
 * written to the stream, so readers of the current turn know it continues in
 * a later drive. When the harness or the engine throws, the current turn, if
 * unfinished, gets an `error` part and is finished with
 * `finishReason: 'error'`. Without an unfinished turn, it rejects with what
 * was thrown, wrapped in a `HarnessBeforeStartError` (no turn started,
 * including when the drive failed before its log, writer and finish
 * functions existed) or a `HarnessAfterFinishError` (the latest turn already
 * finished).
 */
async function runDrivePass(options: {
  /**
   * World that stores the session.
   */
  world: World;

  /**
   * Session to drive.
   */
  session: HarnessAgentSession;

  /**
   * Harness adapter that drives the session.
   */
  harness: HarnessV2;

  /**
   * The app's own tools, executed through `executeHostTool()`.
   */
  userTools: ToolSet;

  /**
   * Normalized `sandboxConfig.workDir`, if configured.
   */
  workDir?: string;
}): Promise<void> {
  const { world, session, harness, userTools, workDir } = options;
  const { runId } = session;

  const stopController = new AbortController();
  const yieldController = new AbortController();
  const stopAbortSignal = stopController.signal;
  const yieldAbortSignal = yieldController.signal;

  let yieldTimer: ReturnType<typeof setTimeout> | undefined;
  let log: HarnessAgentLog | undefined;
  let writer: HarnessAgentStreamWriter | undefined;
  let finishTurn: HarnessAgentFinishTurnFunction | undefined;

  try {
    const runtimeDeadline = await world.getRuntimeDeadline?.();
    if (runtimeDeadline != null) {
      const yieldAt = runtimeDeadline.getTime() - DEADLINE_MARGIN_MS;
      yieldTimer = setTimeout(
        () =>
          yieldController.abort(
            new Error('HarnessAgent: the drive reached its deadline.'),
          ),
        Math.max(0, yieldAt - Date.now()),
      );
      (yieldTimer as { unref?: () => void }).unref?.();
    }

    log = createLog({ world, runId });
    writer = createStreamWriter({
      world,
      session,
      abortSignal: stopAbortSignal,
    });
    const effect = createEffectFunction({
      log,
      stopAbortSignal,
      yieldAbortSignal,
      writer,
    });
    const finishFunctions = createFinishFunctions({
      log,
      writer,
      abortSignal: stopAbortSignal,
    });
    finishTurn = finishFunctions.finishTurn;
    const executeHostTool = createExecuteHostToolFunction({
      tools: userTools,
      effect,
      getSandboxSession: () => session.getSandboxSession(),
    });
    const gateBuiltinTool = createGateBuiltinToolFunction({
      builtinTools: harness.builtinTools,
      effect,
      abortSignal: AbortSignal.any([stopAbortSignal, yieldAbortSignal]),
    });

    const context = createDriveContext({
      session,
      log,
      effect,
      writer,
      finishStep: finishFunctions.finishStep,
      finishTurn,
      executeHostTool,
      gateBuiltinTool,
      harnessId: harness.harnessId,
      workDir,
      stopAbortSignal,
      yieldAbortSignal,
    });

    await harness.drive({ sessionId: session.sessionId, context });
    if (yieldAbortSignal.aborted) writer.unsafeEmit({ type: 'yield' });
  } catch (error) {
    /*
     * The log, the stream writer and the turn finish function are created
     * at the start of the drive, e.g. after asking the World for its runtime
     * deadline. If the drive failed before all of them existed, no turn can
     * have started in this drive and there is no way to write the error into
     * the stream, so the drive rejects with the original error, wrapped to
     * mark that it was thrown before the turn started.
     */
    if (log == null || writer == null || finishTurn == null) {
      throw new HarnessBeforeStartError({ cause: error });
    }
    await failCurrentTurn({ log, writer, finishTurn, error });
  } finally {
    clearTimeout(yieldTimer);
    await writer?.flush();
    stopController.abort(new Error('HarnessAgent: the drive ended.'));
  }
}

/**
 * Ends the session's current turn after a failed drive, if it is unfinished:
 * emits an `error` part with the failure's message, then finishes the turn
 * with `finishReason: 'error'` and unknown usage. When there is no turn to
 * report `error` in, rethrows it wrapped in a `HarnessBeforeStartError` if no
 * turn started, or in a `HarnessAfterFinishError` if the latest turn already
 * finished.
 */
async function failCurrentTurn(options: {
  /**
   * Engine log of the session.
   */
  log: HarnessAgentLog;

  /**
   * Writer for the session's stream, owned by the failed drive.
   */
  writer: HarnessAgentStreamWriter;

  /**
   * Turn finish function of the failed drive.
   */
  finishTurn: HarnessAgentFinishTurnFunction;

  /**
   * What the harness or the engine threw.
   */
  error: unknown;
}): Promise<void> {
  const { log, writer, finishTurn, error } = options;
  const { events } = await log.read({ types: ['turn-start', 'finish-turn'] });

  let submissionId: string | undefined;
  const finished = new Set<string>();
  for (const event of events) {
    if (event.type === 'turn-start') submissionId = event.data.submissionId;
    if (event.type === 'finish-turn') finished.add(event.data.submissionId);
  }
  if (submissionId == null) {
    throw new HarnessBeforeStartError({ cause: error });
  }
  if (finished.has(submissionId)) {
    throw new HarnessAfterFinishError({ cause: error });
  }

  writer.unsafeEmit({
    type: 'error',
    error: { message: getErrorMessage(error) },
  });
  await finishTurn({
    finishReason: { unified: 'error', raw: undefined },
    totalUsage: unknownUsage,
  });
}

/**
 * Returns whether the session's log shows a running turn: a turn that has
 * not finished, or a `prompt` submission that has not started its turn.
 */
async function hasRunningTurn(options: {
  /**
   * Engine log of the session.
   */
  log: HarnessAgentLog;
}): Promise<boolean> {
  const { events } = await options.log.read({
    types: ['submission', 'turn-start', 'finish-turn'],
  });
  const started = new Set<string>();
  const finished = new Set<string>();
  for (const event of events) {
    if (event.type === 'turn-start') started.add(event.data.submissionId);
    if (event.type === 'finish-turn') finished.add(event.data.submissionId);
  }
  return events.some(
    event =>
      (event.type === 'submission' &&
        event.data.type === 'prompt' &&
        !started.has(event.id)) ||
      (event.type === 'turn-start' && !finished.has(event.data.submissionId)),
  );
}

/**
 * Returns the error for a call made while a turn of its session is running.
 */
function createTurnRunningError(): Error {
  return new Error(
    'HarnessAgent: a turn of this session is still running. Wait for it to finish before sending another prompt.',
  );
}

/**
 * Builds the turn settings of `prompt` submissions from the user tools. A
 * tool's input schema is converted to JSON Schema and left out if that fails.
 *
 * The converted schema is copied with `structuredClone`, which keeps only own
 * enumerable properties: schemas produced by `asSchema` can carry
 * non-enumerable metadata (e.g. a `~standard` property) that cannot be
 * recorded in the session's log.
 */
async function createTurnSettings(options: {
  /**
   * The app's own tools.
   */
  tools: ToolSet;
}): Promise<HarnessV2TurnSettings> {
  const tools: HarnessV2ToolSpec[] = [];
  for (const [name, tool] of Object.entries(options.tools)) {
    const spec: {
      name: string;
      description?: string;
      inputSchema?: JSONSchema7;
    } = { name };
    if (typeof tool.description === 'string') {
      spec.description = tool.description;
    }
    if (tool.inputSchema != null) {
      try {
        spec.inputSchema = structuredClone(
          await asSchema(tool.inputSchema).jsonSchema,
        );
      } catch {}
    }
    tools.push(spec);
  }
  return { skills: [], tools };
}

/**
 * Reduces the call's input to the user message that starts the turn: a string
 * prompt becomes a user message, and a message array resolves to its last
 * user message. The session already holds every earlier message, so nothing
 * else is replayed.
 */
function resolvePromptMessage(options: {
  /**
   * The call's `prompt` option.
   */
  prompt?: string | ModelMessage[];

  /**
   * The call's `messages` option.
   */
  messages?: ModelMessage[];
}): UserModelMessage {
  if (typeof options.prompt === 'string') {
    return { role: 'user', content: options.prompt };
  }
  const messages = Array.isArray(options.prompt)
    ? options.prompt
    : options.messages;
  if (Array.isArray(messages)) {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message?.role === 'user') return message;
    }
    throw new Error(
      'HarnessAgent: messages must contain at least one `role: "user"` entry.',
    );
  }
  throw new Error('HarnessAgent: either `prompt` or `messages` is required.');
}

/**
 * Rejects call options other than `prompt`, `messages`, `session`, `options`
 * and `abortSignal`.
 */
function assertCallOptionsSupported(options: { callOptions: object }): void {
  const unsupported = Reflect.ownKeys(options.callOptions).find(
    key => !supportedCallOptions.has(key),
  );
  if (unsupported !== undefined) {
    throw new Error(
      `HarnessAgent: call option \`${String(unsupported)}\` is not supported.`,
    );
  }
}

/**
 * Returns a sandbox session's string ID when it exposes one.
 */
function getSandboxId(options: {
  sandboxSession: SandboxSession | HarnessV2NetworkSandboxSession;
}): string | undefined {
  if (!('id' in options.sandboxSession)) return undefined;
  return typeof options.sandboxSession.id === 'string'
    ? options.sandboxSession.id
    : undefined;
}

/**
 * Validates the `sandboxConfig.workDir` setting and returns it normalized.
 *
 * The value must be a non-empty POSIX path relative to the sandbox's default
 * working directory that stays inside it. `'.'` selects the default working
 * directory itself; any other spelling that normalizes to it (e.g. `'./'`) is
 * rejected, as are absolute paths, backslashes, NUL bytes and paths that leave
 * the default working directory.
 */
function normalizeWorkDir(options: {
  /**
   * Configured work directory, relative to the sandbox's default working
   * directory.
   */
  workDir: string;
}): string {
  const { workDir } = options;
  if (workDir.length === 0) {
    throw new Error('HarnessAgent: `sandboxConfig.workDir` must not be empty.');
  }
  if (workDir.includes('\0')) {
    throw new Error(
      'HarnessAgent: `sandboxConfig.workDir` must not contain NUL.',
    );
  }
  if (workDir.includes('\\')) {
    throw new Error(
      'HarnessAgent: `sandboxConfig.workDir` must use POSIX path separators.',
    );
  }
  if (posix.isAbsolute(workDir)) {
    throw new Error('HarnessAgent: `sandboxConfig.workDir` must be relative.');
  }

  const normalized = posix.normalize(workDir);
  if (
    ((normalized === '.' || normalized === './') && workDir !== '.') ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error(
      'HarnessAgent: `sandboxConfig.workDir` must stay inside the sandbox default working directory.',
    );
  }
  return normalized;
}

/**
 * Validates that call options are plain data objects with serializable values.
 *
 * The options object must have a plain or null prototype, and each own property
 * must be a data property whose value passes `isHarnessSerializableValue`.
 * Accessors, custom prototypes, and unsupported nested values cause an error.
 * `abortSignal` is exempt when it holds an `AbortSignal`, since it is a local
 * control of the call that is never stored.
 */
function assertCallOptionsSerializable(options: { callOptions: object }): void {
  const prototype = Object.getPrototypeOf(options.callOptions);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('HarnessAgent: call options must be serializable.');
  }

  for (const key of Reflect.ownKeys(options.callOptions)) {
    const descriptor = Object.getOwnPropertyDescriptor(
      options.callOptions,
      key,
    );
    if (descriptor == null || !Object.hasOwn(descriptor, 'value')) {
      throw new Error(
        `HarnessAgent: call option \`${String(key)}\` must be serializable.`,
      );
    }
    if (
      key === 'abortSignal' &&
      (descriptor.value === undefined ||
        descriptor.value instanceof AbortSignal)
    ) {
      continue;
    }
    if (
      !isHarnessSerializableValue({
        value: descriptor.value,
        ancestors: new WeakSet(),
      })
    ) {
      throw new Error(
        `HarnessAgent: call option \`${String(key)}\` must be serializable.`,
      );
    }
  }
}

/**
 * Checks recursively whether a value belongs to the supported serializable
 * subset.
 *
 * Primitive values, supported built-ins, arrays, maps, sets, and plain objects
 * with string-keyed data properties are accepted. Class instances are accepted
 * when their constructor defines `WORKFLOW_SERIALIZE`; other class instances,
 * cycles, accessors, and symbol keys on nested objects are rejected.
 * Container recursion stays local so Workflow hooks are honored at every depth;
 * non-container values are checked by the shared `isSerializableValue` guard.
 */
function isHarnessSerializableValue(options: {
  value: unknown;
  ancestors: WeakSet<object>;
}): boolean {
  const { value, ancestors } = options;

  if (value === null || typeof value !== 'object') {
    return isSerializableValue(value);
  }

  if (ancestors.has(value)) return false;
  ancestors.add(value);

  try {
    const constructor = Object.getPrototypeOf(value)?.constructor;
    const workflowSerialize =
      typeof constructor === 'function'
        ? Reflect.get(constructor, WORKFLOW_SERIALIZE)
        : undefined;

    if (typeof workflowSerialize === 'function') {
      return isHarnessSerializableValue({
        value: workflowSerialize.call(constructor, value),
        ancestors,
      });
    }

    if (Array.isArray(value)) {
      return value.every(item =>
        isHarnessSerializableValue({ value: item, ancestors }),
      );
    }

    if (value instanceof Map) {
      return Array.from(value.entries()).every(
        ([key, item]) =>
          isHarnessSerializableValue({ value: key, ancestors }) &&
          isHarnessSerializableValue({ value: item, ancestors }),
      );
    }

    if (value instanceof Set) {
      return Array.from(value.values()).every(item =>
        isHarnessSerializableValue({ value: item, ancestors }),
      );
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      return Reflect.ownKeys(value).every(key => {
        if (typeof key !== 'string') return false;

        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return (
          descriptor != null &&
          Object.hasOwn(descriptor, 'value') &&
          isHarnessSerializableValue({ value: descriptor.value, ancestors })
        );
      });
    }

    return isSerializableValue(value);
  } finally {
    ancestors.delete(value);
  }
}
