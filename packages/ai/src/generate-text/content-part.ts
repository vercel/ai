import { ProviderMetadata } from '../types';
import { Source } from '../types/language-model';
import { GeneratedFile } from './generated-file';
import { TypedToolCall } from './tool-call';
import { ToolErrorUnion, ToolResultUnion } from './tool-output';
import { ToolSet } from './tool-set';

export type ContentPart<TOOLS extends ToolSet> =
  | { type: 'text'; text: string; providerMetadata?: ProviderMetadata }
  | { type: 'reasoning'; text: string; providerMetadata?: ProviderMetadata }
  | ({ type: 'source' } & Source)
  | { type: 'file'; file: GeneratedFile; providerMetadata?: ProviderMetadata } // different because of GeneratedFile object
  | ({ type: 'tool-call' } & TypedToolCall<TOOLS> & {
        providerMetadata?: ProviderMetadata;
      })
  | ({ type: 'tool-result' } & ToolResultUnion<TOOLS> & {
        providerMetadata?: ProviderMetadata;
      })
  | ({ type: 'tool-error' } & ToolErrorUnion<TOOLS> & {
        providerMetadata?: ProviderMetadata;
      });
