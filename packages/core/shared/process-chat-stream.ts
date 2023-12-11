import {
  ChatRequest,
  FunctionCall,
  JSONValue,
  Message,
  ToolCall,
} from './types';

export async function processChatStream({
  getStreamedResponse,
  experimental_onFunctionCall,
  experimental_onToolCall,
  updateChatRequest,
  getCurrentMessages,
  maxIterations = 1000,
}: {
  getStreamedResponse: () => Promise<
    Message | { messages: Message[]; data: JSONValue[] }
  >;
  experimental_onFunctionCall?: (
    chatMessages: Message[],
    functionCall: FunctionCall,
  ) => Promise<void | ChatRequest>;
  experimental_onToolCall?: (
    chatMessages: Message[],
    toolCalls: ToolCall[],
  ) => Promise<void | ChatRequest>;
  updateChatRequest: (chatRequest: ChatRequest) => void;
  getCurrentMessages: () => Message[];
  /**
   * The maximum number of times we expect the the API to loop on its own.
   */
  maxIterations?: number;
}) {
  let count = 0;
  while (count < maxIterations) {
    count++;
    // TODO-STREAMDATA: This should be {  const { messages: streamedResponseMessages, data } =
    // await getStreamedResponse(} once Stream Data is not experimental
    const messagesAndDataOrJustMessage = await getStreamedResponse();

    // Using experimental stream data
    if ('messages' in messagesAndDataOrJustMessage) {
      let hasFollowingResponse = false;
      for (const message of messagesAndDataOrJustMessage.messages) {
        // See if the message has a complete function call or tool call
        if (
          (message.function_call === undefined ||
            typeof message.function_call === 'string') &&
          (message.tool_calls === undefined ||
            typeof message.tool_calls === 'string')
        ) {
          continue;
        }

        hasFollowingResponse = true;
        // Try to handle function call
        if (experimental_onFunctionCall) {
          const functionCall = message.function_call;
          // Make sure functionCall is an object
          // If not, we got tool calls instead of function calls
          if (typeof functionCall !== 'object') {
            console.warn(
              'experimental_onFunctionCall should not be defined when using tools',
            );
            continue;
          }

          // User handles the function call in their own functionCallHandler.
          // The "arguments" key of the function call object will still be a string which will have to be parsed in the function handler.
          // If the "arguments" JSON is malformed due to model error the user will have to handle that themselves.

          const functionCallResponse: ChatRequest | void =
            await experimental_onFunctionCall(
              getCurrentMessages(),
              functionCall,
            );

          // If the user does not return anything as a result of the function call, the loop will break.
          if (functionCallResponse === undefined) {
            hasFollowingResponse = false;
            break;
          }

          // A function call response was returned.
          // The updated chat with function call response will be sent to the API in the next iteration of the loop.
          updateChatRequest(functionCallResponse);
        }
        // Try to handle tool call
        if (experimental_onToolCall) {
          const toolCalls = message.tool_calls;
          // Make sure toolCalls is an array of objects
          // If not, we got function calls instead of tool calls
          if (
            !Array.isArray(toolCalls) ||
            toolCalls.some(toolCall => typeof toolCall !== 'object')
          ) {
            console.warn(
              'experimental_onToolCall should not be defined when using tools',
            );
            continue;
          }

          // User handles the function call in their own functionCallHandler.
          // The "arguments" key of the function call object will still be a string which will have to be parsed in the function handler.
          // If the "arguments" JSON is malformed due to model error the user will have to handle that themselves.
          const toolCallResponse: ChatRequest | void =
            await experimental_onToolCall(getCurrentMessages(), toolCalls);

          // If the user does not return anything as a result of the function call, the loop will break.
          if (toolCallResponse === undefined) {
            hasFollowingResponse = false;
            break;
          }

          // A function call response was returned.
          // The updated chat with function call response will be sent to the API in the next iteration of the loop.
          updateChatRequest(toolCallResponse);
        }
      }
      if (!hasFollowingResponse) {
        break;
      }
    } else {
      const streamedResponseMessage = messagesAndDataOrJustMessage;

      // TODO-STREAMDATA: Remove this once Stream Data is not experimental
      if (
        (streamedResponseMessage.function_call === undefined ||
          typeof streamedResponseMessage.function_call === 'string') &&
        (streamedResponseMessage.tool_calls === undefined ||
          typeof streamedResponseMessage.tool_calls === 'string')
      ) {
        break;
      }

      // If we get here and are expecting a function call, the message should have one, if not warn and continue
      if (experimental_onFunctionCall) {
        const functionCall = streamedResponseMessage.function_call;
        if (!(typeof functionCall === 'object')) {
          console.warn(
            'experimental_onFunctionCall should not be defined when using tools',
          );
          continue;
        }
        const functionCallResponse: ChatRequest | void =
          await experimental_onFunctionCall(getCurrentMessages(), functionCall);

        // If the user does not return anything as a result of the function call, the loop will break.
        if (functionCallResponse === undefined) break;
        // A function call response was returned.
        // The updated chat with function call response will be sent to the API in the next iteration of the loop.
        fixFunctionCallArguments(functionCallResponse);
        updateChatRequest(functionCallResponse);
      }
      // If we get here and are expecting a tool call, the message should have one, if not warn and continue
      if (experimental_onToolCall) {
        const toolCalls = streamedResponseMessage.tool_calls;
        if (!(typeof toolCalls === 'object')) {
          console.warn(
            'experimental_onToolCall should not be defined when using functions',
          );
          continue;
        }
        const toolCallResponse: ChatRequest | void =
          await experimental_onToolCall(getCurrentMessages(), toolCalls);

        // If the user does not return anything as a result of the function call, the loop will break.
        if (toolCallResponse === undefined) break;
        // A function call response was returned.
        // The updated chat with function call response will be sent to the API in the next iteration of the loop.
        fixFunctionCallArguments(toolCallResponse);
        updateChatRequest(toolCallResponse);
      }

      // Make sure funtion call arguments are sent back to the API as a string
      function fixFunctionCallArguments(response: ChatRequest) {
        for (const message of response.messages) {
          if (message.tool_calls !== undefined) {
            for (const toolCall of message.tool_calls) {
              if (typeof toolCall === 'object') {
                if (
                  toolCall.function.arguments &&
                  typeof toolCall.function.arguments !== 'string'
                ) {
                  toolCall.function.arguments = JSON.stringify(
                    toolCall.function.arguments,
                  );
                }
              }
            }
          }
          if (message.function_call !== undefined) {
            if (typeof message.function_call === 'object') {
              if (
                message.function_call.arguments &&
                typeof message.function_call.arguments !== 'string'
              ) {
                message.function_call.arguments = JSON.stringify(
                  message.function_call.arguments,
                );
              }
            }
          }
        }
      }
    }
  }
  if (count >= maxIterations) {
    console.error(
      'Max iterations reached for processChatStream probably an infinite loop.',
    );
  }
}
