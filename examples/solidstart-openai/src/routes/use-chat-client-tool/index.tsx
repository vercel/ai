'use client';

import { ToolInvocation } from 'ai';
import { Message, useChat } from 'ai/solid';

export default function Chat() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    experimental_addToolResult,
  } = useChat({ api: '/api/use-chat-client-tool' });

  return (
    <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages()?.map((m: Message) => (
        <div class="whitespace-pre-wrap">
          <strong>{`${m.role}: `}</strong>
          {m.content}
          {m.toolInvocations?.map((toolInvocation: ToolInvocation) => {
            const toolCallId = toolInvocation.toolCallId;

            // render confirmation tool
            if (toolInvocation.toolName === 'askForConfirmation') {
              return (
                <div class="text-gray-500">
                  {toolInvocation.args.message}
                  <div class="flex gap-2">
                    {'result' in toolInvocation ? (
                      <b>{toolInvocation.result}</b>
                    ) : (
                      <>
                        <button
                          class="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                          onClick={() =>
                            experimental_addToolResult({
                              toolCallId,
                              result: 'Yes, confirmed.',
                            })
                          }
                        >
                          Yes
                        </button>
                        <button
                          class="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700"
                          onClick={() =>
                            experimental_addToolResult({
                              toolCallId,
                              result: 'No, denied',
                            })
                          }
                        >
                          No
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            }

            // other tools:
            return 'result' in toolInvocation ? (
              <div class="text-gray-500">
                <strong>{`${toolInvocation.toolName}: `}</strong>
                {toolInvocation.result}
              </div>
            ) : (
              <div class="text-gray-500">
                Calling {toolInvocation.toolName}...
              </div>
            );
          })}
          <br />
          <br />
        </div>
      ))}

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
