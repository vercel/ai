import { Message } from 'ai';
import { useChat } from '@ai-sdk/solid';
import { For, JSX } from 'solid-js';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, data } = useChat({
    api: '/api/chat-with-tools',
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
    <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <div class="bg-gray-200 mb-8">
        <For each={data()}>
          {item => (
            <pre class="whitespace-pre-wrap">{JSON.stringify(item)}</pre>
          )}
        </For>
      </div>

      <For each={messages()}>
        {m => (
          <div
            class="whitespace-pre-wrap"
            style={{ color: roleToColorMap[m.role] }}
          >
            <strong>{`${m.role}: `}</strong>
            {m.content || JSON.stringify(m.function_call)}
            <br />
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
