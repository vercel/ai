import {
  ChatRequest,
  FunctionCall,
  JSONValue,
  Message,
  ToolCall,
  ToolExecutionMessage,
} from './types';

export async function processChatStream({
  getStreamedResponse,
  experimental_onFunctionCall,
  experimental_onToolCall,
  experimental_onToolExecution,
  updateChatRequest,
  getCurrentMessages,
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
  experimental_onToolExecution?: (
    chatMessages: Message[],
    toolExecutionMessage: ToolExecutionMessage,
  ) => Promise<void | ChatRequest>;
  updateChatRequest: (chatRequest: ChatRequest) => void;
  getCurrentMessages: () => Message[];
}) {
  while (true) {
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
            typeof message.tool_calls === 'string') &&
          (message.role !== 'tool')
        ) {
          continue;
        }

        hasFollowingResponse = true;
        // Log warnings for misused handlers (message has function_call and experimental_onToolCall should not be defined at the same time)
        if (experimental_onFunctionCall && message.tool_calls !== undefined) {
          console.warn(
            'experimental_onFunctionCall should not be defined when using tools',
          );
        }
        if (experimental_onToolCall && message.function_call !== undefined) {
          console.warn(
            'experimental_onToolCall should not be defined when using functions',
          );
        }
        // Try to handle function call
        if (experimental_onFunctionCall && typeof message.function_call === 'object') {
          const functionCall = message.function_call;
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
        // Check if the tool_calls is an array of objects
        if (experimental_onToolCall && (
          Array.isArray(message.tool_calls) &&
          message.tool_calls.every(toolCall => typeof toolCall === 'object')
        )) {
          const toolCalls = message.tool_calls;
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

        // try to handle tool execution
        if (experimental_onToolExecution && message.role === 'tool' && typeof message.content === 'string' && message.tool_call_id !== undefined && message.name !== undefined) {
          // The message is a tool execution message.
          const toolExecutionMessage: ToolExecutionMessage = {
            id: message.id,
            role: message.role,
            content: message.content,
            tool_call_id: message.tool_call_id,
            name: message.name,
          };
          // User handles the tool execution in their own toolExecutionHandler.
          const toolExecutionResponse: ChatRequest | void =
            await experimental_onToolExecution(
              getCurrentMessages(),
              toolExecutionMessage,
            );

          // If the user does not return anything as a result of the tool execution, the loop will break.
          if (toolExecutionResponse === undefined) {
            hasFollowingResponse = false;
            break;
          }

          // A tool execution response was returned.
          // The updated chat with tool execution response will be sent to the API in the next iteration of the loop.
          updateChatRequest(toolExecutionResponse);
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

      // Make sure function call arguments are sent back to the API as a string
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
}
