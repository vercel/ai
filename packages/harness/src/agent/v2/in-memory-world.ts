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

interface Storable {
  export(input: { runId: string }): Promise<SerializableValue>;
  seed(input: { runId: string; data: SerializableValue }): Promise<void>;
  exportJson(input: { runId: string }): Promise<JSONValue>;
  seedJson(input: { runId: string; data: JSONValue }): Promise<void>;
}

type QueueMessage = {
  queueName: string;
  messageId: MessageIdType;
  message: QueuePayload;
  options?: QueueOptions;
};

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

type InMemoryWorldData = z.infer<typeof InMemoryWorldDataSchema>;

type StreamData = {
  chunks: Uint8Array[];
  done: boolean;
  waiters: Set<() => void>;
};

type InMemoryWorldOptions = {
  deploymentId?: string;
};

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

  async getDeploymentId(): Promise<string> {
    return this.deploymentId;
  }

  createRunId(): string {
    return createUlid();
  }

  validateRunExecutionContext(_value: Record<string, unknown>): void {}

  async getRuntimeDeadline(): Promise<undefined> {
    return undefined;
  }

  async start(): Promise<void> {}

  async close(): Promise<void> {}

  async resolveLatestDeploymentId(): Promise<string> {
    return this.deploymentId;
  }

  async getEncryptionKeyForRun(
    _runOrId: WorkflowRun | string,
    _context?: Record<string, unknown>,
  ): Promise<undefined> {
    return undefined;
  }

  async uploadDynamicWorkflowCode(
    runId: string,
    input: { workflowName: string; code: Uint8Array },
  ): Promise<string> {
    this.dynamicWorkflowCode.set(runId, cloneValue(input.code));
    return `in-memory:${runId}:${input.workflowName}`;
  }

  getEnvironment(): undefined {
    return undefined;
  }

  describeRun(_run: Readonly<Record<string, unknown>>): null {
    return null;
  }

  isDeploymentUnavailableError(_error: unknown): boolean {
    return false;
  }

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

  async exportJson(input: { runId: string }): Promise<JSONValue> {
    const data = await this.export(input);
    return jsonEncodeSerializableValue({ value: data });
  }

  async seedJson(input: { runId: string; data: JSONValue }): Promise<void> {
    await this.seed({
      runId: input.runId,
      data: jsonDecodeSerializableValue({ value: input.data }),
    });
  }

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

  async getRun(input: {
    id: string;
    params?: { resolveData?: 'all' | 'none' };
  }): Promise<WorkflowRun | WorkflowRunWithoutData> {
    const run = this.runRecords.get(input.id);
    if (!run) throw notFound({ entity: 'WorkflowRun', id: input.id });
    return this.resolveRunData({ run, resolveData: input.params?.resolveData });
  }

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

  async getHook(input: { hookId: string }): Promise<Hook> {
    const hook = this.hookRecords.get(input.hookId);
    if (!hook) throw notFound({ entity: 'Hook', id: input.hookId });
    return cloneValue(hook);
  }

  async getHookByToken(input: { token: string }): Promise<Hook> {
    const hookId = this.hookIdsByToken.get(input.token);
    if (!hookId) throw notFound({ entity: 'Hook', id: input.token });
    return this.getHook({ hookId });
  }

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

  async writeStreamMulti(input: {
    runId: string;
    name: string;
    chunks: (string | Uint8Array)[];
  }): Promise<void> {
    for (const chunk of input.chunks) {
      await this.writeStream({ runId: input.runId, name: input.name, chunk });
    }
  }

  async closeStream(input: { runId: string; name: string }): Promise<void> {
    const stream = this.getOrCreateStream({
      runId: input.runId,
      name: input.name,
    });
    stream.done = true;
    this.notifyStream({ stream });
  }

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

  async listStreams(input: { runId: string }): Promise<string[]> {
    return Array.from(this.streamRecords.get(input.runId)?.keys() ?? []);
  }

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

  async getSnapshot(input: {
    runId: string;
  }): Promise<{ data: Uint8Array; metadata: SnapshotMetadata } | null> {
    const snapshot = this.snapshots.get(input.runId);
    return snapshot ? cloneValue(snapshot) : null;
  }

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

  async deleteSnapshot(input: { runId: string }): Promise<void> {
    this.snapshots.delete(input.runId);
  }

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

  private nextRunId(): string {
    return `wrun_${createUlid()}`;
  }

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

  private requireRun(input: { runId: string }): WorkflowRun {
    const run = this.runRecords.get(input.runId);
    if (!run) throw notFound({ entity: 'WorkflowRun', id: input.runId });
    return run;
  }

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

  private resolveStepData(input: { step: Step; resolveData?: 'all' | 'none' }) {
    if (input.resolveData !== 'none') return cloneValue(input.step);
    return { ...input.step, input: undefined, output: undefined };
  }

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

  private notifyStream(input: { stream: StreamData }): void {
    for (const wake of input.stream.waiters) wake();
  }

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

function cloneValue<T>(value: T): T {
  return cloneSerializableValue({ value: value as SerializableValue }) as T;
}

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

function notFound(input: { entity: string; id: string }): Error {
  const error = new Error(`${input.entity} \`${input.id}\` was not found.`);
  error.name = `${input.entity}NotFoundError`;
  return error;
}

function getRunId(input: { message: QueuePayload }): string | undefined {
  const message = input.message as Record<string, unknown>;
  return typeof message.runId === 'string' ? message.runId : undefined;
}

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string'
    ? new TextEncoder().encode(value)
    : cloneValue(value);
}

function parseCursor(input: { cursor?: string }): number {
  if (input.cursor === undefined) return 0;
  const cursor = Number(input.cursor);
  return Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
}

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

function compareDates(input: {
  a: Date;
  b: Date;
  sortOrder?: 'asc' | 'desc';
}): number {
  const order = input.sortOrder === 'asc' ? 1 : -1;
  return (input.a.getTime() - input.b.getTime()) * order;
}
