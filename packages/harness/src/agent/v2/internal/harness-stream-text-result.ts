import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import {
  DelayedPromise,
  getErrorMessage,
  type Context,
  type InferToolSetContext,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import {
  createUIMessageStreamResponse,
  NoOutputGeneratedError,
  toUIMessageStream as toUIMessageStreamHelper,
  type AsyncIterableStream,
  type ContentPart,
  type FinishReason,
  type InferUIMessageChunk,
  type LanguageModelUsage,
  type OutputInterface as Output,
  type ProviderMetadata,
  type StepResult,
  type StreamTextResult,
  type TextStreamPart,
  type UIMessage,
  type UIMessageChunk,
  type UIMessageStreamOptions,
} from 'ai';
import {
  addLanguageModelUsage,
  asLanguageModelUsage,
  createAsyncIterableStream,
  createNullLanguageModelUsage,
  DefaultStepResult,
} from 'ai/internal';
import { HarnessEffectError } from '../../../errors/harness-effect-error';
import { HarnessAfterFinishError, HarnessBeforeStartError } from './errors';
import { getReasoningOutput } from './harness-generate-text-result';
import {
  translateStreamPart,
  type TranslatedToolCall,
} from './translate-stream-part';
import type {
  HarnessAgentStreamPart,
  HarnessAgentStreamPartRecord,
} from './create-stream-writer';

/**
 * Kind of the `custom` part that marks, in the stream feeding
 * `toUIMessageStream()`, where the UI message stream gets a `reset-step`
 * chunk.
 */
const RESET_STEP_KIND = 'harness.reset-step';

/**
 * How the turn read by a `HarnessStreamTextResult` ended.
 */
export type HarnessStreamTextResultTurnEnd = {
  /**
   * How the turn ended for this result (see `pump`).
   */
  reason: 'finished' | 'yielded' | 'incomplete' | 'aborted' | 'failed';

  /**
   * First error of the turn: an `error` part, or the failure that ended it.
   */
  error?: unknown;
};

/**
 * Text content of the current step, collected from its deltas.
 */
type CollectedTextContent = {
  /**
   * Content type.
   */
  type: 'text';

  /**
   * Text collected so far.
   */
  text: string;

  /**
   * Provider metadata of the latest part that carried any.
   */
  providerMetadata?: ProviderMetadata;
};

/**
 * Reasoning content of the current step, collected from its deltas.
 */
type CollectedReasoningContent = {
  /**
   * Content type.
   */
  type: 'reasoning';

  /**
   * Reasoning text collected so far.
   */
  text: string;

  /**
   * Provider metadata of the latest part that carried any.
   */
  providerMetadata?: ProviderMetadata;
};

/*
 * TODO: Replace `HarnessStreamEntry`, `StepPart` and `RESET_STEP_KIND` with a
 * reset that `ai`'s `toUIMessageStream()` understands natively. Today
 * `TextStreamPart` has no variant that maps to the UI `reset-step` chunk, so
 * a retraction travels through the helper as a `custom` marker that is
 * converted afterwards, followed by the step's surviving parts, all tagged
 * `uiOnly` so `fullStream` stays free of them. This also means the messages
 * that the helper builds for `onEnd` and `onStepEnd` still contain retracted
 * parts. The more ideal change in `ai`:
 * - add a `reset-step` (or more targeted retraction) `TextStreamPart` that
 *   `toUIMessageStream()` maps to the UI `reset-step` chunk and applies in the
 *   message it builds for its callbacks;
 * - ideally let it retract individual parts of the current step (e.g. by
 *   part ID), so surviving parts do not need to be sent again.
 * Then this result could emit the reset into its regular stream and drop the
 * UI-only entries.
 */
/**
 * Entry of the result's internal stream.
 */
type HarnessStreamEntry<TOOLS extends ToolSet> = {
  /**
   * Translated part.
   */
  part: TextStreamPart<TOOLS>;

  /**
   * Whether the part is only for `toUIMessageStream()`: the reset marker and
   * the surviving parts it is followed by after a retraction.
   */
  uiOnly?: true;
};

/**
 * Translated part of the current step and the effect attempt that produced
 * it.
 */
type StepPart<TOOLS extends ToolSet> = {
  /**
   * Translated part.
   */
  part: TextStreamPart<TOOLS>;

  /**
   * Effect attempt that emitted the part, if any.
   */
  startId?: string;
};

/**
 * Minimal `StreamTextResult` over one turn of a HarnessV2 session, read from the
 * session's stream.
 *
 * The turn's parts are read in the background as soon as the result is
 * created, so promises such as `text` settle whether or not `fullStream` is
 * read. Parts are translated to AI SDK stream parts; `start-step` is inserted
 * before a step's first part, `finish-step` builds the step's `StepResult`,
 * and `reset-step` discards the step's collected content. When the turn did
 * not finish, an `error` part (failed or incomplete turn) or an `abort` part
 * (the call's own abort signal) is added before closing. A turn whose drive
 * yielded ends without either.
 *
 * Records are tagged with the effect attempt that produced them (`startId`)
 * and, for boundary parts, their log key (`key`). A record whose key this
 * result already received is dropped. A `retract` part retracts the output
 * of the listed attempts: their later records are dropped, and if the current
 * step contains parts of them, the step's collected content is rebuilt from
 * the surviving parts, so `steps` and `text` exclude retracted output. The
 * UI message stream then gets a `reset-step` chunk followed by the surviving
 * parts again. `fullStream` cannot retract parts it already delivered, and
 * the messages passed to `toUIMessageStream()`'s `onEnd` and `onStepEnd`
 * callbacks, which the AI SDK builds before the reset is applied, still
 * contain retracted parts and a `custom` part.
 *
 * Except after an abort, the result closes only once `records` ended, which
 * for a `stream()` call happens only after the drive ended, so the session
 * accepts the next prompt as soon as the result is done.
 *
 * Promises settle once the result closed. Without any finished step,
 * they reject with `NoOutputGeneratedError`. `responseMessages`, structured
 * output and the Node.js response helpers are not implemented yet.
 */
export class HarnessStreamTextResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> implements StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  /**
   * Resolves with how the turn ended, once its stream ended. Engine-internal,
   * used by `generate()`.
   */
  readonly turnEnd: Promise<HarnessStreamTextResultTurnEnd>;

  private readonly tools: TOOLS;
  private readonly providerName: string;
  private readonly callId: string;
  private modelId: string;
  private baseStream: ReadableStream<HarnessStreamEntry<TOOLS>>;
  private readonly controller: ReadableStreamDefaultController<
    HarnessStreamEntry<TOOLS>
  >;

  private readonly _steps = new DelayedPromise<
    Array<StepResult<TOOLS, RUNTIME_CONTEXT>>
  >();
  private readonly _finishReason = new DelayedPromise<FinishReason>();
  private readonly _rawFinishReason = new DelayedPromise<string | undefined>();
  private readonly _totalUsage = new DelayedPromise<LanguageModelUsage>();

  private readonly steps_: Array<StepResult<TOOLS, RUNTIME_CONTEXT>> = [];
  private readonly translatedToolCalls = new Map<string, TranslatedToolCall>();
  private stepContent: Array<ContentPart<TOOLS>> = [];
  private stepTextContent = new Map<string, CollectedTextContent>();
  private stepReasoningContent = new Map<string, CollectedReasoningContent>();
  private stepParts: Array<StepPart<TOOLS>> = [];
  private readonly seenKeys = new Set<string>();
  private readonly retractedStartIds = new Set<string>();
  private stepStarted = false;
  private yielded = false;
  private firstError: unknown;
  private finish:
    | {
        finishReason: FinishReason;
        rawFinishReason?: string;
        totalUsage: LanguageModelUsage;
      }
    | undefined;

  /**
   * Starts reading the turn's parts.
   */
  constructor(options: {
    /**
     * Records of the turn, read from the session's stream.
     */
    records: ReadableStream<HarnessAgentStreamPartRecord>;

    /**
     * The call's abort signal, which ends `records` early.
     */
    abortSignal?: AbortSignal;

    /**
     * The agent's tools, used to type tool calls and for UI message streams.
     */
    tools: TOOLS;

    /**
     * Identifier of the harness adapter, part of the reported provider.
     */
    harnessId: string;

    /**
     * Identifier of the call, used for step and response IDs.
     */
    callId: string;
  }) {
    this.tools = options.tools;
    this.providerName = `harness:${options.harnessId}`;
    this.modelId = options.harnessId;
    this.callId = options.callId;

    let controller!: ReadableStreamDefaultController<HarnessStreamEntry<TOOLS>>;
    this.baseStream = new ReadableStream<HarnessStreamEntry<TOOLS>>({
      start(streamController) {
        controller = streamController;
      },
    });
    this.controller = controller;
    this.turnEnd = this.pump({
      records: options.records,
      abortSignal: options.abortSignal,
    });
  }

  /**
   * Enqueues a translated part to the result's internal stream.
   */
  private enqueue(options: {
    /**
     * Translated part.
     */
    part: TextStreamPart<TOOLS>;

    /**
     * Whether the part is only for `toUIMessageStream()`.
     */
    uiOnly?: true;
  }): void {
    this.controller.enqueue(options);
  }

  /**
   * Reads the turn's records, forwards their parts translated, and settles the
   * result's promises once the parts ended.
   *
   * How the turn ended:
   * - `aborted` if the call's abort signal fired; an `abort` part is added.
   * - `finished` if a `finish` part was read.
   * - `yielded` if a `yield` part was read: the drive ran out of time and the
   *   turn continues in a later drive.
   * - `failed` if reading the records failed; an `error` part is added. If the
   *   drive failed before its turn started or after it finished, there was
   *   no turn to report the error in, and the part carries the original
   *   error (the `cause` of the `HarnessBeforeStartError` or
   *   `HarnessAfterFinishError`). Any other failure is wrapped in a
   *   `HarnessEffectError` with its message.
   * - `incomplete` if the records ended without any of the above; an `error`
   *   part is added.
   *
   * Records with an already received key and records of retracted attempts
   * are dropped. Parts after a `finish` or `yield` part are dropped, but
   * still read until `records` ends, so the result closes only once the
   * drive ended.
   */
  private async pump(options: {
    /**
     * Records of the turn.
     */
    records: ReadableStream<HarnessAgentStreamPartRecord>;

    /**
     * The call's abort signal.
     */
    abortSignal?: AbortSignal;
  }): Promise<HarnessStreamTextResultTurnEnd> {
    const { records, abortSignal } = options;
    const reader = records.getReader();
    let readError: unknown;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.key != null) {
          if (this.seenKeys.has(value.key)) continue;
          this.seenKeys.add(value.key);
        }
        if (
          value.startId != null &&
          this.retractedStartIds.has(value.startId)
        ) {
          continue;
        }
        if (this.finish == null && !this.yielded) {
          await this.handlePart({ part: value.part, startId: value.startId });
        }
      }
    } catch (error) {
      readError = error;
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    let reason: HarnessStreamTextResultTurnEnd['reason'];
    let failure: unknown;
    if (abortSignal?.aborted) {
      reason = 'aborted';
    } else if (this.finish != null) {
      reason = 'finished';
    } else if (this.yielded) {
      reason = 'yielded';
    } else if (readError != null) {
      reason = 'failed';
      failure =
        HarnessBeforeStartError.isInstance(readError) ||
        HarnessAfterFinishError.isInstance(readError)
          ? readError.cause
          : new HarnessEffectError({ message: getErrorMessage(readError) });
    } else {
      reason = 'incomplete';
      failure = new HarnessEffectError({
        message: 'HarnessAgent: the drive ended before the turn finished.',
      });
    }

    if (failure != null) {
      this.firstError ??= failure;
      this.enqueue({ part: { type: 'error', error: failure } });
    } else if (reason === 'aborted') {
      this.enqueue({ part: { type: 'abort' } });
    }
    this.controller.close();

    this.settle();
    return { reason, error: this.firstError };
  }

  /**
   * Handles one part of the turn.
   */
  private async handlePart(options: {
    /**
     * Engine stream part of the turn.
     */
    part: HarnessAgentStreamPart;

    /**
     * Effect attempt that emitted the part, if any.
     */
    startId?: string;
  }): Promise<void> {
    const { part, startId } = options;
    switch (part.type) {
      case 'stream-start':
        if (part.modelId != null) this.modelId = part.modelId;
        return;

      case 'reset-step':
        this.resetStepContent();
        this.stepParts = [];
        return;

      case 'yield':
        this.yielded = true;
        return;

      case 'retract':
        this.retract({ startIds: part.startIds });
        return;

      case 'finish-step':
        this.finishStep({ part });
        return;

      case 'finish': {
        const totalUsage = asLanguageModelUsage(
          part.totalUsage as LanguageModelV4Usage,
        );
        this.finish = {
          finishReason: part.finishReason.unified,
          rawFinishReason: part.finishReason.raw,
          totalUsage,
        };
        this.enqueue({
          part: {
            type: 'finish',
            finishReason: part.finishReason.unified,
            rawFinishReason: part.finishReason.raw,
            totalUsage,
          },
        });
        return;
      }
    }

    const translated = await translateStreamPart({
      part,
      tools: this.tools,
      toolCalls: this.translatedToolCalls,
    });
    for (const translatedPart of translated) {
      if (translatedPart.type === 'error') {
        this.firstError ??= translatedPart.error;
      } else if (
        translatedPart.type !== 'start' &&
        translatedPart.type !== 'raw'
      ) {
        this.startStep();
        this.stepParts.push({ part: translatedPart, startId });
      }
      this.enqueue({ part: translatedPart });
      this.collectContent({ part: translatedPart });
    }
  }

  /**
   * Retracts the output of the given effect attempts. Their later records
   * are dropped. If the current step contains parts of them, its collected
   * content is rebuilt from the surviving parts, and the UI message stream
   * gets the reset marker followed by the surviving parts again. Parts of
   * finished steps are not affected.
   */
  private retract(options: {
    /**
     * Start IDs of the attempts whose output is retracted.
     */
    startIds: readonly string[];
  }): void {
    for (const startId of options.startIds) {
      this.retractedStartIds.add(startId);
    }
    const surviving = this.stepParts.filter(
      stepPart =>
        stepPart.startId == null ||
        !this.retractedStartIds.has(stepPart.startId),
    );
    if (surviving.length === this.stepParts.length) return;

    this.stepParts = surviving;
    this.resetStepContent();
    this.enqueue({
      part: { type: 'custom', kind: RESET_STEP_KIND },
      uiOnly: true,
    });
    for (const { part } of surviving) {
      this.enqueue({ part, uiOnly: true });
      this.collectContent({ part });
    }
  }

  /**
   * Enqueues `start-step` before the first part of a step.
   */
  private startStep(): void {
    if (this.stepStarted) return;
    this.stepStarted = true;
    this.enqueue({ part: { type: 'start-step', request: {}, warnings: [] } });
  }

  /**
   * Records the current step as a `StepResult` and forwards `finish-step`.
   */
  private finishStep(options: {
    /**
     * Engine `finish-step` part.
     */
    part: Extract<HarnessAgentStreamPart, { type: 'finish-step' }>;
  }): void {
    const { part } = options;
    this.startStep();

    const stepNumber = this.steps_.length;
    const usage = asLanguageModelUsage(part.usage as LanguageModelV4Usage);
    const providerMetadata = part.harnessMetadata as
      | ProviderMetadata
      | undefined;
    const performance = createEmptyPerformance();
    const step = new DefaultStepResult<TOOLS, RUNTIME_CONTEXT>({
      callId: this.callId,
      stepNumber,
      provider: this.providerName,
      modelId: this.modelId,
      runtimeContext: {} as RUNTIME_CONTEXT,
      toolsContext: {} as InferToolSetContext<TOOLS>,
      content: this.stepContent,
      finishReason: part.finishReason.unified,
      rawFinishReason: part.finishReason.raw,
      usage,
      performance,
      warnings: undefined,
      request: {},
      response: {
        id: `${this.callId}-${stepNumber}`,
        timestamp: new Date(),
        modelId: this.modelId,
        messages: [],
      },
      providerMetadata,
    });
    this.steps_.push(step);

    this.enqueue({
      part: {
        type: 'finish-step',
        response: step.response,
        usage,
        performance,
        finishReason: part.finishReason.unified,
        rawFinishReason: part.finishReason.raw,
        providerMetadata,
      },
    });

    this.resetStepContent();
    this.stepParts = [];
    this.stepStarted = false;
  }

  /**
   * Discards the current step's collected content.
   */
  private resetStepContent(): void {
    this.stepContent = [];
    this.stepTextContent = new Map();
    this.stepReasoningContent = new Map();
  }

  /**
   * Adds a translated part to the current step's content, where it is content.
   * Preliminary tool results are not content.
   */
  private collectContent(options: {
    /**
     * Translated AI SDK stream part.
     */
    part: TextStreamPart<TOOLS>;
  }): void {
    const { part } = options;
    switch (part.type) {
      case 'text-start':
      case 'text-delta': {
        let content = this.stepTextContent.get(part.id);
        if (content == null) {
          content = { type: 'text', text: '' };
          this.stepTextContent.set(part.id, content);
          this.stepContent.push(content);
        }
        if (part.type === 'text-delta') content.text += part.text;
        if (part.providerMetadata != null) {
          content.providerMetadata = part.providerMetadata;
        }
        return;
      }
      case 'reasoning-start':
      case 'reasoning-delta': {
        let content = this.stepReasoningContent.get(part.id);
        if (content == null) {
          content = { type: 'reasoning', text: '' };
          this.stepReasoningContent.set(part.id, content);
          this.stepContent.push(content);
        }
        if (part.type === 'reasoning-delta') content.text += part.text;
        if (part.providerMetadata != null) {
          content.providerMetadata = part.providerMetadata;
        }
        return;
      }
      case 'tool-result':
        if (part.preliminary !== true) {
          this.stepContent.push({ ...part } as ContentPart<TOOLS>);
        }
        break;
      case 'tool-call':
      case 'tool-error':
        this.stepContent.push({ ...part } as ContentPart<TOOLS>);
        break;
      default:
    }
  }

  /**
   * Settles the result's promises from the recorded steps and the turn's
   * `finish` part, if any.
   */
  private settle(): void {
    const finalStep = this.steps_.at(-1);
    if (finalStep == null) {
      const error = new NoOutputGeneratedError({
        message: 'No output generated. Check the stream for errors.',
      });
      this._steps.reject(error);
      this._finishReason.reject(error);
      this._rawFinishReason.reject(error);
      this._totalUsage.reject(error);
      return;
    }

    this._steps.resolve(this.steps_);
    this._finishReason.resolve(
      this.finish?.finishReason ?? finalStep.finishReason,
    );
    this._rawFinishReason.resolve(
      this.finish != null
        ? this.finish.rawFinishReason
        : finalStep.rawFinishReason,
    );
    this._totalUsage.resolve(
      this.finish?.totalUsage ??
        this.steps_.reduce(
          (total, step) => addLanguageModelUsage(total, step.usage),
          createNullLanguageModelUsage(),
        ),
    );
  }

  /**
   * Resolves with the turn's last recorded step.
   */
  private get finalStepPromise(): Promise<StepResult<TOOLS, RUNTIME_CONTEXT>> {
    return this._steps.promise.then(steps => steps.at(-1)!);
  }

  /**
   * Resolves with a value collected across all recorded steps.
   */
  private fromAllSteps<T>(
    select: (step: StepResult<TOOLS, RUNTIME_CONTEXT>) => T[],
  ): Promise<T[]> {
    return this._steps.promise.then(steps => steps.flatMap(select));
  }

  /**
   * Recorded steps of the turn.
   */
  get steps() {
    return this._steps.promise;
  }

  /**
   * Last recorded step of the turn.
   */
  get finalStep() {
    return this.finalStepPromise;
  }

  /**
   * Content of all recorded steps.
   */
  get content() {
    return this.fromAllSteps(step => step.content);
  }

  /**
   * Text of the last recorded step.
   */
  get text() {
    return this.finalStepPromise.then(step => step.text);
  }

  /**
   * Reasoning of the last recorded step.
   */
  get reasoning() {
    return this.finalStepPromise.then(step =>
      getReasoningOutput({ content: step.content }),
    );
  }

  /**
   * Reasoning text of the last recorded step.
   */
  get reasoningText() {
    return this.finalStepPromise.then(step => step.reasoningText);
  }

  /**
   * Files generated across all recorded steps.
   */
  get files() {
    return this.fromAllSteps(step => step.files);
  }

  /**
   * Sources used across all recorded steps.
   */
  get sources() {
    return this.fromAllSteps(step => step.sources);
  }

  /**
   * Tool calls across all recorded steps.
   */
  get toolCalls() {
    return this.fromAllSteps(step => step.toolCalls);
  }

  /**
   * Typed tool calls across all recorded steps.
   */
  get staticToolCalls() {
    return this.fromAllSteps(step => step.staticToolCalls);
  }

  /**
   * Dynamic tool calls across all recorded steps.
   */
  get dynamicToolCalls() {
    return this.fromAllSteps(step => step.dynamicToolCalls);
  }

  /**
   * Tool results across all recorded steps.
   */
  get toolResults() {
    return this.fromAllSteps(step => step.toolResults);
  }

  /**
   * Typed tool results across all recorded steps.
   */
  get staticToolResults() {
    return this.fromAllSteps(step => step.staticToolResults);
  }

  /**
   * Dynamic tool results across all recorded steps.
   */
  get dynamicToolResults() {
    return this.fromAllSteps(step => step.dynamicToolResults);
  }

  /**
   * Reason the turn finished with, or that of its last recorded step.
   */
  get finishReason() {
    return this._finishReason.promise;
  }

  /**
   * Raw reason the turn finished with, or that of its last recorded step.
   */
  get rawFinishReason() {
    return this._rawFinishReason.promise;
  }

  /**
   * Usage of the last recorded step.
   */
  get usage() {
    return this.finalStepPromise.then(step => step.usage);
  }

  /**
   * Aggregate usage of the turn.
   */
  get totalUsage() {
    return this._totalUsage.promise;
  }

  /**
   * Warnings of the recorded steps.
   */
  get warnings() {
    return this.finalStepPromise.then(step => step.warnings);
  }

  /**
   * Request data of the last recorded step.
   */
  get request() {
    return this.finalStepPromise.then(step => step.request);
  }

  /**
   * Response data of the last recorded step.
   */
  get response() {
    return this.finalStepPromise.then(step => step.response);
  }

  /**
   * Provider metadata of the last recorded step.
   */
  get providerMetadata() {
    return this.finalStepPromise.then(step => step.providerMetadata);
  }

  /**
   * Not implemented yet.
   */
  get responseMessages(): StreamTextResult<
    TOOLS,
    RUNTIME_CONTEXT,
    OUTPUT
  >['responseMessages'] {
    return Promise.reject(notImplemented({ feature: 'responseMessages' }));
  }

  /**
   * Not implemented yet.
   */
  get output(): StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['output'] {
    return Promise.reject(notImplemented({ feature: 'output' }));
  }

  /**
   * Not implemented yet.
   */
  get experimental_partialOutputStream(): never {
    throw notImplemented({ feature: 'experimental_partialOutputStream' });
  }

  /**
   * Not implemented yet.
   */
  get partialOutputStream(): never {
    throw notImplemented({ feature: 'partialOutputStream' });
  }

  /**
   * Not implemented yet.
   */
  get elementStream(): never {
    throw notImplemented({ feature: 'elementStream' });
  }

  /**
   * Splits off an independent copy of the internal stream.
   */
  private teeEntries(): ReadableStream<HarnessStreamEntry<TOOLS>> {
    const [stream, remainingStream] = this.baseStream.tee();
    this.baseStream = remainingStream;
    return stream;
  }

  /**
   * Splits off an independent copy of the translated parts, without the
   * parts that are only for `toUIMessageStream()`.
   */
  private teeStream(): ReadableStream<TextStreamPart<TOOLS>> {
    return this.teeEntries().pipeThrough(
      new TransformStream<HarnessStreamEntry<TOOLS>, TextStreamPart<TOOLS>>({
        // oxlint-disable-next-line ai-sdk/require-object-parameter -- `TransformStream` transformer signature.
        transform(entry, controller) {
          if (entry.uiOnly !== true) controller.enqueue(entry.part);
        },
      }),
    );
  }

  /**
   * Independent copy of the stream of translated parts.
   */
  get stream(): AsyncIterableStream<TextStreamPart<TOOLS>> {
    return createAsyncIterableStream(this.teeStream());
  }

  /**
   * Independent copy of the stream of translated parts.
   */
  get fullStream(): AsyncIterableStream<TextStreamPart<TOOLS>> {
    return this.stream;
  }

  /**
   * Text deltas of the turn.
   */
  get textStream(): AsyncIterableStream<string> {
    return createAsyncIterableStream(
      this.teeStream().pipeThrough(
        new TransformStream<TextStreamPart<TOOLS>, string>({
          // oxlint-disable-next-line ai-sdk/require-object-parameter -- `TransformStream` transformer signature.
          transform(part, controller) {
            if (part.type === 'text-delta') controller.enqueue(part.text);
          },
        }),
      ),
    );
  }

  /**
   * Reads an independent copy of the stream to its end.
   */
  async consumeStream(options?: {
    onError?: (error: unknown) => void;
  }): Promise<void> {
    try {
      const reader = this.teeStream().getReader();
      try {
        while (!(await reader.read()).done) {}
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      options?.onError?.(error);
    }
  }

  /**
   * Converts the stream of translated parts to a UI message stream. After a
   * retraction that affects the current step, the stream gets a `reset-step`
   * chunk followed by the step's surviving parts again.
   */
  toUIMessageStream<UI_MESSAGE extends UIMessage>(
    options: UIMessageStreamOptions<UI_MESSAGE> = {},
  ): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
    const parts = this.teeEntries().pipeThrough(
      new TransformStream<HarnessStreamEntry<TOOLS>, TextStreamPart<TOOLS>>({
        // oxlint-disable-next-line ai-sdk/require-object-parameter -- `TransformStream` transformer signature.
        transform(entry, controller) {
          controller.enqueue(entry.part);
        },
      }),
    );
    return createAsyncIterableStream(
      toUIMessageStreamHelper<TOOLS, UI_MESSAGE>({
        ...options,
        stream: parts,
        tools: this.tools,
      }).pipeThrough(
        new TransformStream<
          InferUIMessageChunk<UI_MESSAGE>,
          InferUIMessageChunk<UI_MESSAGE>
        >({
          // oxlint-disable-next-line ai-sdk/require-object-parameter -- `TransformStream` transformer signature.
          transform(chunk, controller) {
            const uiChunk = chunk as UIMessageChunk;
            controller.enqueue(
              (uiChunk.type === 'custom' && uiChunk.kind === RESET_STEP_KIND
                ? { type: 'reset-step' }
                : chunk) as InferUIMessageChunk<UI_MESSAGE>,
            );
          },
        }),
      ),
    ) as AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;
  }

  /**
   * Creates a response streaming the UI message stream.
   */
  toUIMessageStreamResponse<UI_MESSAGE extends UIMessage>({
    originalMessages,
    generateMessageId,
    onStepEnd,
    onStepFinish,
    onEnd,
    onFinish,
    messageMetadata,
    sendReasoning,
    sendSources,
    sendStart,
    sendFinish,
    onError,
    redactToolErrors,
    ...init
  }: ResponseInit & {
    consumeSseStream?: (options: {
      stream: ReadableStream<string>;
    }) => PromiseLike<void> | void;
  } & UIMessageStreamOptions<UI_MESSAGE> = {}): Response {
    return createUIMessageStreamResponse({
      stream: this.toUIMessageStream<UI_MESSAGE>({
        originalMessages,
        generateMessageId,
        onStepEnd,
        onStepFinish,
        onEnd,
        onFinish,
        messageMetadata,
        sendReasoning,
        sendSources,
        sendStart,
        sendFinish,
        onError,
        redactToolErrors,
      }),
      ...init,
    });
  }

  /**
   * Not implemented yet.
   */
  pipeUIMessageStreamToResponse(): never {
    throw notImplemented({ feature: 'pipeUIMessageStreamToResponse' });
  }

  /**
   * Not implemented yet.
   */
  pipeTextStreamToResponse(): never {
    throw notImplemented({ feature: 'pipeTextStreamToResponse' });
  }

  /**
   * Not implemented yet.
   */
  toTextStreamResponse(): never {
    throw notImplemented({ feature: 'toTextStreamResponse' });
  }
}

/**
 * Returns step performance data for a step whose timing is not measured.
 */
function createEmptyPerformance(): StepResult<ToolSet, Context>['performance'] {
  return {
    effectiveOutputTokensPerSecond: 0,
    outputTokensPerSecond: undefined,
    inputTokensPerSecond: undefined,
    effectiveTotalTokensPerSecond: 0,
    stepTimeMs: 0,
    responseTimeMs: 0,
    toolExecutionMs: {},
    timeToFirstOutputMs: undefined,
  };
}

/**
 * Returns the error for a result member that is not implemented yet.
 */
function notImplemented(options: {
  /**
   * Name of the result member.
   */
  feature: string;
}): Error {
  return new Error(
    `HarnessAgent: \`${options.feature}\` is not implemented yet.`,
  );
}
