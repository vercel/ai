import type {
  HarnessV2DriveContext,
  HarnessV2EffectContext,
  HarnessV2ToolExecutionValue,
  HarnessV2TurnSettings,
} from '@ai-sdk/harness';
import { extractHarnessPromptContent } from '@ai-sdk/harness/utils';
import type { JSONValue } from '@ai-sdk/provider';
import type { UserModelMessage } from '@ai-sdk/provider-utils';
import {
  createFxEngine,
  type FxEngine,
  type FxEngineTurn,
  type FxNodeEngineOptions,
  type FxPromptInput,
} from 'libfx/node';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createFxBuiltinToolExecutors,
  isFxBuiltinToolName,
  type FxBuiltinToolExecutors,
  type FxBuiltinToolOutput,
} from './fx-builtin-tools';
import { createFxEngineTools } from './fx-engine-tools';
import {
  getFxCatalogEffectKey,
  getFxModelEffectKey,
  readFxLogState,
  type FxCatalogEffectValue,
  type FxCheckpointValue,
  type FxLogState,
  type FxModelEffectInput,
  type FxModelEffectValue,
  type FxPromptSubmission,
  type FxTurnRecord,
} from './fx-log-state';
import { readFxModelResponse } from './fx-model-response';
import {
  DEFAULT_FX_MODEL_ID,
  FX_GATEWAY_ORIGIN,
  type FxModelRuntime,
} from './fx-model-runtime';
import { translateFxStreamPart } from './fx-stream-parts';
import { toFxErrorResult, toFxToolResult } from './fx-tool-results';
import {
  addHarnessUsage,
  createErrorStepSummary,
  createUnknownHarnessUsage,
  toFxTurnFinishReason,
  type FxStepSummary,
} from './fx-usage';

const MODEL_ATTEMPTS = 3;

/*
 * Path of AI Gateway's model catalog, which libfx's core requests for the
 * metadata of the turn's model.
 */
const MODEL_CATALOG_PATH = '/coding-agent/v1/models';

/*
 * libfx accepts a session ID for AI Gateway session affinity only in this
 * shape. Other session IDs are not passed, and libfx generates its own; the
 * session ID is only sent as a header, never in a request body, so this does
 * not affect replay.
 */
const FX_SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,255}$/;

/**
 * Converts a prompt's user message into libfx prompt input: a string for a
 * text-only message, otherwise text and image blocks in their original
 * order. Images must be inline (bytes, base64 or a base64 data URL); other
 * content throws a `HarnessCapabilityUnsupportedError`.
 */
export function toFxPromptInput(options: {
  /**
   * User message of the prompt submission.
   */
  message: UserModelMessage;
}): FxPromptInput {
  const content = extractHarnessPromptContent({ prompt: options.message });
  if (typeof content === 'string') return content;
  return content.map(part =>
    part.type === 'text'
      ? { type: 'text', text: part.text }
      : { type: 'image', data: part.data, mimeType: part.mediaType },
  );
}

/**
 * Waits before retrying a failed model request, resolving early when the
 * signal aborts. The timer keeps the process alive, since the retry is
 * pending work of the drive.
 */
async function waitBeforeRetry(options: {
  /**
   * Time to wait in milliseconds.
   */
  ms: number;

  /**
   * Ends the wait early.
   */
  abortSignal: AbortSignal;
}): Promise<void> {
  const { ms, abortSignal } = options;
  await delay(ms, undefined, { signal: abortSignal }).catch(() => {});
}

/**
 * Returns the message of an unknown thrown value.
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Returns the error libfx's `fetch` rejects with when the drive stopped.
 */
function createAbortError(): DOMException {
  return new DOMException('The drive stopped.', 'AbortError');
}

/**
 * Returns the response libfx is given for a model call that failed or has no
 * recorded response. libfx makes no further attempt after an HTTP 400 and
 * ends its turn, so the failure ends the turn after a single request.
 */
function createRejectedModelResponse(options: {
  /**
   * Error message.
   */
  message: string;
}): Response {
  return new Response(
    JSON.stringify({
      error: { message: options.message, type: 'model_call_failed' },
    }),
    { status: 400, headers: { 'content-type': 'application/json' } },
  );
}

/**
 * Returns the response libfx is given for a recorded model response.
 */
function createModelResponse(options: {
  /**
   * Exact body of the model response.
   */
  body: string;
}): Response {
  return new Response(options.body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/**
 * Reads the body of a request libfx made as text.
 */
async function readRequestBody(init: RequestInit): Promise<string> {
  if (typeof init.body === 'string') return init.body;
  if (init.body == null) return '';
  return new Response(init.body).text();
}

/**
 * Running one turn on one libfx engine.
 */
type FxTurnRun = {
  /**
   * Index of the turn.
   */
  index: number;

  /**
   * `live` runs the turn through the drive context, replaying what the log
   * recorded and running the rest. `offline` rebuilds an ended turn's
   * conversation from the log alone, without any drive context call.
   */
  mode: 'live' | 'offline';

  /**
   * Settings of the turn.
   */
  settings: HarnessV2TurnSettings;

  /**
   * Names of the turn's own tools, which take precedence over built-in
   * tools of the same name.
   */
  hostToolNames: Set<string>;

  /**
   * Position of the next model call within the turn.
   */
  nextOrdinal: number;

  /**
   * Position of the next model catalog request within the turn.
   */
  nextCatalogOrdinal: number;

  /**
   * Summaries of the turn's model calls so far, by position.
   */
  steps: FxStepSummary[];

  /**
   * libfx's turn, while it runs.
   */
  engineTurn?: FxEngineTurn;
};

/**
 * One drive of an fx session: finishes or reruns the latest turn if it is
 * unfinished, then runs a turn for every pending prompt.
 *
 * Every turn runs on a new libfx engine that starts from the conversation
 * after the previous turn: the checkpoint the log recorded after it, or, for
 * turns the agent ended without one, the conversation rebuilt from the log.
 * The effect `turn:${index}` delivers the turn's prompt, every model request
 * is the effect `model:${index}:${ordinal}` holding the exact response
 * body, every model catalog request is the effect
 * `catalog:${index}:${ordinal}` holding the exact response, every tool call
 * goes through `executeBuiltinTool()` or
 * `executeHostTool()`, and the effect `checkpoint:${index}` records the
 * conversation and how the turn finished before `finishTurn()`.
 *
 * A rerun turn replays against its recorded effects: libfx sends
 * byte-identical requests for the same conversation and model catalog, so
 * recorded responses are given back to libfx without network requests and
 * recorded tool calls return their recorded outcomes. A replayed request
 * whose body digest differs from the recorded one fails the drive.
 *
 * The drive halts, without finishing the current turn, when the drive must
 * stop, when an effect reports that the drive is yielding, or when a drive
 * context call rejects. A rejection is rethrown from `run()` once libfx
 * settled.
 */
export class FxDrive {
  /**
   * Host capabilities of this drive.
   */
  private readonly context: HarnessV2DriveContext;

  /**
   * ID of the driven session, forwarded to libfx for AI Gateway session
   * affinity.
   */
  private readonly sessionId: string;

  /**
   * Network access of this drive.
   */
  private readonly runtime: FxModelRuntime;

  /**
   * Session state read from the log, refreshed before each new prompt.
   */
  private state: FxLogState = {
    prompts: [],
    pendingPrompts: [],
    turns: [],
    modelEffects: new Map(),
    catalogOutputs: new Map(),
    toolOutputs: new Map(),
  };

  /**
   * Conversation the next turn starts from, cached once restored: the
   * checkpoint bytes before the turn `beforeTurn`, or none for a new
   * session.
   */
  private base: { beforeTurn: number; data?: Uint8Array } | undefined;

  /**
   * The live turn run, while it runs.
   */
  private liveRun: FxTurnRun | undefined;

  /**
   * Whether the drive halted and must start no more work.
   */
  private halted = false;

  /**
   * First drive context rejection, rethrown from `run()`.
   */
  private driveError: { error: unknown } | undefined;

  /**
   * fx's kernel tools operating on the sandbox of this drive, created on
   * the first built-in tool call.
   */
  private builtinToolExecutors: Promise<FxBuiltinToolExecutors> | undefined;

  /**
   * Creates the drive of a session.
   */
  constructor(options: {
    /**
     * ID of the driven session.
     */
    sessionId: string;

    /**
     * Host capabilities of this drive.
     */
    context: HarnessV2DriveContext;

    /**
     * Network access of this drive.
     */
    runtime: FxModelRuntime;
  }) {
    this.sessionId = options.sessionId;
    this.context = options.context;
    this.runtime = options.runtime;
  }

  /**
   * Runs the drive. Resolves when no work is left, or when the drive halted
   * for a stop or a yield; rejects when a drive context call rejected or
   * libfx failed unexpectedly.
   */
  async run(): Promise<void> {
    const { context } = this;
    if (context.stopAbortSignal.aborted) return;
    const onStop = () => this.halt();
    context.stopAbortSignal.addEventListener('abort', onStop);
    try {
      await this.runTurns();
    } finally {
      context.stopAbortSignal.removeEventListener('abort', onStop);
    }
    if (this.driveError != null) throw this.driveError.error;
  }

  /**
   * Finishes or reruns the latest turn if it is unfinished, then runs a turn
   * for each pending prompt until none is left or the drive halts or yields.
   */
  private async runTurns(): Promise<void> {
    this.state = await this.readState();
    const latest = this.state.turns.at(-1);
    if (latest != null && !latest.ended) {
      if (latest.checkpoint != null) {
        /*
         * The drive that ran this turn recorded its checkpoint but stopped
         * before finishing it, so only the finish is left.
         */
        await this.guard(
          this.context.finishTurn({
            finishReason: latest.checkpoint.finishReason,
            totalUsage: latest.checkpoint.totalUsage,
          }),
        );
      } else if (
        !(await this.runTurn({ index: latest.index, prompt: latest.prompt }))
      ) {
        return;
      }
    }
    for (;;) {
      if (this.halted || this.context.yieldAbortSignal.aborted) return;
      this.state = await this.readState();
      const prompt = this.state.pendingPrompts[0];
      if (prompt == null) return;
      if (!(await this.runTurn({ index: this.state.turns.length, prompt }))) {
        return;
      }
    }
  }

  /**
   * Reads the session state from the log.
   */
  private async readState(): Promise<FxLogState> {
    const { events } = await this.context.log.read();
    return readFxLogState({ events });
  }

  /**
   * Runs one turn live: delivers its prompt, runs libfx's turn on an engine
   * restored from the previous turn, finishes its last step, records the
   * checkpoint and finishes the turn. Returns `false` without finishing the
   * turn when the drive halted.
   */
  private async runTurn(options: {
    /**
     * Index of the turn.
     */
    index: number;

    /**
     * Prompt that starts the turn.
     */
    prompt: FxPromptSubmission;
  }): Promise<boolean> {
    const { index, prompt } = options;
    const delivery = await this.guard(
      this.context.effect({
        key: `turn:${index}`,
        name: 'turn',
        replay: 'safe',
        input: { submissionId: prompt.id },
        deliveredSubmissionIds: [prompt.id],
        fn: async () => null,
      }),
    );
    if (delivery.type === 'interrupted') {
      this.halt();
      return false;
    }
    if (delivery.type === 'error') throw new Error(delivery.error.message);

    const base = await this.restoreBase({ beforeTurn: index });
    const run = this.createRun({
      index,
      mode: 'live',
      settings: prompt.settings,
    });
    this.liveRun = run;
    const engine = await this.createEngine({ run, base });
    try {
      const stopReason = await this.promptEngine({ run, engine, prompt });
      if (stopReason == null) return false;

      const lastStepNumber = run.steps.length - 1;
      if (lastStepNumber >= 0) {
        await this.finishStep({ run, stepNumber: lastStepNumber });
      }
      if (this.halted) return false;
      const finishReason = toFxTurnFinishReason({
        stopReason,
        lastStep: run.steps.at(-1),
      });
      const totalUsage = run.steps.reduce(
        (usage, step) => addHarnessUsage({ left: usage, right: step.usage }),
        createUnknownHarnessUsage(),
      );
      const data = await engine.checkpoint();
      const checkpoint = await this.guard(
        this.context.effect<FxCheckpointValue>({
          key: `checkpoint:${index}`,
          name: 'checkpoint',
          replay: 'safe',
          input: null,
          fn: async () => ({ data, finishReason, totalUsage }),
        }),
      );
      if (checkpoint.type === 'interrupted') {
        this.halt();
        return false;
      }
      if (checkpoint.type === 'error') {
        throw new Error(checkpoint.error.message);
      }
      await this.guard(
        this.context.finishTurn({
          finishReason: checkpoint.value.finishReason,
          totalUsage: checkpoint.value.totalUsage,
        }),
      );
      this.base = { beforeTurn: index + 1, data };
      return true;
    } finally {
      this.liveRun = undefined;
      await engine.close();
    }
  }

  /**
   * Returns the conversation a turn starts from: the latest checkpoint the
   * log recorded before the turn, with the turns after it that the agent
   * ended without a checkpoint rebuilt offline on top. `undefined` means a
   * new conversation.
   */
  private async restoreBase(options: {
    /**
     * Index of the turn about to run.
     */
    beforeTurn: number;
  }): Promise<Uint8Array | undefined> {
    const { beforeTurn } = options;
    if (this.base?.beforeTurn === beforeTurn) return this.base.data;
    const turns = this.state.turns.slice(0, beforeTurn);
    let data: Uint8Array | undefined;
    let start = 0;
    for (let index = turns.length - 1; index >= 0; index--) {
      const checkpoint = turns[index].checkpoint;
      if (checkpoint != null) {
        data = checkpoint.data;
        start = index + 1;
        break;
      }
    }
    for (const turn of turns.slice(start)) {
      data = await this.replayTurnOffline({ turn, base: data });
    }
    this.base = { beforeTurn, data };
    return data;
  }

  /**
   * Rebuilds the conversation after an ended turn that has no checkpoint,
   * e.g. a turn the agent ended after a failed drive.
   *
   * libfx runs the turn again with only what the log recorded: recorded
   * model responses and tool outcomes are given back to it, and a model call
   * without a recorded response (or with a different request) is rejected,
   * which ends the turn there. Nothing is recorded or emitted.
   */
  private async replayTurnOffline(options: {
    /**
     * Turn to rebuild.
     */
    turn: FxTurnRecord;

    /**
     * Conversation before the turn.
     */
    base?: Uint8Array;
  }): Promise<Uint8Array> {
    const { turn, base } = options;
    const run = this.createRun({
      index: turn.index,
      mode: 'offline',
      settings: turn.prompt.settings,
    });
    const engine = await this.createEngine({ run, base });
    try {
      await this.promptEngine({ run, engine, prompt: turn.prompt });
      return await engine.checkpoint();
    } finally {
      await engine.close();
    }
  }

  /**
   * Creates the state of running one turn.
   */
  private createRun(options: {
    /**
     * Index of the turn.
     */
    index: number;

    /**
     * How the turn runs.
     */
    mode: FxTurnRun['mode'];

    /**
     * Settings of the turn.
     */
    settings: HarnessV2TurnSettings;
  }): FxTurnRun {
    const { index, mode, settings } = options;
    return {
      index,
      mode,
      settings,
      hostToolNames: new Set(settings.tools.map(spec => spec.name)),
      nextOrdinal: 0,
      nextCatalogOrdinal: 0,
      steps: [],
    };
  }

  /**
   * Creates the libfx engine of a turn, with the turn's model, instructions
   * and tools, starting from the given conversation.
   */
  private createEngine(options: {
    /**
     * Turn the engine runs.
     */
    run: FxTurnRun;

    /**
     * Conversation to start from, or none for a new conversation.
     */
    base?: Uint8Array;
  }): Promise<FxEngine> {
    const { run, base } = options;
    const engineOptions: FxNodeEngineOptions = {
      apiKey: this.runtime.apiKey,
      model: run.settings.model ?? DEFAULT_FX_MODEL_ID,
      tools: createFxEngineTools({
        settings: run.settings,
        execute: call => this.executeTool({ run, ...call }),
      }),
      fetch: this.createEngineFetch({ run }),
    };
    if (run.settings.instructions != null) {
      engineOptions.instructions = run.settings.instructions;
    }
    if (FX_SESSION_ID_PATTERN.test(this.sessionId)) {
      engineOptions.sessionId = this.sessionId;
    }
    if (base != null) engineOptions.checkpoint = base;
    return createFxEngine(engineOptions);
  }

  /**
   * Runs libfx's turn for a prompt and returns libfx's stop reason, or
   * `undefined` when a live drive halted. Rethrows a drive context
   * rejection, and libfx failures that are not the result of halting.
   */
  private async promptEngine(options: {
    /**
     * Turn being run.
     */
    run: FxTurnRun;

    /**
     * Engine of the turn.
     */
    engine: FxEngine;

    /**
     * Prompt of the turn.
     */
    prompt: FxPromptSubmission;
  }): Promise<string | undefined> {
    const { run, engine, prompt } = options;
    const live = run.mode === 'live';
    const turn = engine.prompt(toFxPromptInput({ message: prompt.message }));
    run.engineTurn = turn;
    if (live && this.halted) turn.cancel();
    let stopReason: string;
    try {
      for await (const event of turn) void event;
      stopReason = (await turn.result).stopReason;
    } catch (error) {
      if (this.driveError != null) throw this.driveError.error;
      if (live && this.halted) return undefined;
      throw error;
    } finally {
      run.engineTurn = undefined;
    }
    if (this.driveError != null) throw this.driveError.error;
    if (live && this.halted) return undefined;
    return stopReason;
  }

  /**
   * Creates the `fetch` libfx uses for a turn.
   *
   * Model requests (POST to AI Gateway's `/ai/language-model`) are numbered
   * within the turn. A live run first finishes the previous step, then runs
   * the request as the effect `model:${index}:${ordinal}` and gives libfx
   * the recorded response body only once the effect committed; a failed
   * effect is answered with a rejection that ends libfx's turn, and an
   * interrupted one halts the drive. A request whose body differs from the
   * recorded one fails the drive. Model catalog requests are recorded the
   * same way by `fetchModelCatalog()`, since the catalog's model metadata
   * shapes later model requests. An offline run answers from the log
   * alone. Every other request goes to the network unrecorded.
   */
  private createEngineFetch(options: {
    /**
     * Turn being run.
     */
    run: FxTurnRun;
  }): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
    const { run } = options;
    return async (input, init = {}) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = (
        init.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      if (
        method === 'GET' &&
        url.origin === FX_GATEWAY_ORIGIN &&
        url.pathname === MODEL_CATALOG_PATH
      ) {
        return this.fetchModelCatalog({ run, input, init });
      }
      if (
        method !== 'POST' ||
        url.origin !== FX_GATEWAY_ORIGIN ||
        !url.pathname.endsWith('/ai/language-model')
      ) {
        return this.runtime.fetch(input, init);
      }

      const ordinal = run.nextOrdinal++;
      const body = await readRequestBody(init);
      const digest = createHash('sha256').update(body).digest('hex');
      const key = getFxModelEffectKey({ turnIndex: run.index, ordinal });
      const recorded = this.state.modelEffects.get(key);
      const matches = recorded == null || recorded.input.digest === digest;

      if (run.mode === 'offline') {
        if (matches && recorded?.output?.type === 'result') {
          const {
            body: responseBody,
            finishReason,
            usage,
          } = recorded.output.value;
          run.steps.push({ finishReason, usage });
          return createModelResponse({ body: responseBody });
        }
        run.steps.push(createErrorStepSummary());
        return createRejectedModelResponse({
          message: 'The model call has no recorded response.',
        });
      }

      if (this.halted) throw createAbortError();
      if (ordinal > 0) await this.finishStep({ run, stepNumber: ordinal - 1 });
      if (this.halted) throw createAbortError();
      if (!matches) {
        const error = new Error(
          `fx harness: the model call ${key} replayed with a different request than it recorded.`,
        );
        this.halt({ error });
        throw error;
      }
      const effectInput: FxModelEffectInput = { digest };
      const model = new Headers(init.headers).get('ai-language-model-id');
      if (model != null) effectInput.model = model;
      const output = await this.guard(
        this.context.effect<FxModelEffectValue>({
          key,
          name: 'model',
          replay: 'safe',
          input: effectInput,
          fn: effectContext =>
            this.callModel({ run, input, init, body, effectContext }),
        }),
      );
      switch (output.type) {
        case 'result': {
          const { finishReason, usage } = output.value;
          run.steps.push({ finishReason, usage });
          return createModelResponse({ body: output.value.body });
        }
        case 'error':
          run.steps.push(createErrorStepSummary());
          return createRejectedModelResponse({
            message: output.error.message,
          });
        case 'interrupted':
          this.halt();
          throw createAbortError();
      }
    };
  }

  /**
   * Answers one of libfx's model catalog requests with a recorded response.
   *
   * A live run performs the request as the effect
   * `catalog:${index}:${ordinal}`, recording the response's status and
   * body; a failed effect is answered with an HTTP 502 response, which
   * libfx treats as an unavailable catalog, and an interrupted one halts the
   * drive. An offline run answers from the log alone, with an HTTP 502
   * response when nothing was recorded.
   */
  private async fetchModelCatalog(options: {
    /**
     * Turn being run.
     */
    run: FxTurnRun;

    /**
     * URL libfx requested.
     */
    input: string | URL | Request;

    /**
     * Request options libfx passed.
     */
    init: RequestInit;
  }): Promise<Response> {
    const { run, input, init } = options;
    const key = getFxCatalogEffectKey({
      turnIndex: run.index,
      ordinal: run.nextCatalogOrdinal++,
    });
    const toResponse = (value: FxCatalogEffectValue) =>
      new Response(value.body, {
        status: value.status,
        headers: { 'content-type': 'application/json' },
      });
    const unavailable = () =>
      new Response('', { status: 502, statusText: 'Bad Gateway' });

    if (run.mode === 'offline') {
      const recorded = this.state.catalogOutputs.get(key);
      return recorded?.type === 'result'
        ? toResponse(recorded.value)
        : unavailable();
    }
    if (this.halted) throw createAbortError();
    const output = await this.guard(
      this.context.effect<FxCatalogEffectValue>({
        key,
        name: 'model-catalog',
        replay: 'safe',
        input: null,
        fn: async ({ abortSignal }) => {
          const response = await this.runtime.fetch(input, {
            ...init,
            signal: abortSignal,
          });
          return { status: response.status, body: await response.text() };
        },
      }),
    );
    switch (output.type) {
      case 'result':
        return toResponse(output.value);
      case 'error':
        return unavailable();
      case 'interrupted':
        this.halt();
        throw createAbortError();
    }
  }

  /**
   * Runs a new attempt of a model call effect: up to three requests,
   * retrying after a growing delay when a request throws, gets HTTP 429 or
   * 5xx, or its response breaks off or ends without a `finish` part. Other
   * HTTP errors fail at once.
   *
   * Each response's parts are emitted as they arrive, with a `reset-step`
   * part before a retry that follows emitted parts. When every request
   * failed, an `error` part is emitted and the attempt fails with the last
   * error.
   */
  private async callModel(options: {
    /**
     * Turn of the model call.
     */
    run: FxTurnRun;

    /**
     * URL libfx requested.
     */
    input: string | URL | Request;

    /**
     * Request options libfx passed.
     */
    init: RequestInit;

    /**
     * Exact request body.
     */
    body: string;

    /**
     * Context of the effect attempt.
     */
    effectContext: HarnessV2EffectContext;
  }): Promise<FxModelEffectValue> {
    const { run, input, init, body, effectContext } = options;
    const signal = effectContext.abortSignal;
    let errorMessage = 'The model call failed.';
    let emitted = false;

    for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt++) {
      if (emitted) {
        effectContext.emit({ type: 'reset-step' });
        emitted = false;
      }
      let retryable = true;
      try {
        const response = await this.runtime.fetch(input, {
          method: 'POST',
          headers: init.headers,
          body,
          signal,
        });
        if (response.ok) {
          const read = await readFxModelResponse({
            response,
            onPart: part => {
              for (const translated of translateFxStreamPart({
                part,
                isBuiltinTool: toolName =>
                  this.isBuiltinTool({ run, toolName }),
              })) {
                effectContext.emit(translated);
                emitted = true;
              }
            },
          });
          if (read.summary != null) {
            return { body: read.body, ...read.summary };
          }
          errorMessage = 'The model response ended before it finished.';
        } else {
          const text = await response.text().catch(() => '');
          errorMessage = `AI Gateway request failed with HTTP ${response.status}${text ? `: ${text.slice(0, 1000)}` : ''}`;
          retryable = response.status === 429 || response.status >= 500;
        }
      } catch (error) {
        if (signal.aborted) throw error;
        errorMessage = getErrorMessage(error);
      }
      if (!retryable || attempt === MODEL_ATTEMPTS) break;
      await waitBeforeRetry({ ms: 500 * attempt, abortSignal: signal });
      if (signal.aborted) throw new Error('The model call was aborted.');
    }

    effectContext.emit({ type: 'error', error: { message: errorMessage } });
    throw new Error(errorMessage);
  }

  /**
   * Runs one tool call for libfx and returns what the libfx tool returns.
   *
   * A live run executes the call through `executeBuiltinTool()` or
   * `executeHostTool()`, which replay recorded calls; an interrupted call
   * halts the drive when the drive is stopping or yielding. An offline run
   * returns the call's recorded outcome. Outcomes other than results become
   * error results.
   */
  private async executeTool(options: {
    /**
     * Turn of the call.
     */
    run: FxTurnRun;

    /**
     * Name of the called tool.
     */
    toolName: string;

    /**
     * Whether the tool is one of the harness's built-in tools.
     */
    builtin: boolean;

    /**
     * Tool input, parsed from the model's JSON by libfx.
     */
    input: unknown;

    /**
     * libfx's ID of the call, which is the model's tool call ID.
     */
    executionId: string;
  }): Promise<unknown> {
    const { run, toolName, builtin, input, executionId } = options;
    if (run.mode === 'offline') {
      return toFxToolResult({
        output: this.state.toolOutputs.get(executionId),
        toolName,
        builtin,
      });
    }
    if (this.halted) {
      return toFxErrorResult({
        text: 'The drive stopped before this call ran.',
      });
    }

    /*
     * libfx parses tool input from the model's JSON before calling a tool,
     * so the input is a JSON value.
     */
    const jsonInput = input as JSONValue;
    const output = await this.guard(
      builtin
        ? this.context.executeBuiltinTool({
            toolCallId: executionId,
            toolName,
            input: jsonInput,
            execute: ({ abortSignal }) =>
              this.runBuiltinTool({
                toolName,
                toolCallId: executionId,
                input,
                abortSignal,
              }),
          })
        : this.context.executeHostTool({
            toolCallId: executionId,
            toolName,
            input: jsonInput,
          }),
    );
    if (
      output.type === 'interrupted' &&
      (this.context.stopAbortSignal.aborted ||
        this.context.yieldAbortSignal.aborted)
    ) {
      this.halt();
    }
    return toFxToolResult({ output, toolName, builtin });
  }

  /**
   * Runs a built-in tool on the drive's sandbox for a new attempt of its
   * effect.
   */
  private async runBuiltinTool(options: {
    /**
     * Name of the built-in tool.
     */
    toolName: string;

    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Tool input given by the model.
     */
    input: unknown;

    /**
     * Aborts the tool when its attempt is cancelled.
     */
    abortSignal: AbortSignal;
  }): Promise<HarnessV2ToolExecutionValue> {
    const { toolName, toolCallId, input, abortSignal } = options;
    if (!isFxBuiltinToolName(toolName)) {
      throw new Error(`fx harness: ${toolName} is not a built-in tool.`);
    }
    let output: FxBuiltinToolOutput;
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      output = {
        text: `${toolName} arguments must be an object`,
        isError: true,
      };
    } else {
      const executors = await this.getBuiltinToolExecutors();
      /*
       * The input's shape is only checked by the executors, which validate
       * the fields they read, so it is passed with the type the executor
       * declares.
       */
      const execute = executors[toolName] as (options: {
        toolCallId: string;
        input: unknown;
        abortSignal: AbortSignal;
      }) => Promise<FxBuiltinToolOutput>;
      output = await execute({ toolCallId, input, abortSignal });
    }
    return { raw: output as JSONValue };
  }

  /**
   * Resolves the drive's sandbox and the sandbox user's home directory, and
   * creates fx's kernel tools on them, once per drive.
   */
  private getBuiltinToolExecutors(): Promise<FxBuiltinToolExecutors> {
    this.builtinToolExecutors ??= (async () => {
      const { session, workDir } = await this.context.sandbox();
      const result = await session.run({ command: 'printf %s "$HOME"' });
      const home = result.stdout.trim();
      return createFxBuiltinToolExecutors({
        sandbox: {
          session,
          workDir,
          home: result.exitCode === 0 && home.length > 0 ? home : workDir,
        },
      });
    })();
    return this.builtinToolExecutors;
  }

  /**
   * Returns whether a tool name refers to one of fx's kernel tools in a
   * turn, i.e. one that no tool of the turn overrides.
   */
  private isBuiltinTool(options: {
    /**
     * Turn of the call.
     */
    run: FxTurnRun;

    /**
     * Name of the tool.
     */
    toolName: string;
  }): boolean {
    const { run, toolName } = options;
    return isFxBuiltinToolName(toolName) && !run.hostToolNames.has(toolName);
  }

  /**
   * Finishes a step of a live turn with its model call's summary. Replayed
   * steps record nothing new.
   */
  private async finishStep(options: {
    /**
     * Turn of the step.
     */
    run: FxTurnRun;

    /**
     * Zero-based number of the step within the turn.
     */
    stepNumber: number;
  }): Promise<void> {
    const { run, stepNumber } = options;
    const step = run.steps[stepNumber] ?? createErrorStepSummary();
    await this.guard(
      this.context.finishStep({
        stepNumber,
        finishReason: step.finishReason,
        usage: step.usage,
      }),
    );
  }

  /**
   * Stops the drive: the live libfx turn is cancelled and no further work
   * starts. The first error passed is rethrown from `run()`.
   */
  private halt(options: { error?: unknown } = {}): void {
    if (options.error !== undefined && this.driveError == null) {
      this.driveError = { error: options.error };
    }
    this.halted = true;
    this.liveRun?.engineTurn?.cancel();
  }

  /**
   * Awaits a drive context call, halting the drive when it rejects.
   */
  private async guard<T>(promise: PromiseLike<T>): Promise<T> {
    try {
      return await promise;
    } catch (error) {
      this.halt({ error });
      throw error;
    }
  }
}
