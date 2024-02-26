export type ToolResultStreamPart = {
  type: 'tool-result';
  id: string | null;
  result: unknown;
};
