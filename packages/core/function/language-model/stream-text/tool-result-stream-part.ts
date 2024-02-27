export type ToolResultStreamPart = {
  type: 'tool-result';
  toolCallId: string | null;
  result: unknown;
};
