import { MessageGeneratorStreamPart } from './message-generator';

export type ToolResultMessageStreamPart = {
  type: 'tool-result';
  id: string | null;
  result: unknown;
};

export type MessageStreamPart =
  | MessageGeneratorStreamPart
  | ToolResultMessageStreamPart;
