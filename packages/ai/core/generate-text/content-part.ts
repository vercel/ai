import { ProviderMetadata } from '../types';
import { Source } from '../types/language-model';
import { GeneratedFile } from './generated-file';
import { ToolCallUnion } from './tool-call';
import { ToolErrorUnion, ToolResultUnion } from './tool-output';
import { ToolSet } from './tool-set';

export type ContentPart<TOOLS extends ToolSet> =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string; providerMetadata?: ProviderMetadata }
  | ({ type: 'source' } & Source)
  | { type: 'file'; file: GeneratedFile } // different because of GeneratedFile object
  | ({ type: 'tool-call' } & ToolCallUnion<TOOLS>)
  | ({ type: 'tool-result' } & ToolResultUnion<TOOLS>)
  | ({ type: 'tool-error' } & ToolErrorUnion<TOOLS>);
