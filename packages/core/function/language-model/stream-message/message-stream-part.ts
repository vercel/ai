import { LanguageModelStreamPart } from '../language-model/language-model';

export type ToolResultMessageStreamPart = {
  type: 'tool-result';
  id: string | null;
  result: unknown;
};

export type MessageStreamPart =
  | LanguageModelStreamPart
  | ToolResultMessageStreamPart;
