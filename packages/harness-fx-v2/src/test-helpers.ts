import type {
  HarnessV2ToolExecutionValue,
  HarnessV2DriveContext,
  HarnessV2EffectContext,
  HarnessV2EffectOptions,
  HarnessV2EffectOutput,
  HarnessV2FinishReason,
  HarnessV2LogEvent,
  HarnessV2NetworkSandboxSession,
  HarnessV2StreamPart,
  HarnessV2ToolExecutionOutput,
  HarnessV2TurnSettings,
  HarnessV2Usage,
} from '@ai-sdk/harness';
import type { JSONValue, SerializableValue } from '@ai-sdk/provider';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { readFile } from 'node:fs/promises';
import { FX_BUILTIN_TOOLS, isFxBuiltinToolName } from './fx-builtin-tools';
import type { FxModelRuntime } from './fx-model-runtime';

/**
 * A stream part emitted during a test drive, with the effect attempt that
 * emitted it.
 */
export type TestEmittedPart = {
  /**
   * Emitted part.
   */
  part: HarnessV2StreamPart;

  /**
   * ID of the start event of the emitting attempt, or `undefined` for a part
   * emitted outside any attempt.
   */
  startId?: string;
};

/**
 * A recorded `finishStep()` call.
 */
export type TestFinishedStep = {
  /**
   * Step number passed by the adapter.
   */
  stepNumber: number;

  /**
   * Finish reason passed by the adapter.
   */
  finishReason: HarnessV2FinishReason;

  /**
   * Usage passed by the adapter.
   */
  usage: HarnessV2Usage;
};

/**
 * A recorded `finishTurn()` call.
 */
export type TestFinishedTurn = {
  /**
   * Finish reason passed by the adapter.
   */
  finishReason: HarnessV2FinishReason;

  /**
   * Total usage passed by the adapter.
   */
  totalUsage: HarnessV2Usage;
};

/**
 * In-memory drive context for adapter tests, with the state it records.
 */
export type TestDriveContext = {
  /**
   * Drive context to pass to the adapter.
   */
  context: HarnessV2DriveContext;

  /**
   * Log events in log order.
   */
  events: HarnessV2LogEvent[];

  /**
   * Stream parts emitted by the adapter.
   */
  parts: TestEmittedPart[];

  /**
   * `finishStep()` calls of this drive.
   */
  steps: TestFinishedStep[];

  /**
   * `finishTurn()` calls of this drive.
   */
  turns: TestFinishedTurn[];

  /**
   * Aborts the drive's `stopAbortSignal`.
   */
  stopAbortController: AbortController;

  /**
   * Aborts the drive's `yieldAbortSignal`.
   */
  yieldAbortController: AbortController;

  /**
   * Appends a prompt submission and returns its ID.
   */
  submitPrompt(options: {
    /**
     * Prompt text.
     */
    text: string;

    /**
     * Host tools of the turn.
     */
    tools?: HarnessV2TurnSettings['tools'];

    /**
     * Model of the turn.
     */
    model?: string;

    /**
     * Instructions of the turn.
     */
    instructions?: string;
  }): string;

  /**
   * Returns the sandbox session of the drive context.
   */
  getSandboxSession(): Promise<HarnessV2NetworkSandboxSession>;

  /**
   * Creates a new drive context sharing this one's log and sandbox, as a
   * later drive of the same session would see them.
   */
  nextDrive(): TestDriveContext;
};

/**
 * Clones a serializable value, so recorded values cannot be mutated by the
 * adapter.
 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Creates an in-memory drive context that behaves like the agent's for the
 * adapter-facing contract.
 *
 * `effect()` replays terminal outputs by key and reruns retryable
 * interruptions; a key started without an end rejects (recovery is not
 * supported). Once the yield signal aborted, new attempts return a retryable
 * interruption; once the stop signal aborted, they return an interruption
 * retryable for `replay: 'safe'`. Host tools run from `hostTools` and
 * built-in tools from the adapter's `execute`, both as effects. Every
 * `finishStep()` and `finishTurn()` call is recorded, including calls a real
 * agent would treat as replays, and every turn finish appends a
 * `finish-turn` event.
 */
export function createTestDriveContext(
  options: {
    /**
     * Host tool implementations by name.
     */
    hostTools?: Record<string, (input: JSONValue) => JSONValue>;

    /**
     * Log events of earlier drives.
     */
    events?: HarnessV2LogEvent[];

    /**
     * Sandbox session shared with earlier drives.
     */
    sandboxSession?: Promise<HarnessV2NetworkSandboxSession>;
  } = {},
): TestDriveContext {
  const events = options.events ?? [];
  const hostTools = options.hostTools ?? {};
  const parts: TestEmittedPart[] = [];
  const steps: TestFinishedStep[] = [];
  const turns: TestFinishedTurn[] = [];
  const stopAbortController = new AbortController();
  const yieldAbortController = new AbortController();
  let nextId = events.length;
  const createId = (prefix: string) => `${prefix}-${nextId++}`;
  let sandboxSession = options.sandboxSession;
  const getSandboxSession = () => {
    sandboxSession ??= createJustBashNetworkSandboxSession();
    return sandboxSession;
  };

  const latestStart = (key: string) =>
    events.findLast(
      (event): event is Extract<HarnessV2LogEvent, { type: 'effect-start' }> =>
        event.type === 'effect-start' && event.data.key === key,
    );
  const endOf = (startId: string) =>
    events.find(
      (event): event is Extract<HarnessV2LogEvent, { type: 'effect-end' }> =>
        event.type === 'effect-end' && event.data.startId === startId,
    );

  /*
   * Records only `raw` of each built-in tool value: the fx adapter's
   * built-in tool values have no `modelOutput`.
   */
  async function* toRecordedToolValues<T extends JSONValue>({
    values,
  }: {
    values:
      | PromiseLike<HarnessV2ToolExecutionValue<T>>
      | AsyncIterable<HarnessV2ToolExecutionValue<T>>;
  }): AsyncGenerator<SerializableValue> {
    if (Symbol.asyncIterator in values) {
      for await (const value of values) yield { raw: value.raw };
      return;
    }
    yield { raw: (await values).raw };
  }

  async function runCallback<T extends SerializableValue>({
    fn,
    effectContext,
  }: {
    fn: HarnessV2EffectOptions<T>['fn'];
    effectContext: HarnessV2EffectContext;
  }): Promise<T> {
    const result = fn(effectContext);
    if (Symbol.asyncIterator in result) {
      let last: T | undefined;
      for await (const value of result) last = value;
      return last as T;
    }
    return await result;
  }

  async function effect<T extends SerializableValue = SerializableValue>(
    effectOptions: HarnessV2EffectOptions<T>,
  ): Promise<HarnessV2EffectOutput<T>> {
    const previous = latestStart(effectOptions.key);
    const previousOutput =
      previous == null ? undefined : endOf(previous.id)?.data.output;
    if (
      previousOutput != null &&
      !(previousOutput.type === 'interrupted' && previousOutput.retryable)
    ) {
      return clone(previousOutput) as HarnessV2EffectOutput<T>;
    }
    if (stopAbortController.signal.aborted) {
      return {
        type: 'interrupted',
        retryable: effectOptions.replay === 'safe',
      };
    }
    if (previous != null && previousOutput == null) {
      throw new Error('the unfinished attempt requires recovery');
    }
    if (yieldAbortController.signal.aborted) {
      return { type: 'interrupted', retryable: true };
    }

    const startId = createId('start');
    events.push({
      type: 'effect-start',
      id: startId,
      data: {
        key: effectOptions.key,
        attempt: (previous?.data.attempt ?? 0) + 1,
        name: effectOptions.name,
        replay: effectOptions.replay,
        input: clone(effectOptions.input),
        deliveredSubmissionIds: effectOptions.deliveredSubmissionIds?.length
          ? [...effectOptions.deliveredSubmissionIds]
          : [...(previous?.data.deliveredSubmissionIds ?? [])],
      },
    });
    let emitting = true;
    let output: HarnessV2EffectOutput<T>;
    try {
      const value = await runCallback({
        fn: effectOptions.fn,
        effectContext: {
          abortSignal: stopAbortController.signal,
          startId,
          emit: part => {
            if (emitting) parts.push({ part: clone(part), startId });
          },
        },
      });
      output = { type: 'result', value };
    } catch (error) {
      output = {
        type: 'error',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    emitting = false;
    if (stopAbortController.signal.aborted) {
      output = {
        type: 'interrupted',
        retryable: effectOptions.replay === 'safe',
      };
    }
    events.push({
      type: 'effect-end',
      id: createId('end'),
      data: { startId, output: clone(output) as HarnessV2EffectOutput },
    });
    return output;
  }

  const context: HarnessV2DriveContext = {
    log: {
      async read() {
        return { events: clone(events), position: events.length };
      },
      async append(event) {
        events.push(clone(event));
        return true;
      },
      onAppend() {
        return () => {};
      },
    },
    effect,
    async executeHostTool<T extends JSONValue = JSONValue>({
      toolCallId,
      toolName,
      input,
    }: {
      toolCallId: string;
      toolName: string;
      input: JSONValue;
    }): Promise<HarnessV2ToolExecutionOutput<T>> {
      const execute = hostTools[toolName];
      const output = await effect({
        key: `tool:${toolCallId}`,
        name: `tool.${toolName}`,
        replay: 'never',
        input,
        fn: async () => {
          if (execute == null) throw new Error(`unknown tool ${toolName}`);
          return { raw: execute(input) };
        },
      });
      /*
       * Like the agent's own implementation, the recorded value is the host
       * tool's JSON output, whose type the caller asserts with `T`.
       */
      return output as HarnessV2ToolExecutionOutput<T>;
    },
    async executeBuiltinTool<T extends JSONValue = JSONValue>({
      toolCallId,
      toolName,
      input,
      execute,
    }: {
      toolCallId: string;
      toolName: string;
      input: JSONValue;
      execute: (options: {
        abortSignal: AbortSignal;
      }) =>
        | PromiseLike<HarnessV2ToolExecutionValue<T>>
        | AsyncIterable<HarnessV2ToolExecutionValue<T>>;
    }): Promise<HarnessV2ToolExecutionOutput<T>> {
      const output = await effect({
        key: `tool:${toolCallId}`,
        name: `tool.${toolName}`,
        replay: isFxBuiltinToolName(toolName)
          ? (FX_BUILTIN_TOOLS[toolName].replay ?? 'never')
          : 'never',
        input,
        fn: ({ abortSignal }) => {
          if (!isFxBuiltinToolName(toolName)) {
            throw new Error(`unknown built-in tool ${toolName}`);
          }
          return toRecordedToolValues({ values: execute({ abortSignal }) });
        },
      });
      /*
       * Like the agent's own implementation, the recorded values are the
       * values `execute` returned, so the recorded output has the shape the
       * adapter receives.
       */
      return output as HarnessV2ToolExecutionOutput<T>;
    },
    async gateBuiltinTool() {
      throw new Error('gateBuiltinTool is not supported in tests');
    },
    async sandbox() {
      const session = await getSandboxSession();
      return { session, workDir: session.defaultWorkingDirectory };
    },
    async finishStep({ stepNumber, finishReason, usage }) {
      steps.push({ stepNumber, finishReason, usage });
    },
    async finishTurn({ finishReason, totalUsage }) {
      turns.push({ finishReason, totalUsage });
      events.push({
        type: 'finish-turn',
        id: createId('finish-turn'),
        data: { turnId: 'turn', finishReason, totalUsage },
      });
    },
    unsafeEmit(part) {
      parts.push({ part, startId: undefined });
    },
    stopAbortSignal: stopAbortController.signal,
    yieldAbortSignal: yieldAbortController.signal,
  };

  return {
    context,
    events,
    parts,
    steps,
    turns,
    stopAbortController,
    yieldAbortController,
    submitPrompt({ text, tools = [], model, instructions }) {
      const id = createId('submission');
      events.push({
        type: 'submission',
        id,
        data: {
          type: 'prompt',
          message: { role: 'user', content: text },
          settings: { skills: [], tools, model, instructions },
        },
      });
      return id;
    },
    getSandboxSession,
    nextDrive() {
      return createTestDriveContext({
        hostTools,
        events,
        sandboxSession: getSandboxSession(),
      });
    },
  };
}

/**
 * A request the test model runtime received.
 */
export type TestModelRequest = {
  /**
   * Requested URL.
   */
  url: string;

  /**
   * HTTP method.
   */
  method: string;

  /**
   * Request headers.
   */
  headers: Headers;

  /**
   * Request body as text.
   */
  body: string;
};

/**
 * A scripted response of the test model runtime: a string is the body of a
 * successful event stream response, a `Response` is returned as is, and a
 * function creates the response for the request.
 */
export type TestModelResponse =
  | string
  | Response
  | ((request: TestModelRequest) => Response | Promise<Response>);

/**
 * Scripted model access for adapter tests: responses from a queue instead of
 * AI Gateway requests.
 */
export type TestModelRuntime = FxModelRuntime & {
  /**
   * Model requests received, in order.
   */
  requests: TestModelRequest[];

  /**
   * Model catalog requests received, in order.
   */
  catalogRequests: TestModelRequest[];

  /**
   * Appends scripted responses to the queue.
   */
  push(...responses: TestModelResponse[]): void;
};

/**
 * Creates a model runtime that answers each model request with the next
 * scripted response and records the request. A request without a scripted
 * response rejects. Model catalog requests are answered with the given
 * catalog, an empty one by default, without consuming a scripted response.
 */
export function createTestModelRuntime(
  options: {
    /**
     * Scripted responses, in order.
     */
    responses?: TestModelResponse[];

    /**
     * Body of the model catalog response.
     */
    catalog?: string;
  } = {},
): TestModelRuntime {
  const queue = [...(options.responses ?? [])];
  const requests: TestModelRequest[] = [];
  const catalogRequests: TestModelRequest[] = [];
  const catalog = options.catalog ?? '{"object":"list","data":[]}';
  return {
    apiKey: 'test-api-key',
    requests,
    catalogRequests,
    push(...responses) {
      queue.push(...responses);
    },
    // oxlint-disable-next-line ai-sdk/require-object-parameter -- `fetch` signature.
    async fetch(input, init) {
      const request = new Request(input, init);
      const recorded: TestModelRequest = {
        url: request.url,
        method: request.method,
        headers: new Headers(request.headers),
        body: await request.text(),
      };
      if (new URL(recorded.url).pathname === '/coding-agent/v1/models') {
        catalogRequests.push(recorded);
        return new Response(catalog, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      requests.push(recorded);
      const next = queue.shift();
      if (next == null) {
        throw new Error(
          `unexpected request ${recorded.method} ${recorded.url}`,
        );
      }
      if (typeof next === 'string') {
        return new Response(next, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      return typeof next === 'function' ? next(recorded) : next;
    },
  };
}

/**
 * Reads a fixture file from `src/__fixtures__` as text.
 */
export function readFixture(options: {
  /**
   * File name of the fixture.
   */
  name: string;
}): Promise<string> {
  return readFile(
    new URL(`./__fixtures__/${options.name}`, import.meta.url),
    'utf8',
  );
}
