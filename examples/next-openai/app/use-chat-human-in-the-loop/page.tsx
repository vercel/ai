'use client';

import { Message, useChat } from '@ai-sdk/react';
import {
  APPROVAL,
  getToolsRequiringConfirmation,
} from '../api/use-chat-human-in-the-loop/utils';
import { tools } from '../api/use-chat-human-in-the-loop/tools';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, addToolResult } =
    useChat({
      api: '/api/use-chat-human-in-the-loop',
      maxSteps: 5,
    });

  const toolsRequiringConfirmation = getToolsRequiringConfirmation(tools);

  const pendingToolCallConfirmation = messages.some((m: Message) =>
    m.parts?.some(
      part =>
        part.type === 'tool-invocation' &&
        part.toolInvocation.state === 'call' &&
        toolsRequiringConfirmation.includes(part.toolInvocation.toolName),
    ),
  );

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages?.map((m: Message) => (
        <div key={m.id} className="whitespace-pre-wrap">
          <strong>{`${m.role}: `}</strong>
          {m.parts?.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <div key={i}>{part.text}</div>;
              case 'tool-invocation':
                const toolInvocation = part.toolInvocation;
                const toolCallId = toolInvocation.toolCallId;
                const dynamicInfoStyles = 'font-mono bg-gray-100 p-1 text-sm';

                // render confirmation tool (client-side tool with user interaction)
                if (
                  toolsRequiringConfirmation.includes(
                    toolInvocation.toolName,
                  ) &&
                  toolInvocation.state === 'call'
                ) {
                  return (
                    <div key={toolCallId} className="text-gray-500">
                      Run{' '}
                      <span className={dynamicInfoStyles}>
                        {toolInvocation.toolName}
                      </span>{' '}
                      with args:{' '}
                      <span className={dynamicInfoStyles}>
                        {JSON.stringify(toolInvocation.args)}
                      </span>
                      <div className="flex gap-2 pt-2">
                        <button
                          className="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                          onClick={() =>
                            addToolResult({
                              toolCallId,
                              result: APPROVAL.YES,
                            })
                          }
                        >
                          Yes
                        </button>
                        <button
                          className="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700"
                          onClick={() =>
                            addToolResult({
                              toolCallId,
                              result: APPROVAL.NO,
                            })
                          }
                        >
                          No
                        </button>
                      </div>
                    </div>
                  );
                }
            }
          })}
          <br />
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          disabled={pendingToolCallConfirmation}
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
