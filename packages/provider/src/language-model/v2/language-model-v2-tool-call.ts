/**
Tool calls that the model has generated.
     */
export type LanguageModelV2ToolCall = {
  type: 'tool-call';

  toolCallType: 'function';
  toolCallId: string;
  toolName: string;

  /**
Stringified JSON object with the tool call arguments. Must match the
parameters schema of the tool.
   */
  args: string;
};
