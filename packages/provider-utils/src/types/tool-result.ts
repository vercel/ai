/**
Typed tool result that is returned by `generateText` and `streamText`.
It contains the tool call ID, the tool name, the tool arguments, and the tool result.
 */
export interface ToolResult<NAME extends string, ARGS, RESULT> {
  /**
ID of the tool call. This ID is used to match the tool call with the tool result.
   */
  toolCallId: string;

  /**
Name of the tool that was called.
   */
  toolName: NAME;

  /**
Arguments of the tool call. This is a JSON-serializable object that matches the tool's input schema.
     */
  args: ARGS;

  /**
Result of the tool call. This is the result of the tool's execution.
     */
  result: RESULT;
}
