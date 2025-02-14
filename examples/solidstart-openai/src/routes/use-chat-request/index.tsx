/* eslint-disable @next/next/no-img-element */
import { For, Show } from 'solid-js';
import { useChat } from '@ai-sdk/solid';
import { createIdGenerator } from 'ai';

export default function Chat() {
  const {
    input,
    messages,
    handleInputChange,
    handleSubmit,
    status,
    error,
    stop,
    reload,
  } = useChat({
    api: '/api/use-chat-request',
    sendExtraMessageFields: true,
    generateId: createIdGenerator({ prefix: 'msgc', size: 16 }),

    experimental_prepareRequestBody({ messages }) {
      return {
        message: messages[messages.length - 1],
      };
    },
  });

  return (
    <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <div class="flex flex-col gap-2 p-2">
        <For each={messages()}>
          {message => (
            <div class="whitespace-pre-wrap">
              {message.role === 'user' ? 'User: ' : 'AI: '}
              {message.content}
            </div>
          )}
        </For>
      </div>

      <Show when={status() === 'submitted' || status() === 'streaming'}>
        <div class="mt-4 text-gray-500">
          <Show when={status() === 'submitted'}>
            <div>Loading...</div>
          </Show>
          <button
            type="button"
            class="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      </Show>

      {error() && (
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
      )}

      <form onSubmit={handleSubmit} class="fixed bottom-0 w-full max-w-md p-2">
        <input
          class="w-full p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input()}
          placeholder="Say something..."
          onInput={handleInputChange}
          disabled={status() !== 'ready'}
        />
      </form>
    </div>
  );
}
