import { For, Show } from 'solid-js';
import { useChat } from '@ai-sdk/solid';

export default function Chat() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    data,
    setData,
    isLoading,
    error,
    stop,
    reload,
  } = useChat({ api: '/api/use-chat-streamdata' });

  return (
    <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <Show when={data()}>
        <pre class="p-4 text-sm bg-gray-100">
          {JSON.stringify(data(), null, 2)}
        </pre>
        <button
          onClick={() => setData(undefined)}
          class="px-4 py-2 mt-2 text-white bg-blue-500 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Clear Data
        </button>
      </Show>

      <For each={messages()}>
        {m => (
          <div class="whitespace-pre-wrap">
            <strong>{`${m.role}: `}</strong>
            {m.content}
            <br />
            <Show when={m.annotations}>
              <strong>Annotations:</strong>
              <pre class="p-4 text-sm bg-gray-100">
                {JSON.stringify(m.annotations, null, 2)}
              </pre>
            </Show>
            <br />
            <br />
          </div>
        )}
      </For>

      <Show when={isLoading()}>
        <div class="mt-4 text-gray-500">
          <div>Loading...</div>
          <button
            type="button"
            class="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      </Show>

      <Show when={error()}>
        <div class="mt-4">
          <div class="text-red-500">An error occurred.</div>
          <button
            type="button"
            class="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={() => reload()}
          >
            Retry
          </button>
        </div>
      </Show>

      <form onSubmit={handleSubmit}>
        <input
          class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input()}
          placeholder="Say something..."
          onInput={handleInputChange}
        />
      </form>
    </div>
  );
}
