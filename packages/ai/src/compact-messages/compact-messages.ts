import type { ModelMessage } from '@ai-sdk/provider-utils';
import { addLanguageModelUsage, type LanguageModelUsage } from '../types/usage';
import { CompactionError } from './compaction-error';
import { defaultCompaction } from './default-compaction';
import {
  compactionRequestOverheadTokens,
  estimateMessageTokens,
  estimateTextTokens,
} from './measure-context';
import type {
  CompactMessagesOptions,
  CompactionResult,
  CompactionStrategyContext,
} from './types';
import {
  createCheckpoint,
  getPendingToolCalls,
  isValidMessages,
  serializeMessages,
  validateCheckpoint,
} from './validate-compaction';

/**
 * Replace rewritable history after the caller decides to compact. No automatic
 * trigger, model resolution, persistence or retry is performed. Local estimates
 * are approximate; reserve generation output and safety margins in the target.
 */
export async function compactMessages(
  options: CompactMessagesOptions,
): Promise<CompactionResult> {
  let usage: LanguageModelUsage | undefined;
  try {
    validateOptions(options);
    const { messages, context, targetInputTokens, abortSignal } = options;
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

    const estimateTokens = (input: readonly ModelMessage[]) => {
      abortSignal?.throwIfAborted();
      const count = (options.estimateTokens ?? estimateMessageTokens)(input);
      validateCount(count, 'estimateTokens result');
      return Math.ceil(count);
    };
    const original = serializeMessages(messages);
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
      const estimated = context.fixedInputTokens + estimateTokens(candidate);
      if (rewritten || context.inputTokens === undefined)
        return Math.ceil(estimated);
      // Pruning only earns the estimated reduction actually made. Switching to
      // a smaller local estimate must not make an unchanged provider request fit.
      const excess = Math.max(
        0,
        context.inputTokens -
          context.fixedInputTokens -
          estimateTokens(messages),
      );
      return Math.ceil(estimated + excess);
    };
    const recordUsage = async (reported: LanguageModelUsage) => {
      usage =
        usage === undefined ? reported : addLanguageModelUsage(usage, reported);
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
      estimateTokens,
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
              const inputTokens =
                compactionRequestOverheadTokens +
                estimateTokens([
                  { role: 'system', content: input.system },
                  ...input.messages,
                ]);
              if (inputTokens > summarize.maxInputTokens) {
                throw new CompactionError({
                  code: 'SUMMARY_INPUT_TOO_LARGE',
                  message:
                    'The complete summary request exceeds summarize.maxInputTokens.',
                });
              }
              abortSignal?.throwIfAborted();
              const result = await summarize.execute({
                ...input,
                maxOutputTokens: summarize.maxOutputTokens,
                abortSignal,
              });
              // A completed call remains billable even when cancellation or validation
              // prevents accepting its result.
              if (result.usage !== undefined) await recordUsage(result.usage);
              abortSignal?.throwIfAborted();
              if (
                typeof result.text !== 'string' ||
                result.text.trim().length === 0
              ) {
                throw new CompactionError({
                  code: 'EMPTY_SUMMARY',
                  message: 'The summary executor returned no text.',
                });
              }
              const text = fitSummary(result.text, summarize.maxOutputTokens);
              summarized = true;
              return { ...result, text };
            },
    } as CompactionStrategyContext;

    abortSignal?.throwIfAborted();
    const result =
      options.strategy !== undefined
        ? await options.strategy([...messages], strategyContext)
        : await defaultCompaction(options, strategyContext, {
            measureCandidate,
            createCheckpoint,
            isValidMessages: isValidReplacement,
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
      options.strategy !== undefined &&
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
          options.strategy === undefined && summarized && compacted,
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
    const originalMessages = new Set(
      messages.map(message => serializeMessages([message])),
    );
    const onlyRetainedMessages = result.messages.every(message =>
      originalMessages.has(serializeMessages([message])),
    );
    if (
      options.strategy !== undefined &&
      measurement === 'estimated' &&
      inputTokensAfter !== undefined &&
      (result.measurement === undefined || onlyRetainedMessages)
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

function fitSummary(text: string, maxTokens: number): string {
  if (estimateTextTokens(text) <= maxTokens) return text;
  const notice = '\n[Summary shortened.]';
  let low = 0;
  let high = text.length;
  let fitted = '';
  while (low <= high) {
    const length = Math.floor((low + high) / 2);
    const end =
      length > 0 && /[\uD800-\uDBFF]/.test(text[length - 1])
        ? length - 1
        : length;
    const candidate = text.slice(0, end) + notice;
    if (estimateTextTokens(candidate) <= maxTokens) {
      fitted = candidate;
      low = length + 1;
    } else high = length - 1;
  }
  if (fitted.length === 0) {
    throw new CompactionError({
      code: 'TARGET_NOT_REACHED',
      message: 'The summary output budget cannot hold a usable summary.',
    });
  }
  return fitted;
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
  if (
    options == null ||
    !Array.isArray(options.messages) ||
    options.context == null
  )
    invalid('messages and context are required.');
  const { context, targetInputTokens, strategy, summarize } = options;
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
    if (
      context.contextWindowTokens !== undefined &&
      targetInputTokens > context.contextWindowTokens
    )
      invalid('targetInputTokens exceeds contextWindowTokens.');
  } else if (strategy === undefined)
    invalid('The default algorithm requires targetInputTokens.');
  if (strategy !== undefined) {
    if (typeof strategy !== 'function') invalid('strategy must be a function.');
    for (const key of [
      'keepRecentMessages',
      'maxRecentTokens',
      'maxToolResultCharacters',
      'oversizedUserMessage',
    ] as const) {
      if (options[key] !== undefined)
        invalid(`${key} cannot be combined with a custom strategy.`);
    }
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
    'estimateTokens',
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
    validateCount(summarize.maxInputTokens, 'summarize.maxInputTokens', true);
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
