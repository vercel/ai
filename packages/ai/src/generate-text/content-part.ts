import type { ToolSet } from '@ai-sdk/provider-utils';
import { ProviderMetadata } from '../types';
import { Source } from '../types/language-model';
import { GeneratedFile } from './generated-file';
import { ReasoningFileOutput, ReasoningOutput } from './reasoning-output';
import { ToolApprovalRequestOutput } from './tool-approval-request-output';
import { ToolApprovalResponseOutput } from './tool-approval-response-output';
import { TypedToolCall } from './tool-call';
import { TypedToolError } from './tool-error';
import { TypedToolResult } from './tool-result';

export type ContentPart<TOOLS extends ToolSet> =
  | { type: 'text'; text: string; providerMetadata?: ProviderMetadata }
  | {
      type: 'custom';
      kind: `${string}.${string}`;
      providerMetadata?: ProviderMetadata;
    }
  | ReasoningOutput
  | ReasoningFileOutput
  | ({ type: 'source' } & Source)
  | { type: 'file'; file: GeneratedFile; providerMetadata?: ProviderMetadata }
  | ({ type: 'tool-call' } & TypedToolCall<TOOLS> & {
        providerMetadata?: ProviderMetadata;
      })
  | ({ type: 'tool-result' } & TypedToolResult<TOOLS> & {
        providerMetadata?: ProviderMetadata;
      })
  | ({ type: 'tool-error' } & TypedToolError<TOOLS> & {
        providerMetadata?: ProviderMetadata;
      })
  | ToolApprovalRequestOutput<TOOLS>
  | ToolApprovalResponseOutput<TOOLS>;
