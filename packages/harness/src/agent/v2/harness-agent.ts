import { posix } from 'node:path';
import { isSerializableValue, type JSONSchema7 } from '@ai-sdk/provider';
import {
  asSchema,
  generateId,
  getErrorMessage,
  safeParseJSON,
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
import { createExecuteToolFunctions } from './internal/create-execute-tool-functions';
import {
  createFinishFunctions,
  type HarnessAgentFinishTurnFunction,
} from './internal/create-finish-functions';
import { createGateBuiltinToolFunction } from './internal/create-gate-builtin-tool-function';
import { createLog, type HarnessAgentLog } from './internal/create-log';
import {
  createStreamWriter,
  type HarnessAgentStreamWriter,
} from './internal/create-stream-writer';
import { readTurnRecordStream } from './internal/read-turn-record-stream';
import {
  HarnessAfterFinishError,
  HarnessBeforeStartError,
} from './internal/errors';
import { HarnessGenerateTextResult } from './internal/harness-generate-text-result';
import { HarnessStreamTextResult } from './internal/harness-stream-text-result';
import { getDriveProcess, trackRunningDrive } from './internal/drive-process';
import { startDrive } from './internal/start-drive';
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
  THarness extends HarnessV2,
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
  THarness extends HarnessV2 = HarnessV2,
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
   * Without `runId`, every call creates a new run. To continue an existing
   * session later, or in another process, pass its `runId`: the session is
   * then restored from that run instead, and nothing is written to the World.
   * Its `sessionId` and `sandboxId` are read from the run; the call rejects
   * if the run does not hold a session of this agent's harness, or if a
   * given `sessionId`, `sandboxId` or sandbox session ID does not match the
   * run's.
   */
  async createSession(options: {
    sessionId?: string;
    sandboxId?: string;
    sandboxSession?: SandboxSession | HarnessV2NetworkSandboxSession;
    runId?: string;
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

    let sessionId = options.sessionId;
    let sandboxId = sandboxSessionId ?? options.sandboxId;
    let runId = options.runId;
    if (runId != null) {
      const run = await this.world.runs.get(runId);
      const runInput = await parseRunInput({ input: run.input });
      if (
        runInput?.harnessId !== this.harnessId ||
        typeof runInput.sessionId !== 'string' ||
        typeof runInput.sandboxId !== 'string'
      ) {
        throw new Error(
          `HarnessAgent.createSession: run \`${runId}\` does not hold a session of harness \`${this.harnessId}\`.`,
        );
      }
      if (sessionId != null && sessionId !== runInput.sessionId) {
        throw new Error(
          'HarnessAgent.createSession: `sessionId` does not match the session of the given `runId`.',
        );
      }
      if (sandboxId != null && sandboxId !== runInput.sandboxId) {
        throw new Error(
          'HarnessAgent.createSession: `sandboxId` does not match the session of the given `runId`.',
        );
      }
      sessionId = runInput.sessionId;
      sandboxId = runInput.sandboxId;
    }

    if (sandboxId == null) {
      throw new Error(
        'HarnessAgent.createSession: a stable `sandboxId` is required when `sandboxSession` is omitted or has no `id`.',
      );
    }
    sessionId ??= generateId();
    runId ??= await this.createRun({ sessionId, sandboxId });

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
   *
   * The run ID is minted before `run_created` is written, since some Worlds
   * (e.g. world-vercel) require a client-generated run ID. The World's
   * `createRunId()` is used when it implements one, which returns the bare
   * ULID; otherwise a ULID is generated locally.
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
    const runId = `wrun_${this.world.createRunId?.({}) ?? createUlid()}`;
    await this.world.events.create(runId, {
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
   * Runs one drive of the session without submitting a prompt, and resolves
   * once it ended.
   *
   * The drive first recovers what an earlier drive left behind: if a drive
   * that provably is gone left effect attempts unfinished, they are recorded
   * as interrupted and their output is retracted where a retry replaces it.
   * A drive is provably gone if it recorded a crash, its deadline passed,
   * its process is gone, or this call runs under a redelivery of the queue
   * message that started it. Without that proof, the call resolves without
   * changing the session. The harness then
   * continues the latest unfinished turn, or starts the turn of a prompt
   * that has not started one. Without either, the call resolves without
   * writing anything.
   *
   * Resolves without doing anything if this process already runs a drive of
   * the session. Rejects like the drive of a `stream()` call.
   */
  async drive(options: {
    /**
     * Session to drive.
     */
    session: HarnessAgentSession;

    /**
     * ID of the World queue message whose delivery runs this drive (the
     * `messageId` a queue handler receives), if a queue message started it.
     * A later delivery of the same message proves to recovery that this
     * drive is gone.
     */
    queueMessageId?: string;
  }): Promise<void> {
    const { session, queueMessageId } = options;
    const { runId } = session;
    this.bindSession({ session });

    let busy = busySessions.get(this.world);
    if (busy == null) {
      busy = new Set();
      busySessions.set(this.world, busy);
    }
    if (busy.has(runId)) return;
    busy.add(runId);
    try {
      await this.runDrive({ session, queueMessageId });
    } finally {
      busy.delete(runId);
    }
  }

  /**
   * Reads the session's latest turn from the session's stream and returns
   * it as a stream result, in any process, without driving the session.
   *
   * Reading starts at the turn's `start` part and follows the turn across
   * drives until its `finish` part, so a finished turn is read from its
   * stored output, and an unfinished one until a later drive finishes it.
   * Output that recovery withdrew after a crash is removed from the result's
   * steps and from its UI message stream. `abortSignal` only ends the
   * result (with an `abort` part). Rejects if the session has no turn.
   */
  async readStream(options: {
    /**
     * Session whose latest turn is read.
     */
    session: HarnessAgentSession;

    /**
     * Ends reading early.
     */
    abortSignal?: AbortSignal;
  }): Promise<
    StreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    const { session, abortSignal } = options;
    const { events } = await createLog({
      world: this.world,
      runId: session.runId,
    }).read({ types: ['turn-start'] });
    const turnStart = events.at(-1);
    if (turnStart?.type !== 'turn-start') {
      throw new Error('HarnessAgent.readStream: the session has no turn.');
    }

    return new HarnessStreamTextResult({
      records: readTurnRecordStream({
        world: this.world,
        session,
        turnId: turnStart.data.turnId,
        startIndex: 0,
        abortSignal,
      }),
      abortSignal,
      tools: this.tools,
      harnessId: this.harnessId,
      callId: generateId(),
    });
  }

  /**
   * Crashes the process of the drive that runs the session's current turn,
   * for testing crash recovery. Experimental.
   *
   * Appends a `crash-request` to the session's log and resolves once it is
   * committed. The drive of the latest `drive-start`, in any process,
   * observes it and kills its process with `SIGKILL`, including any other
   * work in that process, like a real crash would: nothing is recorded or
   * flushed, so a later drive recovers the session once it can prove the
   * drive gone, e.g. because its process is gone. With `recordCrash`, the
   * drive first records a `drive-crash` and flushes its stream writer,
   * which proves to a later drive at once that it is gone. Rejects without
   * writing if the session has no turn, its latest turn finished, its
   * latest drive recorded a crash, or a crash of its latest drive was
   * already requested.
   */
  async experimental_crash(options: {
    /**
     * Session whose current drive crashes.
     */
    session: HarnessAgentSession;

    /**
     * Whether the drive records a `drive-crash` before it crashes, so that
     * recovery does not need to prove it gone otherwise. Defaults to
     * `false`.
     */
    recordCrash?: boolean;
  }): Promise<void> {
    const { session, recordCrash } = options;
    const log = createLog({ world: this.world, runId: session.runId });
    const { events } = await log.read({
      types: [
        'turn-start',
        'finish-turn',
        'drive-start',
        'drive-crash',
        'crash-request',
      ],
    });

    let turnId: string | undefined;
    let driveId: string | undefined;
    let crashRequested = false;
    const finishedTurns = new Set<string>();
    const crashedDrives = new Set<string>();
    for (const event of events) {
      if (event.type === 'turn-start') turnId = event.data.turnId;
      if (event.type === 'finish-turn') finishedTurns.add(event.data.turnId);
      if (event.type === 'drive-start') {
        driveId = event.data.driveId;
        crashRequested = false;
      }
      if (event.type === 'crash-request') crashRequested = true;
      if (event.type === 'drive-crash') crashedDrives.add(event.data.driveId);
    }
    if (
      turnId == null ||
      finishedTurns.has(turnId) ||
      driveId == null ||
      crashedDrives.has(driveId) ||
      crashRequested
    ) {
      throw new Error(
        'HarnessAgent.experimental_crash: there is no current drive to crash.',
      );
    }

    await log.append({
      type: 'crash-request',
      id: generateId(),
      data: recordCrash ? { recordCrash: true } : {},
    });
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

    const submissionId = generateId();
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
        id: submissionId,
        data: { type: 'prompt', message, settings },
      });
      driveEnd = this.runDrive({ session });
    } catch (error) {
      busy.delete(runId);
      throw error;
    }
    void driveEnd.finally(() => busy.delete(runId)).catch(() => {});

    /*
     * The result reads the session's stream from `startIndex` on, starting
     * at this turn's `start` record (the turn's ID is the submission's ID),
     * until the drive ended and everything it wrote was read. Records the
     * drive writes before the turn starts, such as recovery output for an
     * earlier turn, are not part of this turn.
     */
    return new HarnessStreamTextResult({
      records: readTurnRecordStream({
        world: this.world,
        session,
        turnId: submissionId,
        startIndex,
        abortSignal,
        driveEnd,
      }),
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
  private runDrive(options: {
    /**
     * Session to drive.
     */
    session: HarnessAgentSession;

    /**
     * ID of the World queue message whose delivery runs the drive.
     */
    queueMessageId?: string;
  }): Promise<void> {
    return runDrivePass({
      world: this.world,
      session: options.session,
      queueMessageId: options.queueMessageId,
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
 * Decodes the JSON input recorded on a session's run. Returns `undefined`
 * if the input is not encoded JSON. The decoded value is not validated, so
 * callers must check the properties they read.
 */
async function parseRunInput(options: {
  /**
   * Input of the run, as returned by the World.
   */
  input: unknown;
}): Promise<Record<string, unknown> | null | undefined> {
  if (!(options.input instanceof Uint8Array)) return undefined;
  const parsed = await safeParseJSON({
    text: new TextDecoder().decode(options.input),
  });
  return parsed.success
    ? (parsed.value as Record<string, unknown> | null)
    : undefined;
}

/**
 * Generates a 26-character ULID from the current millisecond and a random
 * suffix, for Worlds that do not mint run IDs themselves. Not suitable for
 * security tokens, since the suffix comes from `Math.random`.
 */
function createUlid(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let timestamp = Date.now();
  let time = '';
  for (let index = 0; index < 10; index++) {
    time = alphabet[timestamp % 32] + time;
    timestamp = Math.floor(timestamp / 32);
  }

  let randomness = '';
  for (let index = 0; index < 16; index++) {
    randomness += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${time}${randomness}`;
}

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
 * Before the harness runs, `startDrive()` recovers what an earlier drive left
 * behind and appends this drive's `drive-start`. If it decides that the drive
 * must not run (nothing to do, or unfinished attempts of a drive that is not
 * provably gone), the drive ends without running the harness.
 *
 * While the drive runs, it listens for `crash-request` events committed after
 * its own `drive-start` and before any later one. On the first, it kills its
 * process with `SIGKILL`, like a real crash would. If the request asks to
 * record the crash, it first records a `drive-crash` and flushes its stream
 * writer; if the `drive-crash` cannot be recorded, the process stays alive.
 * The drive is registered as running in this process from before its
 * `drive-start` until it ended, so that recovery in this process can tell
 * an ended drive from a running one.
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
   * ID of the World queue message whose delivery runs the drive.
   */
  queueMessageId?: string;

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
  const { world, session, queueMessageId, harness, userTools, workDir } =
    options;
  const { runId } = session;

  const stopController = new AbortController();
  const yieldController = new AbortController();
  const stopAbortSignal = stopController.signal;
  const yieldAbortSignal = yieldController.signal;

  let yieldTimer: ReturnType<typeof setTimeout> | undefined;
  let log: HarnessAgentLog | undefined;
  let writer: HarnessAgentStreamWriter | undefined;
  let finishTurn: HarnessAgentFinishTurnFunction | undefined;
  let stopCrashListener: (() => void) | undefined;
  let untrackDrive: (() => void) | undefined;

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

    const driveId = generateId();
    untrackDrive = trackRunningDrive({ driveId });
    const driveLog = log;
    const driveWriter = writer;
    let targeted = false;
    let crashing = false;
    stopCrashListener = driveLog.onAppend({
      config: { types: ['drive-start', 'crash-request'] },
      listener: event => {
        if (event.type === 'drive-start') {
          targeted = event.data.driveId === driveId;
          return;
        }
        if (event.type !== 'crash-request' || !targeted || crashing) return;
        crashing = true;
        if (!event.data.recordCrash) {
          process.kill(process.pid, 'SIGKILL');
          return;
        }
        void (async () => {
          await driveLog.append({
            type: 'drive-crash',
            id: `drive-crash:${driveId}`,
            data: { driveId, requestId: event.id },
          });
          await driveWriter.flush();
          process.kill(process.pid, 'SIGKILL');
        })().catch(() => {
          crashing = false;
        });
      },
    });

    const driveProcess = getDriveProcess();
    if (
      !(await startDrive({
        log,
        writer,
        world,
        session,
        driveIdentity: {
          driveId,
          ...(runtimeDeadline != null && {
            deadline: runtimeDeadline.getTime(),
          }),
          ...(queueMessageId != null && { queueMessageId }),
          ...(driveProcess != null && { process: driveProcess }),
        },
      }))
    ) {
      return;
    }

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
    const { executeHostTool, executeBuiltinTool } = createExecuteToolFunctions({
      log,
      tools: userTools,
      builtinTools: harness.builtinTools,
      effect,
      getSandboxSession: () => session.getSandboxSession(),
    });
    const gateBuiltinTool = createGateBuiltinToolFunction({
      log,
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
      executeBuiltinTool,
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
    try {
      stopCrashListener?.();
      clearTimeout(yieldTimer);
      await writer?.flush();
      stopController.abort(new Error('HarnessAgent: the drive ended.'));
    } finally {
      untrackDrive?.();
    }
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

  let turnId: string | undefined;
  const finished = new Set<string>();
  for (const event of events) {
    if (event.type === 'turn-start') turnId = event.data.turnId;
    if (event.type === 'finish-turn') finished.add(event.data.turnId);
  }
  if (turnId == null) {
    throw new HarnessBeforeStartError({ cause: error });
  }
  if (finished.has(turnId)) {
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
    if (event.type === 'turn-start') started.add(event.data.turnId);
    if (event.type === 'finish-turn') finished.add(event.data.turnId);
  }
  return events.some(
    event =>
      (event.type === 'submission' &&
        event.data.type === 'prompt' &&
        !started.has(event.id)) ||
      (event.type === 'turn-start' && !finished.has(event.data.turnId)),
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
