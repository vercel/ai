/**
 * A conversation item that can be created by the client and sent to
 * the model via the conversation.item.create event.
 */
export type RealtimeModelV1ConversationItem =
  | RealtimeModelV1TextMessage
  | RealtimeModelV1AudioMessage
  | RealtimeModelV1FunctionCallOutput;

/**
 * A text message from the user.
 */
export type RealtimeModelV1TextMessage = {
  type: 'text-message';
  role: 'user';
  text: string;
};

/**
 * An audio message from the user (complete audio, not streamed).
 */
export type RealtimeModelV1AudioMessage = {
  type: 'audio-message';
  role: 'user';

  /**
   * Base64-encoded audio data.
   */
  audio: string;
};

/**
 * The output of a function call, sent back to the model so it can
 * continue generating a response using the tool result.
 */
export type RealtimeModelV1FunctionCallOutput = {
  type: 'function-call-output';

  /**
   * The call ID from the function-call-arguments-done event.
   * Must match so the model knows which function call this result is for.
   */
  callId: string;

  /**
   * JSON string containing the function call result.
   */
  output: string;
};
