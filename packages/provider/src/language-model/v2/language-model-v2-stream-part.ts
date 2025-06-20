import { SharedV2ProviderMetadata } from '../../shared/v2/shared-v2-provider-metadata';
import { LanguageModelV2CallWarning } from './language-model-v2-call-warning';
import { LanguageModelV2File } from './language-model-v2-file';
import { LanguageModelV2FinishReason } from './language-model-v2-finish-reason';
import { LanguageModelV2ResponseMetadata } from './language-model-v2-response-metadata';
import { LanguageModelV2Source } from './language-model-v2-source';
import { LanguageModelV2Usage } from './language-model-v2-usage';

export type LanguageModelV2StreamPart =
  // Text blocks:
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }

  // Reasoning blocks:
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-delta'; id: string; delta: string }
  | { type: 'reasoning-end'; id: string }

  // Tool calls:
  | { type: 'tool-input-start'; id: string; toolName: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-input-end'; id: string }
  | {
      type: 'tool-call';
      id: string;
      toolName: string;

      /**
  Stringified JSON object with the tool call arguments. Must match the
  parameters schema of the tool.
     */
      input: string;
    }

  // Files and sources:
  | LanguageModelV2File
  | LanguageModelV2Source

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

  // raw chunks if enabled
  | {
      type: 'raw';
      rawValue: unknown;
    }

  // error parts are streamed, allowing for multiple errors
  | {
      type: 'error';
      error: unknown;
    };
