/**
 * Tool call deltas are only needed for object generation modes.
 * The tool call deltas must be partial JSON strings.
 */
export type LanguageModelV2ToolCallDelta = {
  toolCallType: 'function';
  toolCallId: string;
  toolName: string;
  argsTextDelta: string;
};
