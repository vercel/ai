import { SharedV3ProviderMetadata } from '../../shared/v3/shared-v3-provider-metadata';
import { SharedV3Warning } from '../../shared/v3/shared-v3-warning';
import { LanguageModelV4File } from './language-model-v4-file';
import { LanguageModelV4FinishReason } from './language-model-v4-finish-reason';
import { LanguageModelV4ReasoningFile } from './language-model-v4-reasoning-file';
import { LanguageModelV4ResponseMetadata } from './language-model-v4-response-metadata';
import { LanguageModelV4Source } from './language-model-v4-source';
import { LanguageModelV4ToolApprovalRequest } from './language-model-v4-tool-approval-request';
import { LanguageModelV4ToolCall } from './language-model-v4-tool-call';
import { LanguageModelV4ToolResult } from './language-model-v4-tool-result';
import { LanguageModelV4Usage } from './language-model-v4-usage';

export type LanguageModelV4StreamPart =
  // Text blocks:
  | {
      type: 'text-start';
      providerMetadata?: SharedV3ProviderMetadata;
      id: string;
    }
  | {
      type: 'text-delta';
      id: string;
      providerMetadata?: SharedV3ProviderMetadata;
      delta: string;
    }
  | {
      type: 'text-end';
      providerMetadata?: SharedV3ProviderMetadata;
      id: string;
    }

  // Reasoning blocks:
  | {
      type: 'reasoning-start';
      providerMetadata?: SharedV3ProviderMetadata;
      id: string;
    }
  | {
      type: 'reasoning-delta';
      id: string;
      providerMetadata?: SharedV3ProviderMetadata;
      delta: string;
    }
  | {
      type: 'reasoning-end';
      id: string;
      providerMetadata?: SharedV3ProviderMetadata;
    }

  // Tool calls and results:
  | {
      type: 'tool-input-start';
      id: string;
      toolName: string;
      providerMetadata?: SharedV3ProviderMetadata;
      providerExecuted?: boolean;
      dynamic?: boolean;
      title?: string;
    }
  | {
      type: 'tool-input-delta';
      id: string;
      delta: string;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | {
      type: 'tool-input-end';
      id: string;
      providerMetadata?: SharedV3ProviderMetadata;
    }
  | LanguageModelV4ToolApprovalRequest
  | LanguageModelV4ToolCall
  | LanguageModelV4ToolResult

  // Files and sources:
  | LanguageModelV4File
  | LanguageModelV4ReasoningFile
  | LanguageModelV4Source

  // stream start event with warnings for the call, e.g. unsupported settings:
  | {
      type: 'stream-start';
      warnings: Array<SharedV3Warning>;
    }

  // metadata for the response.
  // separate stream part so it can be sent once it is available.
  | ({ type: 'response-metadata' } & LanguageModelV4ResponseMetadata)

  // metadata that is available after the stream is finished:
  | {
      type: 'finish';
      usage: LanguageModelV4Usage;
      finishReason: LanguageModelV4FinishReason;
      providerMetadata?: SharedV3ProviderMetadata;
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
