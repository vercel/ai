export type LanguageModelV2ToolCallDelta = {
  type: 'tool-call-delta';

  toolCallType: 'function';
  toolCallId: string;
  toolName: string;

  // The tool call deltas must be partial JSON strings.
  argsTextDelta: string;
};
