import { ContextRegistry } from '@ai-sdk/provider-utils';
import { ProviderMetadata } from '../types';
import { Source } from '../types/language-model';
import { GeneratedFile } from './generated-file';
import { ToolApprovalRequestOutput } from './tool-approval-request-output';
import { ReasoningOutput } from './reasoning-output';
import { TypedToolCall } from './tool-call';
import { TypedToolError } from './tool-error';
import { TypedToolResult } from './tool-result';
import { ToolSet } from './tool-set';

export type ContentPart<
  CONTEXT extends Partial<ContextRegistry>,
  TOOLS extends ToolSet<CONTEXT> = ToolSet<CONTEXT>,
> =
  | { type: 'text'; text: string; providerMetadata?: ProviderMetadata }
  | ReasoningOutput
  | ({ type: 'source' } & Source)
  | { type: 'file'; file: GeneratedFile; providerMetadata?: ProviderMetadata } // different because of GeneratedFile object
  | ({ type: 'tool-call' } & TypedToolCall<CONTEXT, TOOLS> & {
        providerMetadata?: ProviderMetadata;
      })
  | ({ type: 'tool-result' } & TypedToolResult<CONTEXT, TOOLS> & {
        providerMetadata?: ProviderMetadata;
      })
  | ({ type: 'tool-error' } & TypedToolError<CONTEXT, TOOLS> & {
        providerMetadata?: ProviderMetadata;
      })
  | ToolApprovalRequestOutput<CONTEXT, TOOLS>;
