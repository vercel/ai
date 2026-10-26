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

export interface CompactionSummarizer {
  /** Includes summary instructions, framing, previous checkpoint and transcript. */
  maxInputTokens: number;
  maxOutputTokens: number;
  execute(input: {
    system: string;
    messages: ModelMessage[];
    maxOutputTokens: number;
    abortSignal?: AbortSignal;
  }): Promise<{ text: string; usage?: LanguageModelUsage }>;
}

interface SharedCompactionOptions {
  messages: readonly ModelMessage[];
  summarize?: CompactionSummarizer;
  checkpoint?: CompactionCheckpoint;
  /** Omit to infer the last user message outside the checkpoint; null disables inference. */
  currentUserMessageIndex?: number | null;
  /** Deterministic, finite, nonnegative message estimate. Fractions are rounded up. */
  estimateTokens?: (messages: readonly ModelMessage[]) => number;
  createMessage?: (
    message: ModelMessage,
    purpose: 'checkpoint' | 'continuation',
  ) => ModelMessage;
  describeMedia?: CompactionMediaDescriber;
  reason?: 'automatic' | 'manual' | 'overflow';
  abortSignal?: AbortSignal;
  onUsage?: (usage: LanguageModelUsage) => void | Promise<void>;
}

export type CompactMessagesOptions = SharedCompactionOptions &
  (
    | {
        context: CompactionMeasurement;
        /** Whole-request input limit, already reserving room for generation output. */
        targetInputTokens: number;
        strategy?: never;
        keepRecentMessages?: number;
        maxRecentTokens?: number;
        maxToolResultCharacters?: number;
        /** summarize-middle is lossy, including attachments that cannot fit. */
        oversizedUserMessage?: 'summarize-middle' | 'error';
      }
    | ({
        strategy: CompactionStrategy;
        keepRecentMessages?: never;
        maxRecentTokens?: never;
        maxToolResultCharacters?: never;
        oversizedUserMessage?: never;
      } & (
        | { context: CompactionMeasurement; targetInputTokens: number }
        | { context: UnmeasuredCompactionContext; targetInputTokens?: never }
      ))
  );

export type CompactionStrategyContext = (
  | (CompactionMeasurement & { targetInputTokens: number })
  | (UnmeasuredCompactionContext & { targetInputTokens?: undefined })
) & {
  checkpoint?: CompactionCheckpoint;
  currentUserMessageIndex: number | null;
  reason: 'automatic' | 'manual' | 'overflow';
  abortSignal?: AbortSignal;
  estimateTokens(messages: readonly ModelMessage[]): number;
  createMessage(
    message: ModelMessage,
    purpose: 'checkpoint' | 'continuation',
  ): ModelMessage;
  describeMedia?: CompactionMediaDescriber;
  /** Enforces summary budgets and records returned usage exactly once. */
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
