import type {
  FilePart,
  ImagePart,
  ModelMessage,
  ReasoningFilePart,
} from '@ai-sdk/provider-utils';
import type { LanguageModel } from '../types/language-model';
import type { LanguageModelUsage } from '../types/usage';

export interface UnmeasuredCompactionContext {
  model?: LanguageModel;
  contextWindowTokens?: number;
  /** Size of the entire next request, including fixed context. */
  inputTokens?: number;
  /** Instructions, tools and other input that this operation cannot rewrite. */
  fixedInputTokens?: number;
}

export interface CompactionMeasurement extends UnmeasuredCompactionContext {
  inputTokens: number;
  fixedInputTokens: number;
}

/** Persist this SDK-produced descriptor alongside the complete messages. */
export interface CompactionCheckpoint {
  version: 1;
  startIndex: number;
  messageCount: number;
  digest: string;
}

export type CompactionMediaDescriber = (
  part: FilePart | ImagePart | ReasoningFilePart,
) => string | undefined;

export type CompactionSummarizer = {
  /** Forwarded to the executor, which must enforce the model's output limit. */
  maxOutputTokens: number;
  execute(input: {
    system: string;
    messages: ModelMessage[];
    maxOutputTokens: number;
    abortSignal?: AbortSignal;
  }): Promise<{ text: string; usage?: LanguageModelUsage }>;
} & (
  | {
      /** Includes summary instructions, framing, previous checkpoint and transcript. */
      maxInputTokens: number;
      /** Counts the complete request for the summary model, including framing. */
      countTokens: (input: {
        system: string;
        messages: readonly ModelMessage[];
      }) => number;
    }
  | { maxInputTokens?: never; countTokens?: never }
);

interface SharedCompactionOptions {
  messages: readonly ModelMessage[];
  summarize?: CompactionSummarizer;
  checkpoint?: CompactionCheckpoint;
  /** Omit to infer the last user message outside the checkpoint; null disables inference. */
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

type CompactionBudget =
  | {
      context: CompactionMeasurement;
      /** Whole-request input limit, already reserving room for generation output. */
      targetInputTokens: number;
      /** Counts history, including message framing. Must be deterministic and finite. */
      countTokens: (messages: readonly ModelMessage[]) => number;
    }
  | {
      context?: UnmeasuredCompactionContext;
      targetInputTokens?: never;
      countTokens?: (messages: readonly ModelMessage[]) => number;
    };

export type CompactMessagesOptions = SharedCompactionOptions &
  CompactionBudget &
  (
    | ({
        strategy?: never;
        keepRecentMessages?: number;
        maxToolResultCharacters?: number;
      } & (
        | {
            targetInputTokens: number;
            maxRecentTokens?: number;
            /** summarize-middle is lossy, including attachments that cannot fit. */
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
        maxRecentTokens?: never;
        maxToolResultCharacters?: never;
        oversizedUserMessage?: never;
      }
  );

export type CompactionStrategyContext = (
  | (CompactionMeasurement & { targetInputTokens: number })
  | (UnmeasuredCompactionContext & { targetInputTokens?: undefined })
) & {
  checkpoint?: CompactionCheckpoint;
  currentUserMessageIndex: number | null;
  reason: 'automatic' | 'manual' | 'overflow';
  abortSignal?: AbortSignal;
  /** Uses the supplied counter; throws MEASUREMENT_UNAVAILABLE if none was supplied. */
  countTokens(messages: readonly ModelMessage[]): number;
  createMessage(
    message: ModelMessage,
    purpose: 'checkpoint' | 'continuation',
  ): ModelMessage;
  describeMedia?: CompactionMediaDescriber;
  /** Checks the optional summary input budget and records returned usage exactly once. */
  summarize?: (input: {
    system: string;
    messages: ModelMessage[];
  }) => Promise<{ text: string; usage?: LanguageModelUsage }>;
  /** Report private model calls; do not report ctx.summarize calls again. */
  recordUsage(usage: LanguageModelUsage): Promise<void>;
};

export type CompactionStrategy = (
  messages: readonly ModelMessage[],
  context: CompactionStrategyContext,
) => Promise<CompactionStrategyResult>;

export interface CompactionStrategyResult {
  messages: ModelMessage[];
  checkpoint?: CompactionCheckpoint;
  /** Size of the reconstructed next request, not usage of the compaction call. */
  measurement?: { inputTokens: number; source: 'estimated' | 'provider' };
}

export interface CompactionResult {
  messages: ModelMessage[];
  compacted: boolean;
  checkpoint?: CompactionCheckpoint;
  inputTokensBefore?: number;
  inputTokensAfter?: number;
  measurement: 'estimated' | 'provider' | 'unavailable';
  usage?: LanguageModelUsage;
}
