import type { ModelMessage } from '@ai-sdk/provider-utils';
import { addLanguageModelUsage, type LanguageModelUsage } from '../types/usage';
import { CompactionError } from './compaction-error';
import { defaultCompaction } from './default-compaction';
import type {
  CompactMessagesOptions,
  CompactionResult,
  CompactionStrategyContext,
} from './types';
import {
  createCheckpoint,
  getPendingToolCalls,
  hasValidToolExchanges,
  isValidMessages,
  serializeMessages,
  validateCheckpoint,
} from './validate-compaction';

/**
 * Replace rewritable history after the caller decides to compact. No automatic
 * trigger, model resolution, persistence or retry is performed. Token budgets
 * require caller-supplied counting; no token size is inferred from content.
 */
export async function compactMessages(
  options: CompactMessagesOptions,
): Promise<CompactionResult> {
  let usage: LanguageModelUsage | undefined;
  try {
    validateOptions(options);
    const { messages, context = {}, targetInputTokens, abortSignal } = options;
    abortSignal?.throwIfAborted();
    if (!(await isValidMessages(messages))) {
      throw new CompactionError({
        code: 'INVALID_MESSAGES',
        message:
          'Input messages contain invalid content or detached tool exchanges.',
      });
    }
    await validateCheckpoint(messages, options.checkpoint);
    const originalPendingToolCalls = getPendingToolCalls(messages);
    const isValidReplacement = (candidate: readonly ModelMessage[]) =>
      isValidMessages(candidate, originalPendingToolCalls);
    const currentUserMessageIndex = resolveCurrentUserIndex(options);
    if (
      targetInputTokens !== undefined &&
      context.fixedInputTokens! >= targetInputTokens
    ) {
      throw new CompactionError({
        code: 'FIXED_CONTEXT_TOO_LARGE',
        message: 'Fixed input must be smaller than targetInputTokens.',
      });
    }

    const countTokens = (input: readonly ModelMessage[]) => {
      abortSignal?.throwIfAborted();
      if (options.countTokens === undefined) {
        throw new CompactionError({
          code: 'MEASUREMENT_UNAVAILABLE',
          message:
            'Token measurement requires an explicit countTokens callback.',
        });
      }
      const count = options.countTokens(input);
      validateCount(count, 'countTokens result');
      return Math.ceil(count);
    };
    const original = serializeMessages(messages);
    // Capture immutable semantics before calling application code. The callback
    // contract is read-only, but object-identity caches must not trust mutations.
    const originalMessages =
      typeof options.strategy === 'function'
        ? new Set(messages.map(message => serializeMessages([message])))
        : undefined;
    let summarized = false;
    const measureCandidate = (
      candidate: readonly ModelMessage[],
      rewritten = false,
    ) => {
      if (context.fixedInputTokens === undefined) {
        throw new CompactionError({
          code: 'MEASUREMENT_UNAVAILABLE',
          message: 'Whole-request measurement requires fixedInputTokens.',
        });
      }
      const estimated = context.fixedInputTokens + countTokens(candidate);
      if (rewritten || context.inputTokens === undefined)
        return Math.ceil(estimated);
      // Pruning only earns the estimated reduction actually made. Switching to
      // a smaller local estimate must not make an unchanged provider request fit.
      const excess = Math.max(
        0,
        context.inputTokens - context.fixedInputTokens - countTokens(messages),
      );
      return Math.ceil(estimated + excess);
    };
    const recordUsage = async (reported: LanguageModelUsage) => {
      const captured = snapshotUsage(reported);
      usage =
        usage === undefined
          ? captured
          : snapshotUsage(addLanguageModelUsage(usage, captured));
      await options.onUsage?.(reported);
    };
    const createMessage: CompactionStrategyContext['createMessage'] = (
      message,
      purpose,
    ) => {
      abortSignal?.throwIfAborted();
      const semantics = serializeMessages([message]);
      const created =
        options.createMessage === undefined
          ? message
          : options.createMessage(message, purpose);
      if (
        created == null ||
        typeof created !== 'object' ||
        serializeMessages([created]) !== semantics
      ) {
        throw new CompactionError({
          code: 'INVALID_MESSAGES',
          message:
            'createMessage may annotate messages but cannot change their semantics.',
        });
      }
      return created;
    };
    const summarize = options.summarize;
    const strategyContext: CompactionStrategyContext = {
      ...context,
      targetInputTokens,
      checkpoint: options.checkpoint,
      currentUserMessageIndex,
      reason: options.reason ?? 'automatic',
      abortSignal,
      countTokens,
      createMessage,
      describeMedia: options.describeMedia,
      recordUsage,
      summarize:
        summarize === undefined
          ? undefined
          : async input => {
              abortSignal?.throwIfAborted();
              if (
                typeof input.system !== 'string' ||
                !(await isValidMessages(input.messages))
              ) {
                throw new CompactionError({
                  code: 'INVALID_MESSAGES',
                  message: 'Invalid summary prompt.',
                });
              }
              if (summarize.maxInputTokens !== undefined) {
                const inputTokens = summarize.countTokens(input);
                validateCount(inputTokens, 'summarize.countTokens result');
                if (Math.ceil(inputTokens) > summarize.maxInputTokens) {
                  throw new CompactionError({
                    code: 'SUMMARY_INPUT_TOO_LARGE',
                    message:
                      'The complete summary request exceeds summarize.maxInputTokens.',
                  });
                }
              }
              abortSignal?.throwIfAborted();
              const result = await summarize.execute({
                ...input,
                maxOutputTokens: summarize.maxOutputTokens,
                abortSignal,
              });
              // A completed call remains billable even when cancellation or validation
              // prevents accepting its result.
              if (result?.usage !== undefined) await recordUsage(result.usage);
              abortSignal?.throwIfAborted();
              if (
                result?.finishReason !== undefined &&
                result.finishReason !== 'stop'
              ) {
                throw new CompactionError({
                  code: 'SUMMARY_INCOMPLETE',
                  message:
                    'Summary execution returned a finishReason other than "stop".',
                });
              }
              if (
                typeof result?.text !== 'string' ||
                result.text.trim().length === 0
              ) {
                throw new CompactionError({
                  code: 'EMPTY_SUMMARY',
                  message: 'The summary executor returned no text.',
                });
              }
              summarized = true;
              return result;
            },
    } as CompactionStrategyContext;

    abortSignal?.throwIfAborted();
    const result =
      typeof options.strategy === 'function'
        ? await options.strategy([...messages], strategyContext)
        : await defaultCompaction(options, strategyContext, {
            measureCandidate,
            createCheckpoint,
            isValidMessages: candidate =>
              hasValidToolExchanges(candidate, originalPendingToolCalls),
          });
    abortSignal?.throwIfAborted();
    if (result == null || !(await isValidReplacement(result.messages))) {
      throw new CompactionError({
        code: 'INVALID_MESSAGES',
        message:
          'Replacement messages contain invalid content or detached tool exchanges.',
      });
    }
    await validateCheckpoint(result.messages, result.checkpoint);
    if (
      typeof options.strategy === 'function' &&
      result.checkpoint !== undefined &&
      (options.checkpoint === undefined ||
        result.checkpoint.version !== options.checkpoint.version ||
        result.checkpoint.startIndex !== options.checkpoint.startIndex ||
        result.checkpoint.messageCount !== options.checkpoint.messageCount ||
        result.checkpoint.digest !== options.checkpoint.digest)
    ) {
      throw new CompactionError({
        code: 'INVALID_CHECKPOINT',
        message:
          'A custom strategy must omit a moved or rewritten checkpoint descriptor.',
      });
    }
    const compacted = serializeMessages(result.messages) !== original;
    let inputTokensAfter: number | undefined;
    let measurement: CompactionResult['measurement'] = 'estimated';
    if (result.measurement !== undefined) {
      if (
        result.measurement === null ||
        typeof result.measurement !== 'object'
      ) {
        throw new CompactionError({
          code: 'INVALID_OPTIONS',
          message:
            'Replacement measurement must contain inputTokens and source.',
        });
      }
      validateCount(result.measurement.inputTokens, 'measurement.inputTokens');
      if (!['estimated', 'provider'].includes(result.measurement.source)) {
        throw new CompactionError({
          code: 'INVALID_OPTIONS',
          message: 'Unknown measurement source.',
        });
      }
      inputTokensAfter = Math.ceil(result.measurement.inputTokens);
      measurement = result.measurement.source;
      if (
        context.fixedInputTokens !== undefined &&
        inputTokensAfter < context.fixedInputTokens
      ) {
        throw new CompactionError({
          code: 'INVALID_OPTIONS',
          message: 'Replacement measurement must include fixed input.',
        });
      }
    } else {
      try {
        // A custom callback making a summary call does not establish that it
        // used the summary. Without its own measurement, keep the conservative
        // input calibration even when the custom result changes the history.
        inputTokensAfter = measureCandidate(
          result.messages,
          options.strategy === 'summarize' && summarized && compacted,
        );
      } catch (error) {
        if (
          !CompactionError.isInstance(error) ||
          error.code !== 'MEASUREMENT_UNAVAILABLE' ||
          targetInputTokens !== undefined
        )
          throw error;
        measurement = 'unavailable';
      }
    }
    if (
      measurement === 'estimated' &&
      inputTokensAfter !== undefined &&
      !compacted &&
      context.inputTokens !== undefined
    ) {
      inputTokensAfter = Math.max(
        inputTokensAfter,
        Math.ceil(context.inputTokens),
      );
    }
    // A slice/reordering of existing messages cannot discard a known
    // underestimate by supplying a smaller estimate. For a rewritten custom
    // representation, its explicit next-request measurement is first-class.
    if (
      typeof options.strategy === 'function' &&
      measurement === 'estimated' &&
      inputTokensAfter !== undefined &&
      (result.measurement === undefined ||
        !compacted ||
        result.messages.every(message =>
          originalMessages!.has(serializeMessages([message])),
        ))
    ) {
      try {
        inputTokensAfter = Math.max(
          inputTokensAfter,
          measureCandidate(result.messages),
        );
      } catch (error) {
        if (
          !CompactionError.isInstance(error) ||
          error.code !== 'MEASUREMENT_UNAVAILABLE'
        )
          throw error;
        // An explicit next-request measurement may size otherwise opaque parts.
        if (result.measurement === undefined && targetInputTokens !== undefined)
          throw error;
      }
    }
    if (
      targetInputTokens !== undefined &&
      (inputTokensAfter === undefined || inputTokensAfter > targetInputTokens)
    ) {
      throw new CompactionError({
        code: 'TARGET_NOT_REACHED',
        message: 'Replacement input exceeds targetInputTokens.',
      });
    }
    abortSignal?.throwIfAborted();
    return {
      messages: result.messages,
      checkpoint: result.checkpoint,
      compacted,
      inputTokensBefore: context.inputTokens,
      inputTokensAfter,
      measurement,
      usage,
    };
  } catch (error) {
    if (CompactionError.isInstance(error) && usage !== undefined)
      error.usage = usage;
    throw error;
  }
}

/** Detach reported usage before application callbacks can mutate it. */
function snapshotUsage(reported: LanguageModelUsage): LanguageModelUsage {
  const isObject = (value: unknown) =>
    value != null && typeof value === 'object' && !Array.isArray(value);
  if (
    !isObject(reported) ||
    !isObject(reported.inputTokenDetails) ||
    !isObject(reported.outputTokenDetails)
  ) {
    throw new CompactionError({
      code: 'INVALID_OPTIONS',
      message:
        'Reported usage must include inputTokenDetails and outputTokenDetails objects.',
    });
  }
  const captured: LanguageModelUsage = {
    inputTokens: reported.inputTokens,
    inputTokenDetails: {
      noCacheTokens: reported.inputTokenDetails.noCacheTokens,
      cacheReadTokens: reported.inputTokenDetails.cacheReadTokens,
      cacheWriteTokens: reported.inputTokenDetails.cacheWriteTokens,
    },
    outputTokens: reported.outputTokens,
    outputTokenDetails: {
      textTokens: reported.outputTokenDetails.textTokens,
      reasoningTokens: reported.outputTokenDetails.reasoningTokens,
    },
    totalTokens: reported.totalTokens,
  };
  const counts = {
    inputTokens: captured.inputTokens,
    outputTokens: captured.outputTokens,
    totalTokens: captured.totalTokens,
    ...captured.inputTokenDetails,
    ...captured.outputTokenDetails,
  };
  for (const [name, count] of Object.entries(counts)) {
    if (count !== undefined) validateCount(count, `usage.${name}`);
  }
  if (reported.raw !== undefined) {
    if (!isObject(reported.raw)) {
      throw new CompactionError({
        code: 'INVALID_OPTIONS',
        message: 'usage.raw must be an object when supplied.',
      });
    }
    try {
      captured.raw = structuredClone(reported.raw);
    } catch (cause) {
      throw new CompactionError({
        code: 'INVALID_OPTIONS',
        message: 'usage.raw must contain cloneable provider usage data.',
        cause,
      });
    }
  }
  return captured;
}

function validateCount(value: number, name: string, positive = false): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    (positive && value === 0)
  ) {
    throw new CompactionError({
      code: 'INVALID_OPTIONS',
      message: `${name} must be a finite ${positive ? 'positive' : 'nonnegative'} number.`,
    });
  }
}

function validateOptions(options: CompactMessagesOptions): void {
  const invalid = (message: string): never => {
    throw new CompactionError({ code: 'INVALID_OPTIONS', message });
  };
  if (options == null || !Array.isArray(options.messages))
    invalid('messages are required.');
  if (
    options.context !== undefined &&
    (options.context === null || typeof options.context !== 'object')
  )
    invalid('context must be an object.');
  const { context = {}, targetInputTokens, strategy, summarize } = options;
  for (const name of [
    'inputTokens',
    'fixedInputTokens',
    'contextWindowTokens',
  ] as const) {
    if (context[name] !== undefined)
      validateCount(
        context[name],
        `context.${name}`,
        name === 'contextWindowTokens',
      );
  }
  if (
    context.inputTokens !== undefined &&
    context.fixedInputTokens !== undefined &&
    context.inputTokens < context.fixedInputTokens
  )
    invalid('inputTokens must include fixedInputTokens.');
  if (targetInputTokens !== undefined) {
    validateCount(targetInputTokens, 'targetInputTokens', true);
    if (
      context.inputTokens === undefined ||
      context.fixedInputTokens === undefined
    )
      invalid('A numeric target requires inputTokens and fixedInputTokens.');
    if (options.countTokens === undefined) {
      throw new CompactionError({
        code: 'MEASUREMENT_UNAVAILABLE',
        message: 'A numeric target requires an explicit countTokens callback.',
      });
    }
    if (
      context.contextWindowTokens !== undefined &&
      targetInputTokens > context.contextWindowTokens
    )
      invalid('targetInputTokens exceeds contextWindowTokens.');
  } else if (
    options.maxRecentTokens !== undefined ||
    options.oversizedUserMessage !== undefined
  ) {
    invalid('maxRecentTokens and oversizedUserMessage require a token target.');
  }
  if (strategy !== 'summarize' && typeof strategy !== 'function')
    invalid('strategy must be "summarize" or a custom strategy function.');
  if (typeof strategy === 'function') {
    for (const key of [
      'keepRecentMessages',
      'keepCurrentTurn',
      'maxRecentTokens',
      'maxToolResultCharacters',
      'oversizedUserMessage',
    ] as const) {
      if (options[key] !== undefined)
        invalid(`${key} cannot be combined with a custom strategy.`);
    }
  }
  if (
    options.keepCurrentTurn !== undefined &&
    typeof options.keepCurrentTurn !== 'boolean'
  ) {
    invalid('keepCurrentTurn must be a boolean.');
  }
  for (const key of [
    'maxRecentTokens',
    'maxToolResultCharacters',
    'keepRecentMessages',
  ] as const) {
    const count = options[key];
    if (count === undefined) continue;
    validateCount(count, key, key !== 'keepRecentMessages');
    if (key !== 'maxRecentTokens' && !Number.isSafeInteger(count))
      invalid(`${key} must be an integer.`);
  }
  if (
    options.oversizedUserMessage !== undefined &&
    !['summarize-middle', 'error'].includes(options.oversizedUserMessage)
  )
    invalid('Unknown oversizedUserMessage policy.');
  if (
    options.reason !== undefined &&
    !['automatic', 'manual', 'overflow'].includes(options.reason)
  )
    invalid('Unknown compaction reason.');
  for (const key of [
    'countTokens',
    'createMessage',
    'describeMedia',
    'onUsage',
  ] as const) {
    if (options[key] !== undefined && typeof options[key] !== 'function')
      invalid(`${key} must be a function.`);
  }
  if (summarize !== undefined) {
    if (summarize === null || typeof summarize.execute !== 'function')
      invalid('summarize.execute must be a function.');
    if (summarize.maxInputTokens !== undefined) {
      validateCount(summarize.maxInputTokens, 'summarize.maxInputTokens', true);
      if (typeof summarize.countTokens !== 'function') {
        throw new CompactionError({
          code: 'MEASUREMENT_UNAVAILABLE',
          message:
            'summarize.maxInputTokens requires a summary-model countTokens callback.',
        });
      }
    } else if (summarize.countTokens !== undefined) {
      invalid('summarize.countTokens requires summarize.maxInputTokens.');
    }
    validateCount(summarize.maxOutputTokens, 'summarize.maxOutputTokens', true);
  }
}

function resolveCurrentUserIndex(
  options: CompactMessagesOptions,
): number | null {
  const { messages, checkpoint, currentUserMessageIndex } = options;
  const inCheckpoint = (index: number) =>
    checkpoint !== undefined &&
    index >= checkpoint.startIndex &&
    index < checkpoint.startIndex + checkpoint.messageCount;
  if (currentUserMessageIndex !== undefined) {
    if (currentUserMessageIndex === null) return null;
    if (
      !Number.isSafeInteger(currentUserMessageIndex) ||
      currentUserMessageIndex < 0 ||
      messages[currentUserMessageIndex]?.role !== 'user' ||
      inCheckpoint(currentUserMessageIndex)
    ) {
      throw new CompactionError({
        code: 'INVALID_OPTIONS',
        message:
          'currentUserMessageIndex must identify a user message outside the checkpoint.',
      });
    }
    return currentUserMessageIndex;
  }
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user' && !inCheckpoint(index)) return index;
  }
  return null;
}
