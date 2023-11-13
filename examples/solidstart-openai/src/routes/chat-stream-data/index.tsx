import { For, JSX } from 'solid-js';
import { useChat } from 'ai/solid';

export default function Chat() {
  const { messages, input, setInput, handleSubmit, data } = useChat({
    api: '/api/chat-stream-data',
  });

  const handleInputChange: JSX.ChangeEventHandlerUnion<
    HTMLInputElement,
    Event
  > = e => {
    setInput(e.target.value);
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
          <div class="whitespace-pre-wrap">
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
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
