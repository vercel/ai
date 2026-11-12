import type { JSONValue } from '@ai-sdk/provider';
import type { InceptionModelIds } from '../inception-model-catalog';

export type InceptionDecisionModelId =
  | InceptionModelIds['decision']
  | (string & {});

/** Inception decision models do not support provider-specific options. */
export type InceptionDecisionModelOptions = Record<string, never>;

export type InceptionDecisionProviderMetadata = {
  /** Confidence for choice and score answers, keyed by question name. */
  confidence: Record<string, number>;
  /** Score level descriptions, keyed by question name and zero-based index. */
  legend: Record<string, Record<string, JSONValue>>;
};
