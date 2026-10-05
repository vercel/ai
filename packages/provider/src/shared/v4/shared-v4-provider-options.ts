import type { EmbeddingModelV4 } from '../../embedding-model';
import type { EvaluationModelV4 } from '../../evaluation-model/v4/evaluation-model-v4';
import type { FilesV4 } from '../../files';
import type { ImageModelV4 } from '../../image-model';
import type { JSONObject } from '../../json-value/json-value';
import type { LanguageModelV4 } from '../../language-model';
import type { RealtimeModelV4 } from '../../realtime-model/v4/realtime-model-v4';
import type { RerankingModelV4 } from '../../reranking-model';
import type { SkillsV4 } from '../../skills';
import type { SpeechModelV4 } from '../../speech-model';
import type { SpeechTranslationModelV4 } from '../../speech-translation-model/v4/speech-translation-model-v4';
import type { TranscriptionModelV4 } from '../../transcription-model';
import type { VideoModelV4 } from '../../video-model/v4/video-model-v4';

/**
 * Additional provider-specific options.
 * Options are additional input to the provider.
 * They are passed through to the provider from the AI SDK
 * and enable provider-specific functionality
 * that can be fully encapsulated in the provider.
 *
 * This enables us to quickly ship provider-specific functionality
 * without affecting the core AI SDK.
 *
 * The outer record is keyed by the provider name, and the inner
 * record is keyed by the provider-specific metadata key.
 *
 * ```ts
 * {
 *   "anthropic": {
 *     "cacheControl": { "type": "ephemeral" }
 *   }
 * }
 * ```
 */
export type SharedV4ProviderOptions = Record<string, JSONObject>;

export type InferSharedV4ProviderOptions<T> = T extends
  | EmbeddingModelV4<infer OPTIONS>
  | EvaluationModelV4<infer OPTIONS>
  | FilesV4<infer OPTIONS>
  | ImageModelV4<infer OPTIONS>
  | LanguageModelV4<infer OPTIONS>
  | RealtimeModelV4<infer OPTIONS>
  | RerankingModelV4<infer OPTIONS>
  | SkillsV4<infer OPTIONS>
  | SpeechModelV4<infer OPTIONS>
  | SpeechTranslationModelV4<infer OPTIONS>
  | TranscriptionModelV4<infer OPTIONS>
  | VideoModelV4<infer OPTIONS>
  ? OPTIONS
  : SharedV4ProviderOptions;
