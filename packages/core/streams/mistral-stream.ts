import { ChatCompletionResponseChunk } from '@mistralai/mistralai';
import {
  ToolCallPayload,
  createCallbacksTransformer,
  readableFromAsyncIterable,
  type AIStreamCallbacksAndOptions,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';
import { CreateMessage, JSONValue, ToolCall } from '../shared/types';
import { formatStreamPart } from '../shared/stream-parts';

const __internal__MistralFnMessagesSymbol = Symbol(
  'internal_mistral_fn_messages',
);

type MistralResponse = AsyncGenerator<
  ChatCompletionResponseChunk,
  void,
  unknown
>;

type MistralStreamCallbacksAndOptions = AIStreamCallbacksAndOptions & {
  /**
   * @example
   * ```js
   * const response = mistral.chatStream({
   *   model: 'mistral-large-latest',
   *   stream: true,
   *   messages,
   *   tools,
   *   tool_choice: "auto", // auto is default, but we'll be explicit
   * })
   *
   * const stream = MistralStream(response, {
   *   experimental_onToolCall: async (toolCallPayload, appendToolCallMessages) => {
   *    let messages: CreateMessage[] = []
   *    //   There might be multiple tool calls, so we need to iterate through them
   *    for (const tool of toolCallPayload.tools) {
   *     // ... run your custom logic here
   *     const result = await myFunction(tool.function)
   *    // Append the relevant "assistant" and "tool" call messages
   *     appendToolCallMessage({tool_call_id:tool.id, function_name:tool.function.name, tool_call_result:result})
   *    }
   *     // Ask for another completion, or return a string to send to the client as an assistant message.
   *     return mistral.chatStream({
   *       model: 'mistral-large-latest',
   *       stream: true,
   *       // Append the results messages, calling appendToolCallMessage without
   *       // any arguments will jsut return the accumulated messages
   *       messages: [...messages, ...appendToolCallMessage()],
   *       tools,
   *       tool_choice: "auto", // auto is default, but we'll be explicit
   *     })
   *   }
   * })
   * ```
   */
  experimental_onToolCall?: (
    toolCallPayload: ToolCallPayload,
    appendToolCallMessage: (result?: {
      tool_call_id: string;
      function_name: string;
      tool_call_result: JSONValue;
    }) => CreateMessage[],
  ) => Promise<undefined | void | string | MistralResponse>;
};

async function* streamable(
  stream: AsyncIterable<ChatCompletionResponseChunk>,
  callbacks: MistralStreamCallbacksAndOptions & {
    [__internal__MistralFnMessagesSymbol]?: CreateMessage[];
  } = {},
) {
  let aggregatedFinalCompletionResponse = '';

  let functionCallMessages: CreateMessage[] =
    callbacks[__internal__MistralFnMessagesSymbol] || [];

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    const message = choice?.delta?.content ?? '';

    aggregatedFinalCompletionResponse += message;

    if (choice.delta.tool_calls) {
      const toolCalls: ToolCallPayload = {
        tools: [],
      };
      for (const tool of choice.delta.tool_calls) {
        toolCalls.tools.push({
          id: tool.id,
          type: 'function',
          func: {
            name: tool.function.name,
            arguments: JSON.parse(tool.function.arguments),
          },
        });
      }

      let newFunctionCallMessages: CreateMessage[] = [...functionCallMessages];
      let responseIndex = 0;

      const functionResponse = await callbacks.experimental_onToolCall?.(
        toolCalls,
        result => {
          if (result) {
            const { tool_call_id, function_name, tool_call_result } = result;
            // Append the function call request and result messages to the list
            newFunctionCallMessages = [
              ...newFunctionCallMessages,
              // Only append the assistant message if it's the first response
              ...(responseIndex === 0
                ? [
                    {
                      role: 'assistant' as const,
                      content: '',
                      tool_calls: choice.delta.tool_calls?.map(
                        (tc: ToolCall) => ({
                          id: tc.id,
                          type: 'function',
                          function: {
                            name: tc.function.name,
                            // we send the arguments an object to the user, but as the API expects a string, we need to stringify it
                            arguments: JSON.stringify(tc.function.arguments),
                          },
                        }),
                      ),
                    },
                  ]
                : []),
              // Append the function call result message
              {
                role: 'tool',
                tool_call_id,
                name: function_name,
                content: JSON.stringify(tool_call_result),
              },
            ];
            responseIndex++;
          }
          return newFunctionCallMessages;
        },
      );

      if (!functionResponse) {
        // The user didn't do anything with the function call on the server and wants
        // to either do nothing or run it on the client
        // so we just return the function call as a message

        yield formatStreamPart('tool_calls', {
          tool_calls: choice.delta.tool_calls,
        });
        continue;
      }

      if (typeof functionResponse === 'string') {
        // The user returned a string, so we just return it as a message
        yield formatStreamPart('text', functionResponse);
        aggregatedFinalCompletionResponse = functionResponse;
        continue;
      }

      // Recursively:

      const mistralStream: AsyncGenerator<string, void, unknown> = streamable(
        functionResponse,
        {
          callbacks,
          [__internal__MistralFnMessagesSymbol]: newFunctionCallMessages,
        } as AIStreamCallbacksAndOptions,
      );

      for await (const message of mistralStream) {
        yield message;
      }
    }

    if (message === undefined || message === '') {
      continue;
    }

    yield message;
  }
}

export function MistralStream(
  response: MistralResponse,
  callbacks?: MistralStreamCallbacksAndOptions,
): ReadableStream {
  const stream = readableFromAsyncIterable(streamable(response, callbacks));
  return stream
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(createStreamDataTransformer());
}
