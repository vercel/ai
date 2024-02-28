export type ToolResultStreamPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
};
