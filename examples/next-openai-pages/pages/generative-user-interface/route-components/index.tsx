import { ToolInvocation } from 'ai';
import { useChat } from 'ai/react';

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, addToolResult } =
    useChat({
      api: '/api/generative-ui-route',
      maxSteps: 5,
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

  const renderToolResult = (tool: ToolInvocation) => {
    const toolCallId = tool.toolCallId;

    // render confirmation tool (client-side tool with user interaction)
    if (tool.toolName === 'askForConfirmation') {
      return (
        <div key={toolCallId} className="flex flex-col gap-2 text-gray-500">
          {tool.args.message}
          <div className="flex gap-2">
            {'result' in tool ? (
              <div>{tool.result}</div>
            ) : (
              <>
                <button
                  className="px-2 py-1 text-white bg-blue-500 rounded hover:bg-blue-700"
                  onClick={() =>
                    addToolResult({
                      toolCallId,
                      result: 'Yes, confirmed.',
                    })
                  }
                >
                  Yes
                </button>
                <button
                  className="px-2 py-1 text-white bg-red-500 rounded hover:bg-red-700"
                  onClick={() =>
                    addToolResult({
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
    return 'result' in tool ? (
      tool.toolName === 'getWeatherInformation' ? (
        <div
          key={toolCallId}
          className="flex flex-col gap-2 p-4 bg-blue-400 rounded-lg"
        >
          <div className="flex flex-row items-center justify-between">
            <div className="text-4xl font-medium text-blue-50">
              {tool.result.value}°{tool.result.unit === 'celsius' ? 'C' : 'F'}
            </div>

            <div className="flex-shrink-0 rounded-full h-9 w-9 bg-amber-300" />
          </div>
          <div className="flex flex-row justify-between gap-2 text-blue-50">
            {tool.result.weeklyForecast.map((forecast: any) => (
              <div key={forecast.day} className="flex flex-col items-center">
                <div className="text-sm">{forecast.day}</div>
                <div className="">{forecast.value}°</div>
              </div>
            ))}
          </div>
        </div>
      ) : tool.toolName === 'getLocation' ? (
        <div
          key={toolCallId}
          className="p-4 text-gray-500 bg-gray-100 rounded-lg"
        >
          User is in {tool.result}.
        </div>
      ) : (
        <div key={toolCallId} className="text-gray-500">
          Tool call {`${tool.toolName}: `}
          {tool.result}
        </div>
      )
    ) : (
      <div key={toolCallId} className="text-gray-500">
        Calling {tool.toolName}...
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 p-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="w-24 text-zinc-500">{`${
              message.toolInvocations ? 'tool' : message.role
            }: `}</div>
            <div className="w-full">
              {message.toolInvocations
                ? message.toolInvocations.map(tool => renderToolResult(tool))
                : message.content}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="fixed bottom-0 w-full p-2">
        <input
          value={input}
          placeholder="Send message..."
          onChange={handleInputChange}
          className="w-full p-2 bg-zinc-100"
        />
      </form>
    </div>
  );
}
