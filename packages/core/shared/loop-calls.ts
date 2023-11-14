import { ChatRequest, FunctionCall, Message } from './types';

export async function loopCalls({
  getStreamedResponse,
  experimental_onFunctionCall,
  updateChatRequest,
  getCurrentMessages,
}: {
  getStreamedResponse: () => Promise<
    Message | { messages: Message[]; data: any }
  >;
  experimental_onFunctionCall?: (
    chatMessages: Message[],
    functionCall: FunctionCall,
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
        if (
          message.function_call === undefined ||
          typeof message.function_call === 'string'
        ) {
          continue;
        }
        hasFollowingResponse = true;
        // Streamed response is a function call, invoke the function call handler if it exists.
        if (experimental_onFunctionCall) {
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
      }
      if (!hasFollowingResponse) {
        break;
      }
    } else {
      const streamedResponseMessage = messagesAndDataOrJustMessage;
      // TODO-STREAMDATA: Remove this once Stream Data is not experimental
      if (
        streamedResponseMessage.function_call === undefined ||
        typeof streamedResponseMessage.function_call === 'string'
      ) {
        break;
      }

      // Streamed response is a function call, invoke the function call handler if it exists.
      if (experimental_onFunctionCall) {
        const functionCall = streamedResponseMessage.function_call;
        const functionCallResponse: ChatRequest | void =
          await experimental_onFunctionCall(getCurrentMessages(), functionCall);

        // If the user does not return anything as a result of the function call, the loop will break.
        if (functionCallResponse === undefined) break;
        // A function call response was returned.
        // The updated chat with function call response will be sent to the API in the next iteration of the loop.
        updateChatRequest(functionCallResponse);
      }
    }
  }
}
