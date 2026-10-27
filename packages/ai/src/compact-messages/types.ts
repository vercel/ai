import type {
  FilePart,
  ImagePart,
  ModelMessage,
  ReasoningFilePart,
} from '@ai-sdk/provider-utils';
import type { FinishReason, LanguageModel } from '../types/language-model';
import type { LanguageModelUsage } from '../types/usage';

/**
 * Request context available before compaction when token measurement is optional.
 * If supplied, inputTokens covers the entire next request, including the fixed
 * instructions, tools and other input that compaction cannot rewrite.
 */
export interface UnmeasuredCompactionContext {
  model?: LanguageModel;
  contextWindowTokens?: number;
  inputTokens?: number;
  fixedInputTokens?: number;
}

/**
 * Complete request measurement required to compact against a token budget.
 * Separating fixed input from total input determines how much space is available
 * for the replacement message history.
 */
export interface CompactionMeasurement extends UnmeasuredCompactionContext {
  inputTokens: number;
  fixedInputTokens: number;
}

/**
 * SDK-produced identity of summary messages already embedded in the history.
 * Later compaction calls validate this descriptor to recognize and update the
 * existing checkpoint. Persist it alongside the complete replacement history.
 */
export interface CompactionCheckpoint {
  version: 1;
  startIndex: number;
  messageCount: number;
  digest: string;
}

/**
 * Application hook for describing attachments when preparing the summary
 * transcript or replacing media that cannot fit in retained history.
 */
export type CompactionMediaDescriber = (
  part: FilePart | ImagePart | ReasoningFilePart,
) => string | undefined;

/**
 * Output of a summary model call, checked before it becomes a checkpoint.
 * Only nonempty text with a 'stop' finish reason is accepted. Reported usage is
 * recorded even when the summary is rejected as incomplete.
 */
type CompactionSummary = {
  text: string;
  finishReason: FinishReason;
  usage?: LanguageModelUsage;
};

/**
 * Adapter for executing summary model calls with a budget separate from the
 * main conversation. The executor must enforce the forwarded maxOutputTokens.
 * An optional maxInputTokens limit requires a counter for the complete summary
 * request, including instructions, framing, previous checkpoint and transcript.
 */
export type CompactionSummarizer = {
  maxOutputTokens: number;
  execute(input: {
    system: string;
    messages: ModelMessage[];
    maxOutputTokens: number;
    abortSignal?: AbortSignal;
  }): Promise<CompactionSummary>;
} & (
  | {
      maxInputTokens: number;
      countTokens: (input: {
        system: string;
        messages: readonly ModelMessage[];
      }) => number;
    }
  | { maxInputTokens?: never; countTokens?: never }
);

/**
 * History, checkpoint and application hooks shared by both compaction strategies.
 * Omitting currentUserMessageIndex infers the last user message outside the
 * checkpoint; null disables inference. createMessage can annotate new messages
 * without changing their semantics, and onUsage reports compaction model usage.
 */
interface SharedCompactionOptions {
  messages: readonly ModelMessage[];
  summarize?: CompactionSummarizer;
  checkpoint?: CompactionCheckpoint;
  currentUserMessageIndex?: number | null;
  createMessage?: (
    message: ModelMessage,
    purpose: 'checkpoint' | 'continuation',
  ) => ModelMessage;
  describeMedia?: CompactionMediaDescriber;
  reason?: 'automatic' | 'manual' | 'overflow';
  abortSignal?: AbortSignal;
  onUsage?: (usage: LanguageModelUsage) => void | Promise<void>;
}

/**
 * Selects whether compaction must meet a token target. A target requires a full
 * request measurement and a deterministic, finite, nonnegative history counter
 * that includes message framing and media. The target includes fixed input and
 * must already reserve room for generation output. Without a target, compaction
 * can run without token measurement; no token counts are inferred by the SDK.
 */
type CompactionBudget =
  | {
      context: CompactionMeasurement;
      targetInputTokens: number;
      countTokens: (messages: readonly ModelMessage[]) => number;
    }
  | {
      context?: UnmeasuredCompactionContext;
      targetInputTokens?: never;
      countTokens?: (messages: readonly ModelMessage[]) => number;
    };

/**
 * Public configuration for one compaction call; the application decides when to
 * invoke it and explicitly selects built-in summarization or a custom strategy.
 * The built-in strategy prefers to retain keepRecentMessages and preserves tool
 * exchanges. keepCurrentTurn defaults to false; enabling it also retains earlier
 * exchanges from the current request. Token budgets can further constrain the
 * retained content, and 'summarize-middle' permits lossy clipping of oversized
 * user requests, including attachments. Custom strategies supply their own
 * retention policy instead of using the built-in retention and pruning options.
 */
export type CompactMessagesOptions = SharedCompactionOptions &
  CompactionBudget &
  (
    | ({
        strategy: 'summarize';
        keepRecentMessages?: number;
        keepCurrentTurn?: boolean;
        maxToolResultCharacters?: number;
      } & (
        | {
            targetInputTokens: number;
            maxRecentTokens?: number;
            oversizedUserMessage?: 'summarize-middle' | 'error';
          }
        | {
            targetInputTokens?: never;
            maxRecentTokens?: never;
            oversizedUserMessage?: never;
          }
      ))
    | {
        strategy: CompactionStrategy;
        keepRecentMessages?: never;
        keepCurrentTurn?: never;
        maxRecentTokens?: never;
        maxToolResultCharacters?: never;
        oversizedUserMessage?: never;
      }
  );

/**
 * Resolved request context and SDK helpers passed to a compaction strategy.
 * countTokens uses the supplied counter and throws MEASUREMENT_UNAVAILABLE when
 * none exists. summarize checks the optional summary input budget, validates
 * completion and records usage exactly once. Use recordUsage only for separate
 * model calls made by the strategy, so summary usage is not counted twice.
 */
export type CompactionStrategyContext = (
  | (CompactionMeasurement & { targetInputTokens: number })
  | (UnmeasuredCompactionContext & { targetInputTokens?: undefined })
) & {
  checkpoint?: CompactionCheckpoint;
  currentUserMessageIndex: number | null;
  reason: 'automatic' | 'manual' | 'overflow';
  abortSignal?: AbortSignal;
  countTokens(messages: readonly ModelMessage[]): number;
  createMessage(
    message: ModelMessage,
    purpose: 'checkpoint' | 'continuation',
  ): ModelMessage;
  describeMedia?: CompactionMediaDescriber;
  summarize?: (input: {
    system: string;
    messages: ModelMessage[];
  }) => Promise<CompactionSummary>;
  recordUsage(usage: LanguageModelUsage): Promise<void>;
};

/**
 * Application-defined replacement for the built-in compaction algorithm.
 * Produces a complete replacement history using the shared context and helpers;
 * the SDK validates the result and enforces any supplied token target afterward.
 */
export type CompactionStrategy = (
  messages: readonly ModelMessage[],
  context: CompactionStrategyContext,
) => Promise<CompactionStrategyResult>;

/**
 * Replacement history returned by a strategy for SDK validation. A checkpoint
 * can identify an existing summary that remains unchanged and in place. Any
 * measurement describes the reconstructed next request, not the tokens consumed
 * by model calls made during compaction.
 */
export interface CompactionStrategyResult {
  messages: ModelMessage[];
  checkpoint?: CompactionCheckpoint;
  measurement?: { inputTokens: number; source: 'estimated' | 'provider' };
}

/**
 * Validated output returned to the caller for continuing the conversation.
 * compacted indicates a semantic change to the history. The before/after counts
 * and measurement source describe request size, while usage totals the reported
 * model calls made during compaction. Save messages and checkpoint together.
 */
export interface CompactionResult {
  messages: ModelMessage[];
  compacted: boolean;
  checkpoint?: CompactionCheckpoint;
  inputTokensBefore?: number;
  inputTokensAfter?: number;
  measurement: 'estimated' | 'provider' | 'unavailable';
  usage?: LanguageModelUsage;
}
