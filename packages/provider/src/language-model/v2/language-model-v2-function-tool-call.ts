/**
A function tool call.
 */
export type LanguageModelV2FunctionToolCall = {
  /**
The type of tool call.
   */
  toolCallType: 'function';

  /**
The ID of the tool call.
   */
  toolCallId: string;

  /**
The name of the tool.
   */
  toolName: string;

  /**
Stringified JSON object with the tool call arguments. Must match the
parameters schema of the tool.
   */
  args: string;
};
