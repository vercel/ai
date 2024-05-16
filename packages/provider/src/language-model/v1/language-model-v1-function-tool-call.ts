export type LanguageModelV1FunctionToolCall = {
  toolCallType: 'function';
  toolCallId: string;
  toolName: string;

  /**
Stringified JSON object with the tool call arguments. Must match the
parameters schema of the tool.
   */
  args: string;
};
