/* eslint-disable react/jsx-key */
import { useChat } from '@ai-sdk/solid';
import { TextUIPart, ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { For, Show } from 'solid-js';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, addToolResult } =
    useChat({
      api: '/api/use-chat-tools',
      maxSteps: 5,

      // run client-side tools that are automatically executed:
      async onToolCall({ toolCall }) {
        if (toolCall.toolName === 'getLocation') {
          const cities = [
            'New York',
            'Los Angeles',
            'Chicago',
            'San Francisco',
          ];
          return cities[Math.floor(Math.random() * cities.length)];
        }
      },
    });

  return (
    <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <For each={messages()}>
        {message => (
          <div class="whitespace-pre-wrap">
            <strong>{`${message.role}: `}</strong>
            <For each={message.parts}>
              {part => (
                <>
                  <Show when={part.type === 'text'}>
                    {(part as TextUIPart).text}
                  </Show>
                  <Show when={part.type === 'tool-invocation'}>
                    {
                      <>
                        <Show
                          when={
                            (part as ToolInvocationUIPart).toolInvocation
                              .toolName === 'askForConfirmation'
                          }
                        >
                          <Show
                            when={
                              (part as ToolInvocationUIPart).toolInvocation
                                .state === 'call'
                            }
                          >
                            <div
                              data-key={
                                (part as ToolInvocationUIPart).toolInvocation
                                  .toolCallId
                              }
                              class="text-gray-500"
                            >
                              {
                                (part as ToolInvocationUIPart).toolInvocation
                                  .args.message
                              }
                              <div class="flex gap-2">
                                <button
                                  class="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                                  onClick={() =>
                                    addToolResult({
                                      toolCallId: (part as ToolInvocationUIPart)
                                        .toolInvocation.toolCallId,
                                      result: 'Yes, confirmed.',
                                    })
                                  }
                                >
                                  Yes
                                </button>
                                <button
                                  class="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700"
                                  onClick={() =>
                                    addToolResult({
                                      toolCallId: (part as ToolInvocationUIPart)
                                        .toolInvocation.toolCallId,
                                      result: 'No, denied',
                                    })
                                  }
                                >
                                  No
                                </button>
                              </div>
                            </div>
                          </Show>
                          <Show
                            when={
                              (part as ToolInvocationUIPart).toolInvocation
                                .state === 'result'
                            }
                          >
                            <div
                              data-key={
                                (part as ToolInvocationUIPart).toolInvocation
                                  .toolCallId
                              }
                              class="text-gray-500"
                            >
                              Location access allowed:{' '}
                              {(part as any).toolInvocation.result}
                            </div>
                          </Show>
                        </Show>

                        <Show
                          when={
                            (part as ToolInvocationUIPart).toolInvocation
                              .toolName === 'getLocation'
                          }
                        >
                          <Show
                            when={
                              (part as ToolInvocationUIPart).toolInvocation
                                .state === 'call'
                            }
                          >
                            <div class="text-gray-500">Getting location...</div>
                          </Show>
                          <Show
                            when={
                              (part as ToolInvocationUIPart).toolInvocation
                                .state === 'result' &&
                              (part as any).toolInvocation.result
                            }
                          >
                            <div class="text-gray-500">
                              Location: {(part as any).toolInvocation.result}
                            </div>
                          </Show>
                        </Show>

                        <Show
                          when={
                            (part as ToolInvocationUIPart).toolInvocation
                              .toolName === 'getWeatherInformation'
                          }
                        >
                          <Show
                            when={
                              (part as ToolInvocationUIPart).toolInvocation
                                .state === 'partial-call'
                            }
                          >
                            <pre>
                              {JSON.stringify(
                                (part as ToolInvocationUIPart).toolInvocation,
                                null,
                                2,
                              )}
                            </pre>
                          </Show>
                          <Show
                            when={
                              (part as ToolInvocationUIPart).toolInvocation
                                .state === 'call'
                            }
                          >
                            <div class="text-gray-500">
                              Getting weather information for{' '}
                              {
                                (part as ToolInvocationUIPart).toolInvocation
                                  .args.city
                              }
                              ...
                            </div>
                          </Show>

                          <Show
                            when={
                              (part as ToolInvocationUIPart).toolInvocation
                                .state === 'result'
                            }
                          >
                            <div class="text-gray-500">
                              Weather in{' '}
                              {(part as any).toolInvocation.args.city}:{' '}
                              {(part as any).toolInvocation.result}
                            </div>
                          </Show>
                        </Show>
                      </>
                    }
                  </Show>
                </>
              )}
            </For>
            <br />
          </div>
        )}
      </For>

      <form onSubmit={handleSubmit}>
        <input
          class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input()}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
