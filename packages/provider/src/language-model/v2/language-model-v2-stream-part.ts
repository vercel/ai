import { SharedV2ProviderMetadata } from '../../shared/v2/shared-v2-provider-metadata';
import { LanguageModelV2CallWarning } from './language-model-v2-call-warning';
import { LanguageModelV2Content } from './language-model-v2-content';
import { LanguageModelV2FinishReason } from './language-model-v2-finish-reason';
import { LanguageModelV2ResponseMetadata } from './language-model-v2-response-metadata';
import { LanguageModelV2ToolCallDelta } from './language-model-v2-tool-call-delta';
import { LanguageModelV2Usage } from './language-model-v2-usage';

export type LanguageModelV2StreamPart =
  // Content (similar to doGenerate):
  | LanguageModelV2Content

  // Reasoning part end marker:
  | { type: 'reasoning-part-finish' }

  // Tool calls delta:
  | LanguageModelV2ToolCallDelta

  // stream start event with warnings for the call, e.g. unsupported settings:
  | {
      type: 'stream-start';
      warnings: Array<LanguageModelV2CallWarning>;
    }

  // metadata for the response.
  // separate stream part so it can be sent once it is available.
  | ({ type: 'response-metadata' } & LanguageModelV2ResponseMetadata)

  // metadata that is available after the stream is finished:
  | {
      type: 'finish';
      usage: LanguageModelV2Usage;
      finishReason: LanguageModelV2FinishReason;
      providerMetadata?: SharedV2ProviderMetadata;
    }

  // error parts are streamed, allowing for multiple errors
  | {
      type: 'error';
      error: unknown;
    };
