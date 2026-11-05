import {
  CreateEventSchema,
  EventSchema,
  MessageId,
  QueuePayloadSchema,
  SPEC_VERSION_CURRENT,
  applyAttributeChanges,
  slotToEventId,
  stripEventDataRefs,
  validateAttributeChanges,
  type BatchEventRequest,
  type CreateEventBatchParams,
  type CreateEventParams,
  type CreateEventRequest,
  type Event,
  type EventBatchResult,
  type EventResult,
  type Hook,
  type ListEventsByCorrelationIdParams,
  type ListEventsParams,
  type MessageId as MessageIdType,
  type QueueBatchResult,
  type QueueOptions,
  type QueuePayload,
  type RunCreatedEventRequest,
  type SnapshotMetadata,
  type Step,
  type StreamChunksResponse,
  type StreamInfoResponse,
  type Wait,
  type WorkflowRun,
  type WorkflowRunWithoutData,
  type ValidQueueName,
  type World,
  type WorldCapabilities,
} from '@workflow/world';
import { z } from 'zod';
import type { JSONValue } from '@ai-sdk/provider';
import {
  cloneSerializableValue,
  jsonDecodeSerializableValue,
  jsonEncodeSerializableValue,
  type SerializableValue,
} from '@ai-sdk/provider-utils';

/**
 * Defines the checkpoint API for exporting and restoring one run's state.
 *
 * The consumer owns persistence: `export` returns a value that can be stored,
 * while the JSON methods encode and decode the supported non-JSON values.
 */
interface Storable {
  /**
   * Exports the serializable state needed to restore a run.
   *
   * Event history is retained so replay can rebuild run, step, hook, and wait
   * records; state that replay cannot rebuild is included separately.
   */
  export(input: { runId: string }): Promise<SerializableValue>;

  /**
   * Restores a checkpoint for the same `runId` and replaces only that run's
   * state.
   *
   * The checkpoint is validated and replayed into temporary state before the
   * existing run is cleared, so invalid data does not partially replace it.
   */
  seed(input: { runId: string; data: SerializableValue }): Promise<void>;

  /**
   * Exports a checkpoint encoded for storage as JSON.
   *
   * Binary data and other supported non-JSON values are transformed by the
   * provider-utils JSON codec; the returned value can be passed to `seedJson`.
   */
  exportJson(input: { runId: string }): Promise<JSONValue>;

  /**
   * Decodes a JSON checkpoint and restores its run state.
   *
   * This reverses `exportJson`'s encoding before applying the same validation
   * and replacement behavior as `seed`.
   */
  seedJson(input: { runId: string; data: JSONValue }): Promise<void>;
}

/**
 * A pending queue message retained when its owning run is exported.
 *
 * Queue delivery is not replayed from events, so the message, queue-scoped
 * idempotency options, and branded message ID must be checkpointed directly.
 */
type QueueMessage = {
  /**
   * Queue name used to deliver the message.
   */
  queueName: string;

  /**
   * Stable ID returned when the message was enqueued.
   */
  messageId: MessageIdType;

  /**
   * Serialized workflow payload, including its owning run ID.
   */
  message: QueuePayload;

  /**
   * Queue options needed to preserve idempotency and delivery behavior.
   */
  options?: QueueOptions;
};

/**
 * Validates only the queue options needed to preserve checkpointed messages.
 *
 * The strict schema rejects unknown fields so exported data has a stable,
 * serializable shape rather than depending on an adapter's runtime objects.
 */
const QueueOptionsSchema = z
  .object({
    deploymentId: z.string().optional(),
    idempotencyKey: z.string().optional(),
    headers: z.record(z.string()).optional(),
    delaySeconds: z.number().optional(),
    specVersion: z.number().optional(),
    region: z.string().optional(),
  })
  .strict();

/**
 * Validates a checkpointed queue message and restores its runtime types.
 *
 * The message ID and payload are parsed through their Workflow schemas after
 * deserialization, rather than trusting their serialized representations.
 */
const QueueMessageSchema = z
  .object({
    queueName: z.string(),
    messageId: z.string(),
    message: z.unknown(),
    options: QueueOptionsSchema.optional(),
  })
  .strict()
  .transform(
    (message): QueueMessage => ({
      ...message,
      messageId: MessageId.parse(message.messageId),
      message: QueuePayloadSchema.parse(message.message) as QueuePayload,
    }),
  );

/**
 * Validates the versioned checkpoint before any run state is replaced.
 *
 * Events are parsed through the Workflow event schema. Streams retain their
 * ordered byte chunks and closed state; dynamic code and pending queue messages
 * are included only because event replay cannot reliably reconstruct them.
 */
const InMemoryWorldDataSchema = z
  .object({
    version: z.literal(1),
    runId: z.string(),
    events: z
      .array(z.unknown())
      .transform(events =>
        events.map(event => EventSchema.parse(event) as Event),
      ),
    streams: z.record(
      z
        .object({
          chunks: z.array(z.instanceof(Uint8Array)),
          done: z.boolean(),
        })
        .strict(),
    ),
    dynamicWorkflowCode: z.instanceof(Uint8Array).optional(),
    queuedMessages: z.array(QueueMessageSchema),
  })
  .strict();

/**
 * Inferred checkpoint shape for event history and state replay cannot rebuild.
 *
 * Derived run, step, hook, and wait records are intentionally absent because
 * `seed` reconstructs them from `events`. Transient snapshots and stream readers
 * are also omitted; they are process-local rather than durable run state.
 */
type InMemoryWorldData = z.infer<typeof InMemoryWorldDataSchema>;

/**
 * In-memory buffers and readers associated with a named run stream.
 *
 * Only `chunks` and `done` are durable checkpoint data. `waiters` are live
 * reader callbacks and are recreated empty when a checkpoint is seeded.
 */
type StreamData = {
  /**
   * Byte chunks written to the stream in order.
   */
  chunks: Uint8Array[];

  /**
   * Whether writers have closed the stream.
   */
  done: boolean;

  /**
   * Pending readers to wake when chunks arrive or the stream closes.
   */
  waiters: Set<() => void>;
};

/**
 * Configuration for the local World-compatible implementation.
 */
type InMemoryWorldOptions = {
  /**
   * Deployment ID reported for runs created by this world.
   */
  deploymentId?: string;
};

/**
 * An in-memory implementation of Workflow's `World` contract.
 *
 * Events are authoritative for run, step, hook, and wait projections. Streams,
 * pending queue messages, and dynamic workflow code that is not embedded in an
 * event are retained separately. Snapshots and pending stream readers are
 * process-local and are not included in exported checkpoints.
 */
export class InMemoryWorld implements World, Storable {
  readonly specVersion = SPEC_VERSION_CURRENT;
  readonly capabilities: WorldCapabilities = {};
  readonly runs: World['runs'];
  readonly steps: World['steps'];
  readonly events: World['events'];
  readonly hooks: World['hooks'];
  readonly streams: World['streams'];
  readonly queue: World['queue'];
  readonly experimental_snapshots: NonNullable<World['experimental_snapshots']>;

  private readonly deploymentId: string;
  private readonly runRecords = new Map<string, WorkflowRun>();
  private readonly eventRecords = new Map<string, Event[]>();
  private readonly stepRecords = new Map<string, Map<string, Step>>();
  private readonly hookRecords = new Map<string, Hook>();
  private readonly hookIdsByToken = new Map<string, string>();
  private readonly waitRecords = new Map<string, Map<string, Wait>>();
  private readonly streamRecords = new Map<string, Map<string, StreamData>>();
  private readonly snapshots = new Map<
    string,
    { data: Uint8Array; metadata: SnapshotMetadata }
  >();
  private readonly dynamicWorkflowCode = new Map<string, Uint8Array>();
  private readonly queuedMessages: QueueMessage[] = [];
  private readonly queueIdempotencyKeys = new Map<string, MessageIdType>();
  private messageSequence = 0;

  /**
   * Creates an empty world using the supplied deployment ID.
   *
   * When omitted, the local identifier is `in-memory`; it is reported on runs
   * but does not select or contact a remote deployment.
   */
  constructor(options: InMemoryWorldOptions = {}) {
    this.deploymentId = options.deploymentId ?? 'in-memory';

    this.runs = {
      get: (id, params) => this.getRun({ id, params }),
      getMany: (ids, params) => this.getManyRuns({ ids, params }),
      list: params => this.listRuns({ params }),
      experimentalSetAttributes: async (runId, changes, options) =>
        this.setRunAttributes({ runId, changes, options }),
      cancelMany: request => this.cancelRuns({ request }),
    } as World['runs'];

    this.steps = {
      get: (runId, stepId, params) => this.getStep({ runId, stepId, params }),
      list: params => this.listSteps({ params }),
    } as World['steps'];

    this.events = {
      create: (async (
        runId: string | null,
        data: CreateEventRequest | RunCreatedEventRequest,
        params?: CreateEventParams,
      ) =>
        this.createEvent({
          runId,
          data,
          params,
        })) as unknown as World['events']['create'],
      createBatch: (runId, batch, params) =>
        this.createEventBatch({ runId, batch, params }),
      get: (runId, eventId) => this.getEvent({ runId, eventId }),
      list: params => this.listEvents({ params }),
      listByCorrelationId: params => this.listEventsByCorrelationId({ params }),
    } as World['events'];

    this.hooks = {
      get: hookId => this.getHook({ hookId }),
      getByToken: token => this.getHookByToken({ token }),
      list: params => this.listHooks({ params }),
    } as World['hooks'];

    this.streams = {
      createWriteSession: (runId, name) => {
        let nextChunkSequence = 0;
        return {
          write: async (chunkSequence, chunks) => {
            if (chunkSequence !== nextChunkSequence) {
              throw new Error(
                'InMemoryWorld: stream chunk sequence is out of order.',
              );
            }
            await this.writeStreamMulti({ runId, name, chunks });
            nextChunkSequence += chunks.length;
          },
          close: () => this.closeStream({ runId, name }),
        };
      },
      write: (runId, name, chunk) => this.writeStream({ runId, name, chunk }),
      writeMulti: (runId, name, chunks) =>
        this.writeStreamMulti({ runId, name, chunks }),
      close: (runId, name) => this.closeStream({ runId, name }),
      get: (runId, name, startIndex) =>
        this.getStream({ runId, name, startIndex }),
      list: runId => this.listStreams({ runId }),
      getChunks: (runId, name, options) =>
        this.getStreamChunks({ runId, name, options }),
      getInfo: (runId, name) => this.getStreamInfo({ runId, name }),
    };

    this.queue = async (queueName, message, options) =>
      this.enqueue({ queueName, message, options });

    this.experimental_snapshots = {
      save: (runId, data, metadata) =>
        this.saveSnapshot({ runId, data, metadata }),
      load: runId => this.getSnapshot({ runId }),
      delete: runId => this.deleteSnapshot({ runId }),
    };
  }

  /**
   * Returns the deployment ID configured for this world.
   */
  async getDeploymentId(): Promise<string> {
    return this.deploymentId;
  }

  /**
   * Creates a ULID suitable for use as a Workflow run ID.
   *
   * This identifier is generated locally and does not reserve a run until a
   * corresponding `run_created` event is recorded.
   */
  createRunId(): string {
    return createUlid();
  }

  /**
   * Accepts every execution context because this world has no deployment-side
   * execution constraints.
   */
  validateRunExecutionContext(_value: Record<string, unknown>): void {}

  /**
   * Reports that this world imposes no runtime deadline.
   */
  async getRuntimeDeadline(): Promise<undefined> {
    return undefined;
  }

  /**
   * Starts the world; no setup is required for in-memory storage.
   */
  async start(): Promise<void> {}

  /**
   * Closes the world; there are no external resources to release.
   */
  async close(): Promise<void> {}

  /**
   * Returns this world's configured deployment ID without querying a registry.
   *
   * Since the world has no remote deployments, the configured ID is always the
   * latest ID this implementation can resolve.
   */
  async resolveLatestDeploymentId(): Promise<string> {
    return this.deploymentId;
  }

  /**
   * Reports that this implementation has no run encryption key.
   *
   * Run data is held in process memory without encryption, so this method
   * returns `undefined` regardless of the run or execution context.
   */
  async getEncryptionKeyForRun(
    _runOrId: WorkflowRun | string,
    _context?: Record<string, unknown>,
  ): Promise<undefined> {
    return undefined;
  }

  /**
   * Retains dynamic workflow code in memory and returns its run-scoped locator.
   *
   * No remote upload occurs. The code is included in a checkpoint only when it
   * is not already present in the run's replayable events.
   */
  async uploadDynamicWorkflowCode(
    runId: string,
    input: { workflowName: string; code: Uint8Array },
  ): Promise<string> {
    this.dynamicWorkflowCode.set(runId, cloneValue(input.code));
    return `in-memory:${runId}:${input.workflowName}`;
  }

  /**
   * Reports no deployment environment for this local world.
   */
  getEnvironment(): undefined {
    return undefined;
  }

  /**
   * Provides no deployment-specific description for a run.
   */
  describeRun(_run: Readonly<Record<string, unknown>>): null {
    return null;
  }

  /**
   * Indicates that this world has no remote deployment availability state.
   */
  isDeploymentUnavailableError(_error: unknown): boolean {
    return false;
  }

  /**
   * Enqueues each message independently and preserves input order in results.
   *
   * A failure is returned for its corresponding message with `retryable: false`;
   * it does not reject the batch or prevent later messages from being attempted.
   */
  async queueBatch(
    queueName: ValidQueueName,
    messages: readonly { message: QueuePayload; opts?: QueueOptions }[],
  ): Promise<QueueBatchResult[]> {
    return Promise.all(
      messages.map(async ({ message, opts }) => {
        try {
          const result = await this.enqueue({
            queueName,
            message,
            options: opts,
          });
          return { messageId: result.messageId };
        } catch (error) {
          return {
            messageId: null,
            error: error instanceof Error ? error.message : String(error),
            retryable: false,
          };
        }
      }),
    );
  }

  /**
   * Creates a local HTTP adapter for invoking a queue consumer.
   *
   * The handler parses the request body as a Workflow queue payload and rejects
   * queue names outside `queueNamePrefix` with 400. It passes attempt, message,
   * queue, and optional request IDs to the consumer; parsing or consumer errors
   * are returned as 500 responses.
   */
  createQueueHandler(
    queueNamePrefix: string,
    handler: (
      message: unknown,
      meta: {
        attempt: number;
        queueName: string;
        messageId: MessageIdType;
        requestId?: string;
      },
    ) => Promise<unknown>,
  ): (request: Request) => Promise<Response> {
    return async request => {
      try {
        const message = QueuePayloadSchema.parse(await request.json());
        const queueName =
          request.headers.get('x-workflow-queue-name') ?? queueNamePrefix;
        if (!queueName.startsWith(queueNamePrefix)) {
          return Response.json(
            { error: 'Queue name does not match prefix.' },
            { status: 400 },
          );
        }
        const response = await handler(message, {
          attempt: Number(request.headers.get('x-workflow-attempt') ?? 1),
          queueName,
          messageId: MessageId.parse(
            request.headers.get('x-workflow-message-id') ??
              this.createMessageId(),
          ),
          requestId: request.headers.get('x-workflow-request-id') ?? undefined,
        });
        return Response.json(response ?? null);
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 500 },
        );
      }
    };
  }

  /**
   * Exports a detached checkpoint for one run.
   *
   * The event log is the source for replayable run, step, hook, and wait state.
   * Stream chunks and completion flags, pending queue messages, and dynamic
   * workflow code absent from the events are stored separately. Snapshots,
   * projection caches, and live reader callbacks are deliberately excluded.
   * The returned value is cloned so callers can persist or mutate it without
   * sharing the world's in-memory objects.
   */
  async export(input: { runId: string }): Promise<SerializableValue> {
    const { runId } = input;
    const streams = Object.fromEntries(
      Array.from(this.streamRecords.get(runId) ?? [], ([name, stream]) => [
        name,
        { chunks: cloneValue(stream.chunks), done: stream.done },
      ]),
    );
    const events = this.eventRecords.get(runId) ?? [];
    const eventHasDynamicWorkflowCode = events.some(event => {
      const eventData = event.eventData as Record<string, unknown> | undefined;
      return eventData?.dynamicWorkflowCode != null;
    });

    const data: InMemoryWorldData = InMemoryWorldDataSchema.parse({
      version: 1 as const,
      runId,
      events,
      streams,
      ...(!eventHasDynamicWorkflowCode &&
        this.dynamicWorkflowCode.has(runId) && {
          dynamicWorkflowCode: this.dynamicWorkflowCode.get(runId),
        }),
      queuedMessages: this.queuedMessages.filter(
        queuedMessage => getRunId({ message: queuedMessage.message }) === runId,
      ),
    });
    return cloneValue(data) as unknown as SerializableValue;
  }

  /**
   * Validates and restores a checkpoint without replacing other runs.
   *
   * The checkpoint's embedded run ID and every event or queued message run ID
   * must match `input.runId`. Events are replayed into a temporary world first;
   * only after replay succeeds are that run's projections, streams, dynamic
   * code, and queued messages replaced. The run's transient snapshot is cleared,
   * and the queue idempotency index is rebuilt from the resulting messages.
   */
  async seed(input: { runId: string; data: SerializableValue }): Promise<void> {
    const { runId } = input;
    const data = InMemoryWorldDataSchema.parse(input.data);
    if (data.version !== 1) {
      throw new Error(
        `InMemoryWorld: unsupported data version: ${data.version}.`,
      );
    }
    if (data.runId !== runId) {
      throw new Error(
        `InMemoryWorld: data for run \`${data.runId}\` cannot seed run \`${runId}\`.`,
      );
    }
    if (
      data.events.some(event => event.runId !== runId) ||
      data.queuedMessages.some(
        queuedMessage => getRunId({ message: queuedMessage.message }) !== runId,
      )
    ) {
      throw new Error(
        'InMemoryWorld: extracted records contain a mismatched run id.',
      );
    }

    const candidate = new InMemoryWorld({ deploymentId: this.deploymentId });
    for (const [hookId, hook] of this.hookRecords) {
      if (hook.runId === runId) continue;
      candidate.hookRecords.set(hookId, cloneValue(hook));
      candidate.hookIdsByToken.set(hook.token, hookId);
    }
    if (data.dynamicWorkflowCode) {
      candidate.dynamicWorkflowCode.set(
        runId,
        cloneValue(data.dynamicWorkflowCode),
      );
    }
    candidate.queuedMessages.push(
      ...this.queuedMessages
        .filter(
          queuedMessage =>
            getRunId({ message: queuedMessage.message }) !== runId,
        )
        .map(queuedMessage => cloneValue(queuedMessage)),
      ...data.queuedMessages.map(queuedMessage => cloneValue(queuedMessage)),
    );
    candidate.rebuildQueueIdempotencyKeys();

    const restoredEvents: Event[] = [];
    for (const event of data.events) {
      if (
        event.eventType === 'run_created' &&
        candidate.runRecords.has(runId)
      ) {
        throw new Error(`InMemoryWorld: run \`${runId}\` already exists.`);
      }
      if (event.eventType === 'hook_created' && event.correlationId) {
        const existingHook = candidate.hookRecords.get(event.correlationId);
        if (existingHook && existingHook.runId !== runId) {
          throw new Error(
            `InMemoryWorld: hook id \`${event.correlationId}\` is already in use.`,
          );
        }
      }

      const clonedEvent = cloneValue(event);
      candidate.applyEvent({ event: clonedEvent });
      restoredEvents.push(clonedEvent);
      candidate.eventRecords.set(runId, restoredEvents);
    }
    candidate.eventRecords.set(runId, restoredEvents);
    candidate.streamRecords.set(
      runId,
      new Map(
        Object.entries(data.streams).map(([name, stream]) => [
          name,
          {
            chunks: stream.chunks.map(chunk => cloneValue(chunk)),
            done: stream.done,
            waiters: new Set(),
          },
        ]),
      ),
    );

    this.clearRun({ runId });
    const run = candidate.runRecords.get(runId);
    if (run) this.runRecords.set(runId, run);
    this.eventRecords.set(runId, candidate.eventRecords.get(runId) ?? []);
    this.stepRecords.set(
      runId,
      candidate.stepRecords.get(runId) ?? new Map<string, Step>(),
    );
    this.waitRecords.set(
      runId,
      candidate.waitRecords.get(runId) ?? new Map<string, Wait>(),
    );
    this.streamRecords.set(
      runId,
      candidate.streamRecords.get(runId) ?? new Map<string, StreamData>(),
    );
    this.snapshots.delete(runId);
    this.dynamicWorkflowCode.delete(runId);
    const dynamicWorkflowCode = candidate.dynamicWorkflowCode.get(runId);
    if (dynamicWorkflowCode) {
      this.dynamicWorkflowCode.set(runId, dynamicWorkflowCode);
    }

    this.hookRecords.clear();
    this.hookIdsByToken.clear();
    for (const [hookId, hook] of candidate.hookRecords) {
      this.hookRecords.set(hookId, hook);
      this.hookIdsByToken.set(hook.token, hookId);
    }

    this.queuedMessages.length = 0;
    for (const queuedMessage of candidate.queuedMessages) {
      this.queuedMessages.push(queuedMessage);
    }
    this.rebuildQueueIdempotencyKeys();
  }

  /**
   * Exports a checkpoint in the JSON-safe representation.
   *
   * This first builds the same checkpoint as `export`, then delegates encoding
   * of binary and other supported non-JSON values to the shared provider-utils
   * codec. It does not persist the returned value.
   */
  async exportJson(input: { runId: string }): Promise<JSONValue> {
    const data = await this.export(input);
    return jsonEncodeSerializableValue({ value: data });
  }

  /**
   * Decodes a JSON-safe checkpoint and restores it through `seed`.
   *
   * The shared codec reverses `exportJson`'s transformations before the normal
   * checkpoint schema, run-ID checks, replay, and run-scoped replacement apply.
   */
  async seedJson(input: { runId: string; data: JSONValue }): Promise<void> {
    await this.seed({
      runId: input.runId,
      data: jsonDecodeSerializableValue({ value: input.data }),
    });
  }

  /**
   * Looks up runs in input order, returning `null` for each missing ID.
   *
   * Results are detached copies. `resolveData: 'none'` omits the run's input,
   * output, and dynamic workflow code while retaining its metadata.
   */
  async getManyRuns(input: {
    ids: readonly string[];
    params?: { resolveData?: 'all' | 'none' };
  }): Promise<(WorkflowRun | WorkflowRunWithoutData | null)[]> {
    return input.ids.map(id => {
      const run = this.runRecords.get(id);
      return run
        ? this.resolveRunData({ run, resolveData: input.params?.resolveData })
        : null;
    });
  }

  /**
   * Returns a detached copy of one run, or throws a Workflow-compatible
   * not-found error.
   *
   * Set `resolveData: 'none'` to omit input, output, and dynamic workflow code
   * while keeping the remaining run metadata.
   */
  async getRun(input: {
    id: string;
    params?: { resolveData?: 'all' | 'none' };
  }): Promise<WorkflowRun | WorkflowRunWithoutData> {
    const run = this.runRecords.get(input.id);
    if (!run) throw notFound({ entity: 'WorkflowRun', id: input.id });
    return this.resolveRunData({ run, resolveData: input.params?.resolveData });
  }

  /**
   * Filters and paginates runs, ordered by creation time.
   *
   * A status may be a single value or a list; pagination defaults to newest
   * first and accepts either a numeric offset or a run ID cursor. Returned runs
   * are detached copies, and `resolveData: 'none'` omits their payload fields.
   */
  async listRuns(input: {
    params?: {
      workflowName?: string;
      status?: string | string[];
      pagination?: {
        limit?: number;
        cursor?: string;
        sortOrder?: 'asc' | 'desc';
      };
      resolveData?: 'all' | 'none';
    };
  }) {
    const { params } = input;
    const statuses =
      params?.status === undefined
        ? undefined
        : Array.isArray(params.status)
          ? params.status
          : [params.status];
    const runs = Array.from(this.runRecords.values()).filter(run => {
      if (params?.workflowName && run.workflowName !== params.workflowName)
        return false;
      return statuses === undefined || statuses.includes(run.status);
    });
    const result = paginate({
      items: runs.sort((a, b) =>
        compareDates({
          a: a.createdAt,
          b: b.createdAt,
          sortOrder: params?.pagination?.sortOrder,
        }),
      ),
      pagination: params?.pagination,
      getKey: run => run.runId,
    });
    return {
      ...result,
      data: result.data.map(run =>
        this.resolveRunData({ run, resolveData: params?.resolveData }),
      ),
    };
  }

  /**
   * Returns a detached copy of one step, or throws if the run/step pair is
   * missing.
   *
   * `resolveData: 'none'` omits step input and output but leaves lifecycle
   * metadata available.
   */
  async getStep(input: {
    runId: string;
    stepId: string;
    params?: { resolveData?: 'all' | 'none' };
  }) {
    const step = this.stepRecords.get(input.runId)?.get(input.stepId);
    if (!step)
      throw notFound({ entity: 'Step', id: `${input.runId}/${input.stepId}` });
    return this.resolveStepData({
      step,
      resolveData: input.params?.resolveData,
    });
  }

  /**
   * Lists a run's steps in creation-time order with optional pagination.
   *
   * Pagination defaults to newest first and accepts a numeric offset or step
   * ID cursor. `resolveData: 'none'` omits input and output from each result.
   */
  async listSteps(input: {
    params: {
      runId: string;
      pagination?: {
        limit?: number;
        cursor?: string;
        sortOrder?: 'asc' | 'desc';
      };
      resolveData?: 'all' | 'none';
    };
  }) {
    const { params } = input;
    const steps = Array.from(
      this.stepRecords.get(params.runId)?.values() ?? [],
    );
    const result = paginate({
      items: steps.sort((a, b) =>
        compareDates({
          a: a.createdAt,
          b: b.createdAt,
          sortOrder: params.pagination?.sortOrder,
        }),
      ),
      pagination: params.pagination,
      getKey: step => step.stepId,
    });
    return {
      ...result,
      data: result.data.map(step =>
        this.resolveStepData({ step, resolveData: params.resolveData }),
      ),
    };
  }

  /**
   * Returns a detached copy of an event, or throws if it is not in the run's
   * event log.
   */
  async getEvent(input: { runId: string; eventId: string }): Promise<Event> {
    const event = this.eventRecords
      .get(input.runId)
      ?.find(candidate => candidate.eventId === input.eventId);
    if (!event)
      throw notFound({
        entity: 'Event',
        id: `${input.runId}/${input.eventId}`,
      });
    return cloneValue(event);
  }

  /**
   * Lists a run's events in recorded order and paginates the result.
   *
   * Each event is cloned before `stripEventDataRefs` applies the requested
   * payload-resolution mode, so callers cannot mutate the stored event log.
   */
  async listEvents(input: { params: ListEventsParams }) {
    const { params } = input;
    const events = this.eventRecords.get(params.runId) ?? [];
    const result = paginate({
      items: events,
      pagination: params.pagination,
      getKey: event => event.eventId,
    });
    return {
      ...result,
      data: result.data.map(event =>
        stripEventDataRefs(cloneValue(event), params.resolveData ?? 'all'),
      ),
    };
  }

  /**
   * Filters one run's event log by correlation ID and paginates the matches.
   *
   * Event payload references are resolved or stripped using the same mode as
   * `listEvents`.
   */
  async listEventsByCorrelationId(input: {
    params: ListEventsByCorrelationIdParams;
  }) {
    const { params } = input;
    const events = (this.eventRecords.get(params.runId) ?? []).filter(
      event => event.correlationId === params.correlationId,
    );
    const result = paginate({
      items: events,
      pagination: params.pagination,
      getKey: event => event.eventId,
    });
    return {
      ...result,
      data: result.data.map(event =>
        stripEventDataRefs(cloneValue(event), params.resolveData ?? 'all'),
      ),
    };
  }

  /**
   * Validates and records one event, then applies it to the in-memory projections.
   *
   * `run_created` may omit `runId`, in which case a local ID is generated;
   * other event types require an existing run, except `run_started`, which may
   * initialize a partial run record. Event IDs follow insertion order, and the
   * event is appended only after its projection update succeeds.
   */
  async createEvent(input: {
    runId: string | null;
    data: CreateEventRequest | RunCreatedEventRequest;
    params?: CreateEventParams;
  }): Promise<EventResult> {
    const request = CreateEventSchema.parse(input.data) as
      | CreateEventRequest
      | RunCreatedEventRequest;
    const runId =
      request.eventType === 'run_created'
        ? (input.runId ?? this.nextRunId())
        : input.runId;
    if (runId == null)
      throw new Error('InMemoryWorld: `runId` is required for this event.');

    if (request.eventType === 'run_created' && this.runRecords.has(runId)) {
      throw new Error(`InMemoryWorld: run \`${runId}\` already exists.`);
    }
    if (
      request.eventType !== 'run_created' &&
      request.eventType !== 'run_started' &&
      !this.runRecords.has(runId)
    ) {
      throw notFound({ entity: 'WorkflowRun', id: runId });
    }

    const events = this.eventRecords.get(runId) ?? [];
    const createdAt = input.params?.occurredAt ?? new Date();
    const event = EventSchema.parse({
      ...request,
      runId,
      eventId: slotToEventId(events.length + 1),
      createdAt,
      occurredAt: input.params?.occurredAt,
      specVersion: request.specVersion ?? this.specVersion,
    }) as Event;

    const result = this.applyEvent({ event });
    events.push(event);
    this.eventRecords.set(runId, events);
    return {
      event: cloneValue(event),
      ...result,
    } as EventResult;
  }

  /**
   * Creates batch events sequentially and returns one result per input event.
   *
   * A failed event is reported as a 409 conflict and does not stop later events;
   * earlier successful events are not rolled back, so the batch is not atomic.
   */
  async createEventBatch(input: {
    runId: string;
    batch: BatchEventRequest[];
    params?: CreateEventBatchParams;
  }): Promise<EventBatchResult> {
    const results = [];
    for (const item of input.batch) {
      try {
        const result = await this.createEvent({
          runId: input.runId,
          data: item.event,
          params: {
            resolveData: input.params?.resolveData,
            requestId: input.params?.requestId,
            occurredAt: item.occurredAt,
          },
        });
        results.push({
          status: 200 as const,
          event: result.event!,
          run: result.run,
          step: result.step,
          wait: result.wait,
        });
      } catch (error) {
        results.push({
          status: 409,
          error: 'conflict',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { results };
  }

  /**
   * Returns a detached copy of the hook with this ID.
   *
   * Hook records are indexed across runs; a missing ID throws the
   * Workflow-compatible hook not-found error.
   */
  async getHook(input: { hookId: string }): Promise<Hook> {
    const hook = this.hookRecords.get(input.hookId);
    if (!hook) throw notFound({ entity: 'Hook', id: input.hookId });
    return cloneValue(hook);
  }

  /**
   * Resolves a hook token through the world-wide token index.
   *
   * The index is updated by hook lifecycle events and is rebuilt when a run is
   * restored; tokens replaced by a forced claim no longer resolve to the old
   * hook.
   */
  async getHookByToken(input: { token: string }): Promise<Hook> {
    const hookId = this.hookIdsByToken.get(input.token);
    if (!hookId) throw notFound({ entity: 'Hook', id: input.token });
    return this.getHook({ hookId });
  }

  /**
   * Lists hooks across the world, optionally filtering to one run.
   *
   * Results are ordered by creation time, newest first by default, and use the
   * same numeric-offset or hook-ID cursor behavior as other paginated lists.
   */
  async listHooks(input: {
    params: {
      runId?: string;
      pagination?: {
        limit?: number;
        cursor?: string;
        sortOrder?: 'asc' | 'desc';
      };
    };
  }) {
    const hooks = Array.from(this.hookRecords.values()).filter(
      hook =>
        input.params.runId === undefined || hook.runId === input.params.runId,
    );
    return paginate({
      items: hooks.sort((a, b) =>
        compareDates({
          a: a.createdAt,
          b: b.createdAt,
          sortOrder: input.params.pagination?.sortOrder,
        }),
      ),
      pagination: input.params.pagination,
      getKey: hook => hook.hookId,
    });
  }

  /**
   * Appends one chunk to a run's named stream and wakes waiting readers.
   *
   * Strings are encoded as UTF-8; byte arrays are cloned before storage. A
   * stream is created on its first write, and writes after it has been closed
   * reject with an error.
   */
  async writeStream(input: {
    runId: string;
    name: string;
    chunk: string | Uint8Array;
  }): Promise<void> {
    const stream = this.getOrCreateStream({
      runId: input.runId,
      name: input.name,
    });
    if (stream.done)
      throw new Error(`InMemoryWorld: stream \`${input.name}\` is closed.`);
    stream.chunks.push(toBytes(input.chunk));
    this.notifyStream({ stream });
  }

  /**
   * Appends chunks sequentially using the same validation as `writeStream`.
   *
   * If a write fails, the method rejects immediately; chunks already appended
   * remain in the stream and later chunks are not attempted.
   */
  async writeStreamMulti(input: {
    runId: string;
    name: string;
    chunks: (string | Uint8Array)[];
  }): Promise<void> {
    for (const chunk of input.chunks) {
      await this.writeStream({ runId: input.runId, name: input.name, chunk });
    }
  }

  /**
   * Marks a stream complete and wakes every reader waiting for another chunk.
   *
   * Closing a stream with no prior writes creates an empty, completed stream.
   * Subsequent reads drain buffered chunks and then close; later writes fail.
   */
  async closeStream(input: { runId: string; name: string }): Promise<void> {
    const stream = this.getOrCreateStream({
      runId: input.runId,
      name: input.name,
    });
    stream.done = true;
    this.notifyStream({ stream });
  }

  /**
   * Opens a live reader beginning at a chunk index.
   *
   * A negative `startIndex` is resolved against the number of chunks present
   * when this method is called, with values before the beginning clamped to
   * zero. The reader then waits for future writes until the stream is closed;
   * each enqueued chunk is cloned before it is exposed.
   */
  async getStream(input: {
    runId: string;
    name: string;
    startIndex?: number;
  }): Promise<ReadableStream<Uint8Array>> {
    const stream = this.getOrCreateStream({
      runId: input.runId,
      name: input.name,
    });
    const requestedIndex = input.startIndex ?? 0;
    let index =
      requestedIndex < 0
        ? Math.max(0, stream.chunks.length + requestedIndex)
        : requestedIndex;
    return new ReadableStream<Uint8Array>({
      pull: controller => {
        if (index < stream.chunks.length) {
          controller.enqueue(cloneValue(stream.chunks[index++]));
          return;
        }
        if (stream.done) {
          controller.close();
          return;
        }
        return new Promise<void>(resolve => {
          const wake = () => {
            stream.waiters.delete(wake);
            resolve();
          };
          stream.waiters.add(wake);
        });
      },
      cancel: () => this.notifyStream({ stream }),
    });
  }

  /**
   * Lists the names of streams created for a run.
   *
   * Reading an unknown stream through a stream getter creates it, so it then
   * appears in this list.
   */
  async listStreams(input: { runId: string }): Promise<string[]> {
    return Array.from(this.streamRecords.get(input.runId)?.keys() ?? []);
  }

  /**
   * Reads a page of already-written chunks without waiting for future writes.
   *
   * The default page size is 100 and the maximum is 1,000. The cursor is the
   * numeric index of the next chunk; returned byte arrays are cloned, and
   * `done` reports whether the writer has closed the stream.
   */
  async getStreamChunks(input: {
    runId: string;
    name: string;
    options?: { limit?: number; cursor?: string };
  }): Promise<StreamChunksResponse> {
    const stream = this.getOrCreateStream({
      runId: input.runId,
      name: input.name,
    });
    const limit = Math.min(1000, Math.max(0, input.options?.limit ?? 100));
    const start = parseCursor({ cursor: input.options?.cursor });
    const end = Math.min(stream.chunks.length, start + limit);
    const data = stream.chunks.slice(start, end).map((chunk, offset) => ({
      index: start + offset,
      data: cloneValue(chunk),
    }));
    const hasMore = end < stream.chunks.length;
    return {
      data,
      cursor: hasMore ? String(end) : null,
      hasMore,
      done: stream.done,
    };
  }

  /**
   * Returns the current tail index and completion state without reading chunks.
   *
   * An empty stream has `tailIndex: -1`; querying a missing stream creates an
   * open empty stream, consistent with the other stream readers.
   */
  async getStreamInfo(input: {
    runId: string;
    name: string;
  }): Promise<StreamInfoResponse> {
    const stream = this.getOrCreateStream({
      runId: input.runId,
      name: input.name,
    });
    return { tailIndex: stream.chunks.length - 1, done: stream.done };
  }

  /**
   * Loads a detached copy of a run's transient snapshot, or returns `null`.
   *
   * Snapshots are process-local caches and are deliberately excluded from
   * checkpoints; a seeded run therefore has no snapshot until one is saved.
   */
  async getSnapshot(input: {
    runId: string;
  }): Promise<{ data: Uint8Array; metadata: SnapshotMetadata } | null> {
    const snapshot = this.snapshots.get(input.runId);
    return snapshot ? cloneValue(snapshot) : null;
  }

  /**
   * Stores a detached, process-local snapshot for a run.
   *
   * Both data and metadata are cloned on write and again on read. Snapshots are
   * caches rather than checkpoint state and are cleared when that run is seeded.
   */
  async saveSnapshot(input: {
    runId: string;
    data: Uint8Array;
    metadata: SnapshotMetadata;
  }): Promise<void> {
    this.snapshots.set(input.runId, {
      data: cloneValue(input.data),
      metadata: cloneValue(input.metadata),
    });
  }

  /**
   * Removes a run's transient snapshot without changing its checkpoint state.
   */
  async deleteSnapshot(input: { runId: string }): Promise<void> {
    this.snapshots.delete(input.runId);
  }

  /**
   * Validates and stores a pending message, deduplicating by queue and key.
   *
   * The first message stored for a given `(queueName, idempotencyKey)` supplies
   * the returned message ID; later duplicates return that ID without replacing
   * the original payload. Messages are cloned and included in the checkpoint
   * only when their payload identifies the exported run.
   */
  private async enqueue(input: {
    queueName: string;
    message: QueuePayload;
    options?: QueueOptions;
  }): Promise<{ messageId: MessageIdType }> {
    const message = QueuePayloadSchema.parse(input.message);
    const idempotencyKey = input.options?.idempotencyKey;
    const dedupeKey =
      idempotencyKey === undefined
        ? undefined
        : `${input.queueName}:${idempotencyKey}`;
    const existingId = dedupeKey && this.queueIdempotencyKeys.get(dedupeKey);
    if (existingId) return { messageId: existingId };

    const messageId = this.createMessageId();
    this.queuedMessages.push({
      queueName: input.queueName,
      messageId,
      message: cloneValue(message),
      options: input.options && cloneValue(input.options),
    });
    if (dedupeKey) this.queueIdempotencyKeys.set(dedupeKey, messageId);
    return { messageId };
  }

  /**
   * Generates a process-local message ID not currently used by a queued message.
   *
   * IDs use a monotonically increasing base-36 sequence. The collision check is
   * against the current pending queue only; IDs are not reserved across world
   * instances or preserved after the message is removed.
   */
  private createMessageId(): MessageIdType {
    let messageId: MessageIdType;
    do {
      this.messageSequence += 1;
      messageId = MessageId.parse(`msg_${this.messageSequence.toString(36)}`);
    } while (
      this.queuedMessages.some(
        queuedMessage => queuedMessage.messageId === messageId,
      )
    );
    return messageId;
  }

  /**
   * Creates a `wrun_`-prefixed ULID for an ID-less `run_created` event.
   *
   * Generating the identifier does not create the run; the event is recorded
   * separately by `createEvent`.
   */
  private nextRunId(): string {
    return `wrun_${createUlid()}`;
  }

  /**
   * Applies a lifecycle event to the projection it represents.
   *
   * Run, attribute, step, hook, and wait events update their corresponding
   * in-memory records. Unknown event kinds and no-op events create no derived
   * projection; sealed no-op events return early. The caller owns appending the
   * event after this method succeeds.
   */
  private applyEvent(input: { event: Event }): {
    run?: WorkflowRun;
    step?: Step;
    hook?: Hook;
    wait?: Wait;
  } {
    const { event } = input;
    const now = event.createdAt;
    const runId = event.runId;
    const eventData = event.eventData as Record<string, unknown> | undefined;
    const result: {
      run?: WorkflowRun;
      step?: Step;
      hook?: Hook;
      wait?: Wait;
    } = {};

    if (event.eventType === 'run_created') {
      const data = event.eventData;
      const run = {
        runId,
        status: 'pending' as const,
        deploymentId: data.deploymentId,
        workflowName: data.workflowName,
        specVersion: event.specVersion,
        executionContext: data.executionContext,
        input: data.input,
        dynamicWorkflowCode:
          data.dynamicWorkflowCode ?? this.dynamicWorkflowCode.get(runId),
        attributes: data.attributes ?? {},
        encryptionPublicKey: data.encryptionPublicKey,
        createdAt: now,
        updatedAt: now,
      } as WorkflowRun;
      this.runRecords.set(runId, run);
      result.run = run;
    } else if (event.eventType.startsWith('run_')) {
      const existingRun = this.runRecords.get(runId);
      if (existingRun === undefined && event.eventType !== 'run_started') {
        throw notFound({ entity: 'WorkflowRun', id: runId });
      }
      const run =
        existingRun ??
        ({
          runId,
          status: 'pending',
          deploymentId: this.deploymentId,
          workflowName: 'unknown',
          specVersion: event.specVersion,
          attributes: {},
          createdAt: now,
          updatedAt: now,
        } as WorkflowRun);
      let updatedRun: WorkflowRun = { ...run, updatedAt: now };
      if (event.eventType === 'run_started') {
        const data = event.eventData;
        updatedRun = {
          ...updatedRun,
          status: 'running',
          startedAt: run.startedAt ?? now,
          deploymentId: data?.deploymentId ?? run.deploymentId,
          workflowName: data?.workflowName ?? run.workflowName,
          executionContext: data?.executionContext ?? run.executionContext,
          input: data?.input ?? run.input,
          dynamicWorkflowCode:
            data?.dynamicWorkflowCode ??
            run.dynamicWorkflowCode ??
            this.dynamicWorkflowCode.get(runId),
          attributes: data?.attributes ?? run.attributes,
          encryptionPublicKey:
            data?.encryptionPublicKey ?? run.encryptionPublicKey,
        } as WorkflowRun;
      } else if (event.eventType === 'run_completed') {
        updatedRun = {
          ...updatedRun,
          status: 'completed',
          output: event.eventData.output,
          completedAt: now,
        } as WorkflowRun;
      } else if (event.eventType === 'run_failed') {
        updatedRun = {
          ...updatedRun,
          status: 'failed',
          error: event.eventData.error,
          errorCode: event.eventData.errorCode,
          completedAt: now,
        } as WorkflowRun;
      } else if (event.eventType === 'run_cancelled') {
        updatedRun = {
          ...updatedRun,
          status: 'cancelled',
          completedAt: now,
        } as WorkflowRun;
      }
      this.runRecords.set(runId, updatedRun);
      result.run = updatedRun;
    } else if (event.eventType === 'attr_set') {
      const run = this.requireRun({ runId });
      const attributes = applyAttributeChanges(
        run.attributes ?? {},
        event.eventData.changes,
      );
      const updatedRun = { ...run, attributes, updatedAt: now } as WorkflowRun;
      this.runRecords.set(runId, updatedRun);
      result.run = updatedRun;
    } else if (event.eventType.startsWith('step_')) {
      result.step = this.applyStepEvent({ event });
    } else if (event.eventType.startsWith('hook_')) {
      result.hook = this.applyHookEvent({ event });
    } else if (event.eventType.startsWith('wait_')) {
      result.wait = this.applyWaitEvent({ event });
    } else if (event.eventType === 'noop' && eventData?.sealed === true) {
      return result;
    }

    return result;
  }

  /**
   * Rebuilds one step record from its lifecycle event.
   *
   * A start event can initialize a missing step and derives an attempt number
   * when the event omits one. Completion, failure, and retry events require an
   * existing step; they update its status and timestamps while preserving the
   * other projected fields.
   */
  private applyStepEvent(input: { event: Event }): Step {
    const { event } = input;
    const runId = event.runId;
    const stepId = event.correlationId;
    if (!stepId)
      throw new Error('InMemoryWorld: step events require a correlation id.');
    const steps = this.stepRecords.get(runId) ?? new Map<string, Step>();
    const existing = steps.get(stepId);
    const data = (event.eventData ?? {}) as Record<string, unknown>;
    const now = event.createdAt;
    let step: Step;

    if (event.eventType === 'step_created') {
      step = {
        runId,
        stepId,
        stepName: String(data.stepName),
        status: 'pending',
        input: data.input,
        attempt: 0,
        createdAt: now,
        updatedAt: now,
        specVersion: event.specVersion,
      } as Step;
    } else if (event.eventType === 'step_started') {
      step = {
        ...(existing ?? {
          runId,
          stepId,
          stepName: String(data.stepName ?? stepId),
          input: data.input,
          createdAt: now,
          attempt: 0,
          specVersion: event.specVersion,
        }),
        status: 'running',
        attempt:
          typeof data.attempt === 'number'
            ? data.attempt
            : (existing?.attempt ?? 0) + 1,
        startedAt: existing?.startedAt ?? now,
        updatedAt: now,
      } as Step;
    } else if (event.eventType === 'step_completed') {
      if (!existing)
        throw notFound({ entity: 'Step', id: `${runId}/${stepId}` });
      step = {
        ...existing,
        status: 'completed',
        output: data.result,
        completedAt: now,
        updatedAt: now,
      };
    } else if (event.eventType === 'step_failed') {
      if (!existing)
        throw notFound({ entity: 'Step', id: `${runId}/${stepId}` });
      step = {
        ...existing,
        status: 'failed',
        error: data.error,
        completedAt: now,
        updatedAt: now,
      };
    } else {
      if (!existing)
        throw notFound({ entity: 'Step', id: `${runId}/${stepId}` });
      step = {
        ...existing,
        status: 'pending',
        error: data.error,
        retryAfter: data.retryAfter as Date | undefined,
        updatedAt: now,
      };
    }

    steps.set(stepId, step);
    this.stepRecords.set(runId, steps);
    return step;
  }

  /**
   * Applies hook lifecycle events and keeps the token index consistent.
   *
   * A forced creation can replace a different hook using the same token;
   * without `force`, that collision is an error. Disposal removes both the hook
   * record and its token mapping.
   */
  private applyHookEvent(input: { event: Event }): Hook | undefined {
    const { event } = input;
    const hookId = event.correlationId;
    if (!hookId)
      throw new Error('InMemoryWorld: hook events require a correlation id.');
    if (event.eventType === 'hook_created') {
      const data = event.eventData;
      const priorHookId = this.hookIdsByToken.get(data.token);
      const priorHook = priorHookId
        ? this.hookRecords.get(priorHookId)
        : undefined;
      if (priorHook && priorHook.hookId !== hookId && !data.force) {
        throw new Error(
          `InMemoryWorld: hook token \`${data.token}\` is already in use.`,
        );
      }
      if (priorHook && data.force) {
        this.hookRecords.delete(priorHook.hookId);
        this.hookIdsByToken.delete(priorHook.token);
      }
      const hook = {
        runId: event.runId,
        hookId,
        token: data.token,
        ownerId: 'in-memory',
        projectId: 'in-memory',
        environment: 'development',
        metadata: data.metadata,
        createdAt: event.createdAt,
        specVersion: event.specVersion,
        isWebhook: data.isWebhook,
        isSystem: data.isSystem,
        tokenRetentionUntil: data.tokenRetentionUntil,
        claimedFrom: data.forceClaimedFrom,
      } as Hook;
      this.hookRecords.set(hookId, hook);
      this.hookIdsByToken.set(data.token, hookId);
      return hook;
    }
    if (event.eventType === 'hook_disposed') {
      const hook = this.hookRecords.get(hookId);
      if (hook) {
        this.hookRecords.delete(hookId);
        this.hookIdsByToken.delete(hook.token);
      }
      return hook;
    }
    return this.hookRecords.get(hookId);
  }

  /**
   * Creates or completes the wait record identified by the event correlation ID.
   *
   * Creation records the scheduled resume time and starts in `waiting`; any
   * subsequent wait event projects a completed wait using that event's time.
   */
  private applyWaitEvent(input: { event: Event }): Wait {
    const { event } = input;
    const waitId = event.correlationId;
    if (!waitId)
      throw new Error('InMemoryWorld: wait events require a correlation id.');
    const waits = this.waitRecords.get(event.runId) ?? new Map<string, Wait>();
    const existing = waits.get(waitId);
    const data = event.eventData as Record<string, unknown> | undefined;
    const wait =
      event.eventType === 'wait_created'
        ? {
            waitId,
            runId: event.runId,
            status: 'waiting' as const,
            resumeAt: data?.resumeAt as Date,
            createdAt: event.createdAt,
            updatedAt: event.createdAt,
            specVersion: event.specVersion,
          }
        : {
            ...(existing ?? {
              waitId,
              runId: event.runId,
              createdAt: event.createdAt,
              specVersion: event.specVersion,
            }),
            status: 'completed' as const,
            resumeAt: data?.resumeAt as Date | undefined,
            completedAt: event.createdAt,
            updatedAt: event.createdAt,
          };
    waits.set(waitId, wait);
    this.waitRecords.set(event.runId, waits);
    return wait;
  }

  /**
   * Returns the internal run record or throws the Workflow-compatible
   * not-found error used by the public getters.
   */
  private requireRun(input: { runId: string }): WorkflowRun {
    const run = this.runRecords.get(input.runId);
    if (!run) throw notFound({ entity: 'WorkflowRun', id: input.runId });
    return run;
  }

  /**
   * Produces the requested run view without exposing stored mutable objects.
   *
   * The default view is a deep clone. `resolveData: 'none'` preserves metadata
   * but sets input, output, and dynamic workflow code to `undefined`.
   */
  private resolveRunData(input: {
    run: WorkflowRun;
    resolveData?: 'all' | 'none';
  }): WorkflowRun | WorkflowRunWithoutData {
    if (input.resolveData !== 'none') return cloneValue(input.run);
    return {
      ...input.run,
      input: undefined,
      output: undefined,
      dynamicWorkflowCode: undefined,
    } as WorkflowRunWithoutData;
  }

  /**
   * Produces a detached step view, optionally omitting its payload fields.
   *
   * `resolveData: 'none'` sets input and output to `undefined`; otherwise the
   * returned step is a deep clone of the stored projection.
   */
  private resolveStepData(input: { step: Step; resolveData?: 'all' | 'none' }) {
    if (input.resolveData !== 'none') return cloneValue(input.step);
    return { ...input.step, input: undefined, output: undefined };
  }

  /**
   * Returns the named stream buffer, creating it as open and empty if absent.
   *
   * Read operations also use this helper, so observing a previously unseen
   * stream creates state that can later be listed or checkpointed.
   */
  private getOrCreateStream(input: {
    runId: string;
    name: string;
  }): StreamData {
    const streams =
      this.streamRecords.get(input.runId) ?? new Map<string, StreamData>();
    let stream = streams.get(input.name);
    if (!stream) {
      stream = { chunks: [], done: false, waiters: new Set() };
      streams.set(input.name, stream);
      this.streamRecords.set(input.runId, streams);
    }
    return stream;
  }

  /**
   * Wakes all readers currently waiting on this stream.
   *
   * Each reader removes its own wake callback when resumed. This method does
   * not mark the stream complete; the write or close operation controls that
   * state before notifying readers.
   */
  private notifyStream(input: { stream: StreamData }): void {
    for (const wake of input.stream.waiters) wake();
  }

  /**
   * Clears one run's state and wakes readers before discarding its streams.
   *
   * Other runs' records are retained. Run-owned hooks and pending queue messages
   * are removed as well; callers rebuilding a world-wide index must do so after
   * replacing the run's messages.
   */
  private clearRun(input: { runId: string }): void {
    for (const stream of this.streamRecords.get(input.runId)?.values() ?? []) {
      stream.done = true;
      this.notifyStream({ stream });
    }
    this.runRecords.delete(input.runId);
    this.eventRecords.delete(input.runId);
    this.stepRecords.delete(input.runId);
    this.waitRecords.delete(input.runId);
    this.streamRecords.delete(input.runId);
    this.snapshots.delete(input.runId);
    this.dynamicWorkflowCode.delete(input.runId);
    for (const [hookId, hook] of this.hookRecords) {
      if (hook.runId === input.runId) {
        this.hookRecords.delete(hookId);
        this.hookIdsByToken.delete(hook.token);
      }
    }
    for (let index = this.queuedMessages.length - 1; index >= 0; index--) {
      if (
        getRunId({ message: this.queuedMessages[index].message }) ===
        input.runId
      ) {
        this.queuedMessages.splice(index, 1);
      }
    }
  }

  /**
   * Rebuilds the queue-scoped idempotency index from the current message list.
   *
   * The index is derived state: rebuilding it after checkpoint seeding ensures
   * duplicate checks use the restored messages rather than stale entries.
   */
  private rebuildQueueIdempotencyKeys(): void {
    this.queueIdempotencyKeys.clear();
    for (const queued of this.queuedMessages) {
      const key = queued.options?.idempotencyKey;
      if (key !== undefined) {
        this.queueIdempotencyKeys.set(
          `${queued.queueName}:${key}`,
          queued.messageId,
        );
      }
    }
  }

  /**
   * Validates a run's attribute update, records it as an event, and returns the
   * resulting attributes.
   *
   * Reserved-key policy is delegated to `validateAttributeChanges`. The
   * projection is changed only by applying the resulting `attr_set` event, so
   * the event log remains the source used by checkpoint replay.
   */
  private async setRunAttributes(input: {
    runId: string;
    changes: { key: string; value: string | null }[];
    options?: { allowReservedAttributes?: boolean };
  }) {
    const run = this.requireRun({ runId: input.runId });
    const existingAttributes = run.attributes ?? {};
    validateAttributeChanges(input.changes, {
      existingKeys: Object.keys(existingAttributes),
      allowReservedAttributes: input.options?.allowReservedAttributes,
    });
    await this.createEvent({
      runId: input.runId,
      data: {
        eventType: 'attr_set',
        eventData: {
          changes: input.changes,
          writer: { type: 'workflow' },
          ...(input.options?.allowReservedAttributes && {
            allowReservedAttributes: true,
          }),
        },
      },
    });
    return {
      attributes: cloneValue(
        this.requireRun({ runId: input.runId }).attributes,
      ),
    };
  }

  /**
   * Cancels eligible runs sequentially and reports one outcome per requested ID.
   *
   * Missing and already-cancelled runs are reported without events; completed
   * or failed runs are not cancellable. Active runs are cancelled through the
   * normal event path, and the summary counts each outcome in the input list.
   */
  private async cancelRuns(input: {
    request: { runIds: string[]; cancelReason?: string };
  }) {
    const results = [];
    for (const runId of input.request.runIds) {
      const run = this.runRecords.get(runId);
      if (!run) {
        results.push({ runId, outcome: 'not_found' as const });
      } else if (run.status === 'cancelled') {
        results.push({ runId, outcome: 'already_cancelled' as const });
      } else if (run.status === 'completed' || run.status === 'failed') {
        results.push({
          runId,
          outcome: 'not_cancellable' as const,
          status: run.status,
        });
      } else {
        await this.createEvent({
          runId,
          data: {
            eventType: 'run_cancelled',
            eventData: { cancelReason: input.request.cancelReason },
          },
        });
        results.push({ runId, outcome: 'cancelled' as const });
      }
    }
    return {
      summary: {
        requested: results.length,
        cancelled: results.filter(result => result.outcome === 'cancelled')
          .length,
        alreadyCancelled: results.filter(
          result => result.outcome === 'already_cancelled',
        ).length,
        notCancellable: results.filter(
          result => result.outcome === 'not_cancellable',
        ).length,
        notFound: results.filter(result => result.outcome === 'not_found')
          .length,
        failed: 0,
      },
      results,
    };
  }
}

/**
 * Deep-clones a value supported by `SerializableValue`.
 *
 * The world uses this at API and checkpoint boundaries to keep callers from
 * mutating stored records or byte buffers through shared references.
 */
function cloneValue<T>(value: T): T {
  return cloneSerializableValue({ value: value as SerializableValue }) as T;
}

/**
 * Generates a 26-character ULID from the current millisecond and random suffix.
 *
 * The timestamp occupies the first 10 Crockford Base32 characters; the
 * remaining 16 are selected with `Math.random`, so this helper is for local
 * identifiers and must not be used to create security tokens.
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
 * Creates a Workflow-compatible not-found error for the named entity.
 *
 * The entity determines the error's `name` (for example,
 * `WorkflowRunNotFoundError`), while the supplied ID is included in the
 * message.
 */
function notFound(input: { entity: string; id: string }): Error {
  const error = new Error(`${input.entity} \`${input.id}\` was not found.`);
  error.name = `${input.entity}NotFoundError`;
  return error;
}

/**
 * Reads a run ID from queue payloads that are scoped to a workflow run.
 */
function getRunId(input: { message: QueuePayload }): string | undefined {
  const message = input.message as Record<string, unknown>;
  return typeof message.runId === 'string' ? message.runId : undefined;
}

/**
 * Converts text chunks to UTF-8 bytes and clones binary chunks.
 */
function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string'
    ? new TextEncoder().encode(value)
    : cloneValue(value);
}

/**
 * Parses a non-negative integer offset, returning zero for invalid cursors.
 *
 * `paginate` separately supports key-based cursors, so this helper deliberately
 * treats non-numeric values as the first-page offset.
 */
function parseCursor(input: { cursor?: string }): number {
  if (input.cursor === undefined) return 0;
  const cursor = Number(input.cursor);
  return Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
}

/**
 * Slices a page by numeric offset or by the key of the preceding item.
 *
 * A missing or invalid key starts at the beginning. The returned cursor is the
 * next numeric offset, not the key of the last item, and is `null` when the
 * requested page reaches the end.
 */
function paginate<T>(input: {
  items: T[];
  pagination?: { limit?: number; cursor?: string };
  getKey: (item: T) => string;
}): { data: T[]; cursor: string | null; hasMore: boolean } {
  let start = parseCursor({ cursor: input.pagination?.cursor });
  if (input.pagination?.cursor !== undefined && start === 0) {
    const cursorIndex = input.items.findIndex(
      item => input.getKey(item) === input.pagination?.cursor,
    );
    if (cursorIndex !== -1) start = cursorIndex + 1;
  }
  const limit = input.pagination?.limit;
  const end =
    limit === undefined ? input.items.length : start + Math.max(0, limit);
  const data = input.items.slice(start, end);
  const hasMore = end < input.items.length;
  return {
    data,
    cursor: hasMore ? String(start + data.length) : null,
    hasMore,
  };
}

/**
 * Compares dates in the requested sort order, defaulting to descending.
 */
function compareDates(input: {
  a: Date;
  b: Date;
  sortOrder?: 'asc' | 'desc';
}): number {
  const order = input.sortOrder === 'asc' ? 1 : -1;
  return (input.a.getTime() - input.b.getTime()) * order;
}
