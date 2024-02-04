'use client';

import { ChatRequest, ToolCallHandler, nanoid } from 'ai';
import { Message, useChat } from 'ai/react';

export default function Chat() {
  const toolCallHandler: ToolCallHandler = async (chatMessages, toolCalls) => {
    let handledFunction = false;
    for (const tool of toolCalls) {
      if (tool.type === 'function') {
        const { name, arguments: args } = tool.function;

        if (name === 'eval_code_in_browser') {
          // Parsing here does not always work since it seems that some characters in generated code aren't escaped properly.
          const parsedFunctionCallArguments: { code: string } =
            JSON.parse(args);

          // WARNING: Do NOT do this in real-world applications!
          eval(parsedFunctionCallArguments.code);

          const result = parsedFunctionCallArguments.code;

          if (result) {
            handledFunction = true;

            chatMessages.push({
              id: nanoid(),
              tool_call_id: tool.id,
              name: tool.function.name,
              role: 'tool' as const,
              content: result,
            });
          }
        }
      }
    }

    if (handledFunction) {
      const toolResponse: ChatRequest = { messages: chatMessages };
      return toolResponse;
    }
  };

  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat-with-tools',
    experimental_onToolCall: toolCallHandler,
  });

  // Generate a map of message role to text color
  const roleToColorMap: Record<Message['role'], string> = {
    system: 'red',
    user: 'black',
    function: 'blue',
    tool: 'purple',
    assistant: 'green',
    data: 'orange',
  };

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.length > 0
        ? messages.map((m: Message) => (
            <div
              key={m.id}
              className="whitespace-pre-wrap"
              style={{ color: roleToColorMap[m.role] }}
            >
              <strong>{`${m.role}: `}</strong>
              {m.content || JSON.stringify(m.function_call)}
              <br />
              <br />
            </div>
          ))
        : null}
      <div id="chart-goes-here"></div>
      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
